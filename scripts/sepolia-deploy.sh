#!/usr/bin/env bash
# sepolia-deploy.sh — one-shot Sepolia demo deployment: preflight → simulate → broadcast → sync → summary.
# Usage: ./scripts/sepolia-deploy.sh
#
# Deploys DeployDemoSepolia.s.sol (Factory/Router02/WETH9/USDC/DAI/WBTC, seeds WETH/USDC +
# WETH/DAI pairs, funds the LP-provider + swapper demo accounts, deploys DemoFaucet with its
# initial WETH reserve), verifies on Etherscan, and syncs the broadcast addresses into the
# frontend (multi-chain sync-deploy.ts, argless).
#
# Secrets (SEPOLIA_RPC_URL / ETHERSCAN_API_KEY / SEPOLIA_DEPLOYER_KEY) are sourced from the
# gitignored contracts/.env and only ever referenced via variables — never printed, never
# committed. The deployer key is passed to forge for the SIMULATION too: without it forge
# uses an unfunded default sender and the dry-run fails with "lack of funds" (the simulation
# itself never broadcasts anything).
#
# NOTE: T017 will extend this file with subcommands (fund-demo-accounts, reseed-pools) —
# keep new steps as functions so dispatch can be added without restructuring.

set -euo pipefail

# --- config -----------------------------------------------------------------
SEPOLIA_CHAIN_ID=11155111
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
FRONTEND="${ROOT}/frontend"
ENV_FILE="${CONTRACTS}/.env"
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

# --- main (T017 will add subcommand dispatch here) -----------------------------
main() {
  preflight
  build_contracts
  simulate
  broadcast_deploy
  sync_frontend
  summary
  printf '\n'
  c_green "Sepolia demo deployment complete — frontend bindings synced."
}

main "$@"
