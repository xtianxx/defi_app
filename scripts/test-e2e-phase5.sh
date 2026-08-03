#!/usr/bin/env bash
# test-e2e-phase5.sh — US3 (Liquidity Removal) e2e test loop.
# Usage: ./scripts/test-e2e-phase5.sh [--playwright|--dev]
#
#   (default)      anvil + DeployDemo + sync + US3 readiness gate (deployer LP > 0)
#   --playwright   also run Playwright filtered to remove-liquidity specs
#   --dev          anvil + deploy + sync + start `npm run dev` (no tests; manual UI)
#
# Why a US3-specific script (vs. test-e2e.sh):
#   Every US3 remove-liquidity case requires the connected wallet to hold LP. DeployDemo
#   seeds WETH/USDC + WETH/DAI LP to the deployer (account #0), so we gate on
#   `pair.balanceOf(deployer) > 0` and fail fast with a clear message if the seed is
#   missing — test-e2e.sh only checks WETH balance (swap-readiness), not LP. This script
#   also narrows the Playwright run to remove-liquidity specs so US3 iteration is fast.
#
# Mirrors scripts/test-e2e.sh structure. Anvil stays alive after success (frontend needs it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
FRONTEND="${ROOT}/frontend"

CHAIN_ID=31337
PORT=8545
RPC="http://127.0.0.1:${PORT}"
DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
BROADCAST_DIR="${CONTRACTS}/broadcast/DeployDemo.s.sol/${CHAIN_ID}"

