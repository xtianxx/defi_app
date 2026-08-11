#!/usr/bin/env bash
# sepolia-deploy.sh — one-shot Sepolia demo deployment: preflight → simulate → broadcast → sync → summary.
# Usage: ./scripts/sepolia-deploy.sh [subcommand]
#
# Deploys DeployDemoSepolia.s.sol (Factory/Router02/WETH9/USDC/DAI/WBTC, seeds WETH/USDC +
# WETH/DAI pairs, funds the LP-provider + swapper demo accounts, deploys DemoFaucet with its
# initial WETH reserve), verifies on Etherscan, and syncs the broadcast addresses into the
# frontend (multi-chain sync-deploy.ts, argless).
#
# Subcommands (post-deploy maintenance — require the broadcast JSON from a full run):
#   fund-demo-accounts   top up the two demo accounts from the master key: 0.02 ETH gas +
#                        USDC/DAI/WBTC mints + 0.01 WETH wrap-and-transfer each. Additive —
#                        safe to re-run.
#   reseed-pools         restore the WETH/USDC + WETH/DAI seed reserves and refill the
#                        faucet WETH reserve (transfer-only top-ups, no LP mint).
#
# Secrets (SEPOLIA_RPC_URL / ETHERSCAN_API_KEY / SEPOLIA_DEPLOYER_KEY) are sourced from the
# gitignored contracts/.env and only ever referenced via variables — never printed, never
# committed. The deployer key is passed to forge for the SIMULATION too: without it forge
# uses an unfunded default sender and the dry-run fails with "lack of funds" (the simulation
# itself never broadcasts anything).

set -euo pipefail

# --- config -----------------------------------------------------------------
SEPOLIA_CHAIN_ID=11155111
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
FRONTEND="${ROOT}/frontend"
ENV_FILE="${CONTRACTS}/.env"
# Demo accounts (testnet-public; DeployDemoSepolia.s.sol constants — demo-guide.md, T002).
LP_PROVIDER=0x55a5818d1F4b21C5D2F4b898Ff986cA29934A984
SWAPPER=0x61e223dA8bafd9f39e749685CB7653Cf1C3b8096
# Forge nests broadcasts under broadcast/<scriptName>/<chainId>/run-latest.json
BROADCAST_DIR="${CONTRACTS}/broadcast/DeployDemoSepolia.s.sol/${SEPOLIA_CHAIN_ID}"
DEPLOY_LOG="${ROOT}/.sepolia-deploy.log"