# --- helpers ----------------------------------------------------------------
c_red()    { printf '\033[31m%s\033[0m\n' "$*"; }
c_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
step()     { printf '\n\033[36m▶ %s\033[0m\n' "$*"; }
ok()       { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
fail()     {
  printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2
  [[ -n "${ANVIL_PID:-}" ]] && kill "${ANVIL_PID}" 2>/dev/null || true
  exit 1
}

# --- parse mode -------------------------------------------------------------
MODE="seed"
[[ "${1:-}" == "--playwright" ]] && MODE="playwright"
[[ "${1:-}" == "--dev" ]] && MODE="dev"

# --- preflight --------------------------------------------------------------
step "Preflight checks (US3 e2e)"
command -v anvil >/dev/null 2>&1 || fail "anvil not found — run: curl -L https://foundry.paradigm.xyz | bash && foundryup"
command -v forge  >/dev/null 2>&1 || fail "forge not found"
command -v cast   >/dev/null 2>&1 || fail "cast not found"
command -v node   >/dev/null 2>&1 || fail "node not found (need ≥20)"
[[ -d "${CONTRACTS}/lib/forge-std" ]] || fail "forge-std missing — run: cd contracts && forge install"
ok "tools present"

# --- 1. start fresh anvil ---------------------------------------------------
step "Start anvil (chain ${CHAIN_ID}, port ${PORT})"
if pkill -f "anvil.*--port ${PORT}" 2>/dev/null; then
  ok "stopped previous anvil"
  sleep 1
fi
ANVIL_LOG="${ROOT}/.anvil.log"
anvil --chain-id "${CHAIN_ID}" --port "${PORT}" --host 127.0.0.1 > "${ANVIL_LOG}" 2>&1 &
ANVIL_PID=$!
ok "anvil started (pid ${ANVIL_PID})"
for i in $(seq 1 30); do
  if cast block-number --rpc-url "${RPC}" >/dev/null 2>&1; then
    ok "RPC ready at ${RPC}"
    break
  fi
  sleep 0.5
  [[ $i -eq 30 ]] && { tail -20 "${ANVIL_LOG}" >&2; fail "anvil not responding"; }
done

# --- 2. deploy contracts (DeployDemo seeds WETH/USDC + WETH/DAI LP) ---------
step "Deploy demo (DeployDemo.s.sol)"
(
  cd "${CONTRACTS}"
  forge build
  forge script script/DeployDemo.s.sol:DeployDemo \
    --rpc-url "${RPC}" \
    --broadcast \
    --slow \
    --private-key "${DEPLOYER_PK}" \
    -vvv 2>&1
) || fail "deploy failed — check output above"
ok "deploy complete"
[[ -f "${BROADCAST_DIR}/run-latest.json" ]] || fail "broadcast run-latest.json not found at ${BROADCAST_DIR}"

# --- 3. sync addresses into frontend ----------------------------------------
step "Sync addresses → frontend"
(
  cd "${FRONTEND}"
  node scripts/sync-deploy.ts "${CHAIN_ID}"
) || fail "sync-deploy.ts failed"
ok "addresses.ts + tokens.ts + abis synced"

# --- 4. US3 readiness gate: deployer LP balance > 0 --------------------------
# This is the US3-specific check that test-e2e.sh lacks. remove-liquidity cases are
# invalid without a seeded LP position, so fail fast with an actionable message.
step "US3 readiness: verify deployer LP balance > 0"

set +e
parse_addr() {
  node -e "
    const f = JSON.parse(require('fs').readFileSync('${BROADCAST_DIR}/run-latest.json','utf8'));
    const t = (f.transactions||[]).find(x => (x.contractName||'') === '${1}');
    process.stdout.write(t?.contractAddress ?? '');
  "
}

WETH_ADDR=$(parse_addr WETH9)
USDC_ADDR=$(parse_addr MockERC20)
# DeployDemo logs "PairWETHUSDC:" — but the broadcast may not capture the pair address
# as a contractName (createPair returns an address, not a CREATE2 deploy tx in the
# periphery sense). Resolve via Factory.getPair(WETH, USDC) on-chain instead.
FACTORY_ADDR=$(parse_addr UniswapV2Factory)

if [[ -z "${WETH_ADDR}" || -z "${USDC_ADDR}" || -z "${FACTORY_ADDR}" ]]; then
  set -e
  fail "could not resolve WETH9/USDC/Factory addresses from broadcast"
fi

PAIR_WETH_USDC=$(cast call --rpc-url "${RPC}" "${FACTORY_ADDR}" "getPair(address,address)(address)" "${WETH_ADDR}" "${USDC_ADDR}" 2>/dev/null | awk '{print $1}')
set -e

if [[ -z "${PAIR_WETH_USDC}" ]]; then
  fail "factory.getPair(WETH,USDC) returned empty — pair not created; check DeployDemo"
fi

LP_BAL=$(cast call --rpc-url "${RPC}" "${PAIR_WETH_USDC}" "balanceOf(address)(uint256)" "${DEPLOYER_ADDR}" 2>/dev/null | awk '{print $1}')
if [[ -z "${LP_BAL}" ]]; then
  fail "pair.balanceOf(deployer) call failed — RPC unavailable or pair has no balanceOf"
fi

is_positive() { awk -v n="${1}" 'BEGIN{exit !(n+0 > 0)}'; }
if is_positive "${LP_BAL}"; then
  ok "deployer LP balance on WETH/USDC: ${LP_BAL} (remove-liquidity ready)"
else
  fail "deployer LP balance is 0 — DeployDemo did not seed LP; US3 e2e cannot run. Re-run DeployDemo."
fi

# --- 5. Playwright (optional) -----------------------------------------------
if [[ "${MODE}" == "playwright" ]]; then
  step "Playwright E2E — remove-liquidity specs"
  (
    cd "${FRONTEND}"
    # Filter to remove-liquidity specs by filename convention (e.g. remove-liquidity.spec.ts).
    # If no matching spec exists yet, Playwright exits non-zero with "no tests found" —
    # surface that as a clear message rather than a generic failure.
    npx playwright test --grep-invert "add-liquidity|swap|portfolio" --reporter=list 2>&1 \
      || fail "Playwright run failed (or no remove-liquidity spec authored yet — see specs/001-uniswap-v2-resume/checklists/e2e-phase5.md)"
  ) || fail "Playwright E2E failed — check output above"
  ok "Playwright — remove-liquidity specs passing"
fi

# --- 6. dev server mode -----------------------------------------------------
if [[ "${MODE}" == "dev" ]]; then
  step "Starting dev server (Ctrl+C to stop)"
  trap 'kill ${ANVIL_PID} 2>/dev/null || true' INT TERM
  cd "${FRONTEND}" && npm run dev
fi

# --- summary ----------------------------------------------------------------
step "US3 e2e environment ready"
c_green "━━━ Phase 5 (US3) e2e loop complete ━━━"
c_green "  anvil        : ${RPC} (pid ${ANVIL_PID}, still running)"
c_green "  deployer     : ${DEPLOYER_ADDR}  (holds WETH/USDC + WETH/DAI LP)"
c_green "  WETH9         : ${WETH_ADDR}"
c_green "  PairWETHUSDC : ${PAIR_WETH_USDC}"
c_green "  LP balance   : ${LP_BAL}"
printf '\n'
c_cyan "Checklist: specs/001-uniswap-v2-resume/checklists/e2e-phase5.md"
if [[ "${MODE}" == "playwright" ]]; then
  c_cyan "Next: ./scripts/test-e2e-phase5.sh --dev   → manual UI at http://localhost:3000/liquidity"
else
  c_cyan "Next: ./scripts/test-e2e-phase5.sh --playwright   → run remove-liquidity specs"
  c_cyan "  or: ./scripts/test-e2e-phase5.sh --dev          → manual UI at http://localhost:3000/liquidity"
fi
printf '\n'