# --- helpers ----------------------------------------------------------------
c_red()    { printf '\033[31m%s\033[0m\n' "$*"; }
c_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
c_cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
step()     { printf '\n\033[36m▶ %s\033[0m\n' "$*"; }
ok()       { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
fail()     { printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }
# Raw uint → human-readable decimal (no dependence on cast unit-name support).
fmt_units() { awk -v v="${1:-0}" -v d="${2:-18}" 'BEGIN{printf "%.6f", v/(10^d)}'; }

# --- preflight ---------------------------------------------------------------
preflight() {
  step "Preflight"

  # 1. Load contracts/.env (gitignored — secrets never inline in this script).
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
    ok "sourced ${ENV_FILE}"
  else
    fail "contracts/.env not found — copy contracts/.env.example and fill in SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, SEPOLIA_DEPLOYER_KEY"
  fi

  # 2. Required variables (values never echoed).
  [[ -n "${SEPOLIA_RPC_URL:-}" ]]     || fail "SEPOLIA_RPC_URL not set in ${ENV_FILE}"
  [[ -n "${ETHERSCAN_API_KEY:-}" ]]   || fail "ETHERSCAN_API_KEY not set in ${ENV_FILE}"
  [[ -n "${SEPOLIA_DEPLOYER_KEY:-}" ]] || fail "SEPOLIA_DEPLOYER_KEY not set in ${ENV_FILE}"
  ok "env vars present (values kept private)"

  # 3. Tools.
  command -v forge >/dev/null || fail "forge not found — run: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  command -v cast  >/dev/null || fail "cast not found"
  command -v node  >/dev/null || fail "node not found (need ≥20)"
  [[ -d "${CONTRACTS}/lib/forge-std" ]] || fail "forge-std missing — run: cd contracts && forge install"
  ok "tools present"

  # 4. Master balance ≥ 0.55 ETH — ÷1000-scaled Sepolia seed constants need ~0.5 ETH
  #    wrapped into WETH (pools 0.2 + deployer 0.05 + demo 0.02 + faucet reserve 0.2)
  #    plus deploy gas (~0.02) and demo-account gas transfers (0.04).
  MASTER_ADDR=$(cast wallet address --private-key "${SEPOLIA_DEPLOYER_KEY}" 2>/dev/null) \
    || fail "could not derive master address from SEPOLIA_DEPLOYER_KEY"
  MASTER_BAL_WEI=$(cast balance --rpc-url "${SEPOLIA_RPC_URL}" "${MASTER_ADDR}" 2>/dev/null) \
    || fail "could not read master balance from SEPOLIA_RPC_URL — is the RPC reachable?"
  MASTER_BAL_ETH=$(cast --to-unit "${MASTER_BAL_WEI:-0}" ether 2>/dev/null | awk '{print $1}')
  if awk -v b="${MASTER_BAL_ETH:-0}" 'BEGIN{exit !(b+0 >= 0.55)}'; then
    ok "master ${MASTER_ADDR} balance: ${MASTER_BAL_ETH} ETH (≥ 0.55 ETH)"
  else
    fail "master ${MASTER_ADDR} balance is ${MASTER_BAL_ETH} ETH — need ≥ 0.55 ETH (÷1000-scale deploy wraps ~0.5 ETH into WETH); fund via public Sepolia faucets (research.md R0.1, T003)"
  fi
}

# --- 1. build -----------------------------------------------------------------
build_contracts() {
  step "Build contracts"
  (cd "${CONTRACTS}" && forge build) || fail "forge build failed — fix before deploying"
  ok "build clean"
}

# --- 2. dry-run simulation (no --broadcast: verifies the script executes against
#       live Sepolia state before spending gas — Constitution pre-deployment checklist) ---
simulate() {
  step "Dry-run simulation against live Sepolia (no broadcast)"
  (
    cd "${CONTRACTS}"
    forge script script/DeployDemoSepolia.s.sol:DeployDemoSepolia \
      --rpc-url "${SEPOLIA_RPC_URL}" \
      --private-key "${SEPOLIA_DEPLOYER_KEY}" \
      -vvv
  ) || fail "simulation failed — fix DeployDemoSepolia.s.sol before spending gas"
  ok "simulation succeeded (nothing broadcast)"
}

# --- 3. broadcast + verify ----------------------------------------------------
broadcast_deploy() {
  step "Broadcast deployment + verify on Etherscan"
  (
    cd "${CONTRACTS}"
    # --slow: send txs one at a time, waiting for each receipt. Without it, forge's
    # broadcast can fail with EIP-1559 fee-estimation timeouts (repo gotcha) and the
    # contracts never actually deploy.
    forge script script/DeployDemoSepolia.s.sol:DeployDemoSepolia \
      --rpc-url "${SEPOLIA_RPC_URL}" \
      --broadcast \
      --private-key "${SEPOLIA_DEPLOYER_KEY}" \
      --verify \
      --etherscan-api-key "${ETHERSCAN_API_KEY}" \
      --slow \
      -vvv 2>&1 | tee "${DEPLOY_LOG}"
  ) || fail "broadcast failed — check output above"
  ok "deployment broadcast + verification submitted"

  [[ -f "${BROADCAST_DIR}/run-latest.json" ]] \
    || fail "broadcast run-latest.json not found at ${BROADCAST_DIR}"
}

# --- 4. sync addresses into frontend -------------------------------------------
sync_frontend() {
  step "Sync addresses → frontend"
  (cd "${FRONTEND}" && node scripts/sync-deploy.ts) || fail "sync-deploy.ts failed"
  ok "addresses.ts + tokens.ts regenerated (multi-chain)"
}

# --- 5. summary table -----------------------------------------------------------
summary() {
  step "Deployed addresses (Sepolia chain ${SEPOLIA_CHAIN_ID})"

  # All deployments (contractName + address) from the broadcast JSON, in deploy order.
  local deployments
  deployments=$(node -e "
    const f = JSON.parse(require('fs').readFileSync('${BROADCAST_DIR}/run-latest.json','utf8'));
    for (const t of (f.transactions||[])) {
      if (t.contractName && t.contractAddress) console.log(t.contractName + ' ' + t.contractAddress);
    }
  ") || fail "could not parse ${BROADCAST_DIR}/run-latest.json"

  # Resolve on-chain symbol for ERC20-ish deployments (labels the 3 MockERC20s).
  symbol_of() {
    cast call --rpc-url "${SEPOLIA_RPC_URL}" "$1" "symbol()(string)" 2>/dev/null \
      | tr -d '\0' || true
  }

  # Verification status via Etherscan (V2 endpoint works with v1 and v2 keys).
  is_verified() {
    local res
    res=$(curl -sf --max-time 15 \
      "https://api.etherscan.io/v2/api?chainid=${SEPOLIA_CHAIN_ID}&module=contract&action=getabi&address=${1}&apikey=${ETHERSCAN_API_KEY}" 2>/dev/null || true)
    [[ "${res}" == *'"status":"1"'* ]]
  }

  local name addr sym line
  printf '  %-16s %-46s %-10s %s\n' "CONTRACT" "ADDRESS" "SYMBOL" "VERIFIED"
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    name="${line%% *}"
    addr="${line##* }"
    sym="$(symbol_of "${addr}")"
    if is_verified "${addr}"; then
      printf '  %-16s %-46s %-10s %s\n' "${name}" "${addr}" "${sym}" "✓"
    else
      printf '  %-16s %-46s %-10s %s\n' "${name}" "${addr}" "${sym}" "✗ (see T014)"
    fi
    sleep 0.3
  done <<< "${deployments}"

  # Pairs are CREATE2'd via factory.createPair (calls, not deployments) — read live.
  local factory_addr pair0 pair1
  factory_addr=$(node -e "
    const f = JSON.parse(require('fs').readFileSync('${BROADCAST_DIR}/run-latest.json','utf8'));
    const t = (f.transactions||[]).find(x => x.contractName === 'UniswapV2Factory');
    process.stdout.write(t?.contractAddress ?? '');
  ")
  if [[ -n "${factory_addr}" ]]; then
    pair0=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${factory_addr}" "allPairs(uint256)(address)" 0 2>/dev/null || true)
    pair1=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${factory_addr}" "allPairs(uint256)(address)" 1 2>/dev/null || true)
    [[ -n "${pair0}" ]] && printf '  %-16s %-46s %-10s %s\n' "PairWETHUSDC" "${pair0}" "$(symbol_of "${pair0}")" "-"
    [[ -n "${pair1}" ]] && printf '  %-16s %-46s %-10s %s\n' "PairWETHDAI" "${pair1}" "$(symbol_of "${pair1}")" "-"
  fi

  printf '\n'
  c_green "  master  : ${MASTER_ADDR}"
  c_green "  log     : ${DEPLOY_LOG}"
  c_yellow "  Any '✗ (see T014)' rows: run T014 verification fallback (forge verify-contract) — or re-run this script."
}

# --- T017: broadcast JSON helpers ------------------------------------------------
# First address in the last broadcast with the given contractName ('' if absent).
broadcast_addr() { # $1=contractName as recorded in the broadcast JSON
  local name="${1:?broadcast_addr: missing contractName}"
  [[ -f "${BROADCAST_DIR}/run-latest.json" ]] \
    || fail "no broadcast at ${BROADCAST_DIR}/run-latest.json — run the full deploy first (./scripts/sepolia-deploy.sh)"
  node -e "
    const f = JSON.parse(require('fs').readFileSync('${BROADCAST_DIR}/run-latest.json','utf8'));
    const t = (f.transactions||[]).find(x => x.contractName === '${name}' && x.contractAddress);
    process.stdout.write(t?.contractAddress ?? '');
  " 2>/dev/null || true
}

# The three MockERC20 deployments (USDC, DAI, WBTC — DeployDemoSepolia.s.sol deploy
# order), one address per line. Mint calls reference the same addresses later, so
# dedupe by first occurrence.
mockerc20_addrs() {
  [[ -f "${BROADCAST_DIR}/run-latest.json" ]] \
    || fail "no broadcast at ${BROADCAST_DIR}/run-latest.json — run the full deploy first (./scripts/sepolia-deploy.sh)"
  node -e "
    const f = JSON.parse(require('fs').readFileSync('${BROADCAST_DIR}/run-latest.json','utf8'));
    const seen = new Set();
    for (const t of (f.transactions||[])) {
      if (t.contractName === 'MockERC20' && t.contractAddress && !seen.has(t.contractAddress)) {
        seen.add(t.contractAddress);
        console.log(t.contractAddress);
      }
    }
  " 2>/dev/null || true
}

# --- T017: light preflight for the maintenance subcommands -----------------------
# Env + cast/node + master balance ≥ 0.05 ETH. Deliberately NOT the full preflight()
# gate (0.55 ETH + forge + forge-std): maintenance should not require a full-deploy
# budget. MASTER_ADDR / MASTER_BAL_* are set here for the subcommand's lifetime.
subcommand_preflight() {
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
  else
    fail "contracts/.env not found — copy contracts/.env.example and fill in SEPOLIA_RPC_URL, ETHERSCAN_API_KEY, SEPOLIA_DEPLOYER_KEY"
  fi
  [[ -n "${SEPOLIA_RPC_URL:-}" ]]     || fail "SEPOLIA_RPC_URL not set in ${ENV_FILE}"
  [[ -n "${SEPOLIA_DEPLOYER_KEY:-}" ]] || fail "SEPOLIA_DEPLOYER_KEY not set in ${ENV_FILE}"
  ok "env vars present (values kept private)"
  command -v cast >/dev/null || fail "cast not found — run: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  command -v node >/dev/null || fail "node not found (need ≥20 — used for broadcast parsing + bigint math)"
  ok "tools present"

  MASTER_ADDR=$(cast wallet address --private-key "${SEPOLIA_DEPLOYER_KEY}" 2>/dev/null) \
    || fail "could not derive master address from SEPOLIA_DEPLOYER_KEY"
  MASTER_BAL_WEI=$(cast balance --rpc-url "${SEPOLIA_RPC_URL}" "${MASTER_ADDR}" 2>/dev/null) \
    || fail "could not read master balance from ${SEPOLIA_RPC_URL} — is the RPC reachable?"
  MASTER_BAL_ETH=$(cast --to-unit "${MASTER_BAL_WEI:-0}" ether 2>/dev/null | awk '{print $1}')
  if awk -v b="${MASTER_BAL_ETH:-0}" 'BEGIN{exit !(b+0 >= 0.05)}'; then
    ok "master ${MASTER_ADDR} balance: ${MASTER_BAL_ETH} ETH (≥ 0.05 ETH)"
  else
    fail "master ${MASTER_ADDR} balance is ${MASTER_BAL_ETH} ETH — need ≥ 0.05 ETH; fund via public Sepolia faucets (research.md R0.1, T003)"
  fi
}

# --- T017: top-up helpers (transfer-only reseeding) -------------------------------
# If ${current} < ${target}: wrap + transfer the missing WETH from master to ${dest}.
# No-op when already at/above target. Bigint math via node — bash int64 overflows at
# ~9.2e18 and DAI targets are 200e18.
top_up_weth() { # $1=target wei, $2=current wei, $3=dest, $4=label
  local target="${1:?}" current="${2:-0}" dest="${3:?}" label="${4:?}" missing
  missing=$(node -e "
    const t = BigInt('${target}'), c = BigInt('${current}');
    process.stdout.write(c >= t ? '0' : String(t - c));
  ") || fail "could not compute WETH top-up for ${label}"
  if [[ "${missing}" == "0" ]]; then
    ok "${label}: already at target (${current} ≥ ${target}) — nothing to do"
    return 0
  fi
  ok "${label}: topping up ${missing} wei (current ${current} → target ${target})"
  # WETH has no mint (R0.4) — wrap the missing amount from master ETH, then transfer.
  cast send "${weth}" "deposit()" --value "${missing}" --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
    || fail "WETH wrap failed for ${label}"
  cast send "${weth}" "transfer(address,uint256)" "${dest}" "${missing}" --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
    || fail "WETH transfer failed for ${label}"
}

# If ${current} < ${target}: mint + transfer the missing MockERC20 to ${dest} (open
# mint on the mock; master mints, then transfers). No-op when already at/above target.
top_up_token() { # $1=token addr, $2=target raw, $3=current raw, $4=dest, $5=label
  local tok="${1:?}" target="${2:?}" current="${3:-0}" dest="${4:?}" label="${5:?}" missing
  missing=$(node -e "
    const t = BigInt('${target}'), c = BigInt('${current}');
    process.stdout.write(c >= t ? '0' : String(t - c));
  ") || fail "could not compute top-up for ${label}"
  if [[ "${missing}" == "0" ]]; then
    ok "${label}: already at target (${current} ≥ ${target}) — nothing to do"
    return 0
  fi
  ok "${label}: topping up ${missing} wei (current ${current} → target ${target})"
  cast send "${tok}" "mint(address,uint256)" "${MASTER_ADDR}" "${missing}" --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
    || fail "mint failed for ${label}"
  cast send "${tok}" "transfer(address,uint256)" "${dest}" "${missing}" --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
    || fail "transfer failed for ${label}"
}

# --- T017: fund-demo-accounts -----------------------------------------------------
# Top up the two demo accounts (LP provider + swapper) from the master key:
# 0.02 ETH gas + 20 USDC + 20 DAI + 0.2 WBTC (MockERC20 mints) + 0.01 WETH
# (wrap ETH → WETH9, then transfer — WETH has no mint). All transfers are additive —
# the subcommand is safe to re-run.
fund_demo_accounts() {
  step "Fund demo accounts (LP provider + swapper)"
  subcommand_preflight

  # 1. Token/WETH addresses from the last broadcast. The three MockERC20 deployments
  #    are USDC, DAI, WBTC in deploy order (DeployDemoSepolia.s.sol); mint calls
  #    reference the same addresses, so take the first occurrence of each.
  local tok_addrs usdc dai wbtc weth i addr
  tok_addrs=$(mockerc20_addrs) || true
  i=0
  while IFS= read -r addr; do
    [[ -z "${addr}" ]] && continue
    case "${i}" in
      0) usdc="${addr}" ;;
      1) dai="${addr}" ;;
      2) wbtc="${addr}" ;;
    esac
    i=$((i + 1))
  done <<< "${tok_addrs}"
  weth=$(broadcast_addr WETH9)
  [[ -n "${usdc}" && -n "${dai}" && -n "${wbtc}" && -n "${weth}" ]] \
    || fail "could not resolve USDC/DAI/WBTC/WETH from ${BROADCAST_DIR}/run-latest.json — run the full deploy first"
  ok "addresses resolved (weth=${weth} usdc=${usdc} dai=${dai} wbtc=${wbtc})"

  # 2. Fund each account (amounts = DeployDemoSepolia.s.sol ÷1000 constants).
  local acct
  for acct in "${LP_PROVIDER}" "${SWAPPER}"; do
    step "Funding ${acct}"

    # a. Gas ETH (DEMO_ACCOUNT_ETH = 0.02 ether).
    cast send "${acct}" --value 0.02ether --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
      || fail "ETH transfer to ${acct} failed"

    # b. Tokens — MockERC20 has an open mint (TESTER_USDC = 20e6, TESTER_TOKEN = 20e18,
    #    WBTC uses the TESTER_USDC amount at 8 decimals = 0.2 WBTC).
    cast send "${usdc}" "mint(address,uint256)" "${acct}" 20000000 --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
      || fail "USDC mint to ${acct} failed"
    cast send "${dai}" "mint(address,uint256)" "${acct}" 20000000000000000000 --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
      || fail "DAI mint to ${acct} failed"
    cast send "${wbtc}" "mint(address,uint256)" "${acct}" 20000000 --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
      || fail "WBTC mint to ${acct} failed"

    # c. WETH — no mint (R0.4): wrap 0.01 ETH, then transfer (TESTER_WETH = 0.01 ether).
    cast send "${weth}" "deposit()" --value 0.01ether --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
      || fail "WETH wrap failed"
    cast send "${weth}" "transfer(address,uint256)" "${acct}" 10000000000000000 --rpc-url "${SEPOLIA_RPC_URL}" --private-key "${SEPOLIA_DEPLOYER_KEY}" >/dev/null \
      || fail "WETH transfer to ${acct} failed"

    # 3. Per-account balance summary (read-only).
    local eth bal_weth bal_usdc bal_dai bal_wbtc
    eth=$(cast balance --rpc-url "${SEPOLIA_RPC_URL}" "${acct}" 2>/dev/null || true)
    bal_weth=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${weth}" "balanceOf(address)(uint256)" "${acct}" 2>/dev/null || true)
    bal_usdc=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${usdc}" "balanceOf(address)(uint256)" "${acct}" 2>/dev/null || true)
    bal_dai=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${dai}" "balanceOf(address)(uint256)" "${acct}" 2>/dev/null || true)
    bal_wbtc=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${wbtc}" "balanceOf(address)(uint256)" "${acct}" 2>/dev/null || true)
    ok "balances: ETH=$(fmt_units "${eth:-0}" 18) · WETH=$(fmt_units "${bal_weth:-0}" 18) · USDC=$(fmt_units "${bal_usdc:-0}" 6) · DAI=$(fmt_units "${bal_dai:-0}" 18) · WBTC=$(fmt_units "${bal_wbtc:-0}" 8)"
  done

  c_green "  demo accounts funded — additive top-ups, safe to re-run."
}

# --- T017: reseed-pools -------------------------------------------------------------
# Restore the WETH/USDC + WETH/DAI seed reserves and refill the faucet WETH reserve.
# Pure transfer top-ups (no UniswapV2Pair.mint — LP shares untouched); both legs of
# each pair are topped proportionally, so the ~2000 USDC/WETH price holds. Requires
# the initial deploy to have run (broadcast JSON) and master ETH for the WETH wraps.
reseed_pools() {
  step "Reseed pools (WETH/USDC + WETH/DAI) + faucet WETH reserve"
  subcommand_preflight

  # 1. Addresses from the last broadcast: factory/WETH9/faucet by name, tokens by
  #    MockERC20 deploy order (USDC, DAI, WBTC — first occurrence each).
  local tok_addrs usdc dai weth factory faucet i addr
  tok_addrs=$(mockerc20_addrs) || true
  i=0
  while IFS= read -r addr; do
    [[ -z "${addr}" ]] && continue
    case "${i}" in
      0) usdc="${addr}" ;;
      1) dai="${addr}" ;;
    esac
    i=$((i + 1))
  done <<< "${tok_addrs}"
  weth=$(broadcast_addr WETH9)
  factory=$(broadcast_addr UniswapV2Factory)
  faucet=$(broadcast_addr DemoFaucet)
  [[ -n "${usdc}" && -n "${dai}" && -n "${weth}" && -n "${factory}" && -n "${faucet}" ]] \
    || fail "could not resolve addresses from ${BROADCAST_DIR}/run-latest.json — run the full deploy first"
  ok "addresses resolved (factory=${factory} weth=${weth} usdc=${usdc} dai=${dai} faucet=${faucet})"

  # 2. Pairs are CREATE2'd via factory.createPair (calls, not deployments) — read
  #    live. allPairs(0) = WETH/USDC, allPairs(1) = WETH/DAI (creation order, same
  #    labeling as summary()).
  local pair0 pair1
  pair0=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${factory}" "allPairs(uint256)(address)" 0 2>/dev/null || true)
  pair1=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${factory}" "allPairs(uint256)(address)" 1 2>/dev/null || true)
  [[ -n "${pair0}" && -n "${pair1}" ]] || fail "could not read pairs from factory ${factory}"

  #    Sanity: WETH must be token0 in both pairs (so reserve0 is the WETH leg).
  local t0
  t0=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${pair0}" "token0()(address)" 2>/dev/null || true)
  [[ "${t0}" == "${weth}" ]] || fail "pair ${pair0}: token0=${t0} ≠ WETH ${weth} — refusing to reseed the wrong leg"
  t0=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${pair1}" "token0()(address)" 2>/dev/null || true)
  [[ "${t0}" == "${weth}" ]] || fail "pair ${pair1}: token0=${t0} ≠ WETH ${weth} — refusing to reseed the wrong leg"

  # 3. Current state (before).
  local reserves r0 r1 d0 d1 faucet_bal
  reserves=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${pair0}" "getReserves()(uint112,uint112,uint32)" 2>/dev/null || true)
  read -r r0 r1 _ <<< "${reserves}"
  reserves=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${pair1}" "getReserves()(uint112,uint112,uint32)" 2>/dev/null || true)
  read -r d0 d1 _ <<< "${reserves}"
  faucet_bal=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${weth}" "balanceOf(address)(uint256)" "${faucet}" 2>/dev/null || true)
  ok "before: WETH/USDC=$(fmt_units "${r0:-0}" 18) WETH / $(fmt_units "${r1:-0}" 6) USDC · WETH/DAI=$(fmt_units "${d0:-0}" 18) WETH / $(fmt_units "${d1:-0}" 18) DAI · faucet=$(fmt_units "${faucet_bal:-0}" 18) WETH"

  # 4. Top up each leg toward the seed targets (÷1000 constants from
  #    DeployDemoSepolia.s.sol). WETH legs are wrapped from master ETH first (no
  #    mint — R0.4); token legs are minted (open mint) then transferred.
  top_up_weth 100000000000000000 "${r0:-0}" "${pair0}" "WETH/USDC WETH leg (target 0.1 WETH)"
  top_up_token "${usdc}" 200000000 "${r1:-0}" "${pair0}" "WETH/USDC USDC leg (target 200 USDC)"
  top_up_weth 100000000000000000 "${d0:-0}" "${pair1}" "WETH/DAI WETH leg (target 0.1 WETH)"
  top_up_token "${dai}" 200000000000000000000 "${d1:-0}" "${pair1}" "WETH/DAI DAI leg (target 200 DAI)"
  top_up_weth 200000000000000000 "${faucet_bal:-0}" "${faucet}" "faucet WETH reserve (target 0.2 WETH)"

  # 5. After summary (read-only).
  reserves=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${pair0}" "getReserves()(uint112,uint112,uint32)" 2>/dev/null || true)
  read -r r0 r1 _ <<< "${reserves}"
  reserves=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${pair1}" "getReserves()(uint112,uint112,uint32)" 2>/dev/null || true)
  read -r d0 d1 _ <<< "${reserves}"
  faucet_bal=$(cast call --rpc-url "${SEPOLIA_RPC_URL}" "${weth}" "balanceOf(address)(uint256)" "${faucet}" 2>/dev/null || true)
  ok "after:  WETH/USDC=$(fmt_units "${r0:-0}" 18) WETH / $(fmt_units "${r1:-0}" 6) USDC · WETH/DAI=$(fmt_units "${d0:-0}" 18) WETH / $(fmt_units "${d1:-0}" 18) DAI · faucet=$(fmt_units "${faucet_bal:-0}" 18) WETH"
  c_green "  reseed complete — seed reserves restored, faucet refilled."
}

# --- main ---------------------------------------------------------------------
main() {
  case "${1:-}" in
    fund-demo-accounts) fund_demo_accounts ;;
    reseed-pools)       reseed_pools ;;
    *)
      preflight
      build_contracts
      simulate
      broadcast_deploy
      sync_frontend
      summary
      printf '\n'
      c_green "Sepolia demo deployment complete — frontend bindings synced."
      ;;
  esac
}

main "$@"
