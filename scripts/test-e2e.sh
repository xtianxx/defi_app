#!/usr/bin/env bash
# test-e2e.sh — full end-to-end test loop: anvil → deploy → sync → verify → test
# Usage: ./scripts/test-e2e.sh [--unit-only|--no-playwright|--dev]
#
#   (default)     anvil + deploy + forge test + vitest + playwright
#   --unit-only    anvil + deploy + forge test + vitest (skip Playwright)
#   --no-playwright same as --unit-only
#   --dev          anvil + deploy + sync + start dev server (no tests, just ready for manual testing)
#
# Always starts a fresh anvil, deploys the demo, syncs addresses to frontend,
# then runs tests. Anvil stays alive after completion (dev server mode or for
# manual testing).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --- helpers ----------------------------------------------------------------
c_red()    { printf '\033[31m%s\033[0m\n' "$*"; }
c_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
c_cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
step()     { printf '\n\033[36m▶ %s\033[0m\n' "$*"; }
ok()       { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
fail()     {
  printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2
  [[ -n "${ANVIL_PID:-}" ]] && kill "${ANVIL_PID}" 2>/dev/null || true
  exit 1
}

# --- parse mode -------------------------------------------------------------
MODE="full"
[[ "${1:-}" == "--unit-only" || "${1:-}" == "--no-playwright" ]] && MODE="unit"
[[ "${1:-}" == "--dev" ]] && MODE="dev"

CHAIN_ID=31337
PORT=8545
RPC="http://127.0.0.1:${PORT}"
DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
CONTRACTS="${ROOT}/contracts"
FRONTEND="${ROOT}/frontend"

# --- preflight --------------------------------------------------------------
step "Preflight checks"
command -v anvil >/dev/null 2>&1 || fail "anvil not found — run: curl -L https://foundry.paradigm.xyz | bash && foundryup"
command -v forge >/dev/null 2>&1 || fail "forge not found"
command -v node  >/dev/null 2>&1 || fail "node not found"
[[ -d "${CONTRACTS}/lib/forge-std" ]] || fail "forge-std missing — run: cd contracts && forge install"
ok "all tools present"

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

# --- 2. deploy contracts ----------------------------------------------------
step "Deploy contracts (DeployDemo.s.sol)"
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

# --- 3. sync to frontend ----------------------------------------------------
step "Sync addresses → frontend"
(
  cd "${FRONTEND}"
  node scripts/sync-deploy.ts "${CHAIN_ID}"
) || fail "sync-deploy.ts failed"
ok "addresses.ts + abis.ts synced"

# --- 4. run forge tests (against anvil for fork tests) ----------------------
step "Contracts — forge test"
(
  cd "${CONTRACTS}"
  forge test -vvv 2>&1
) || fail "forge test failed"
ok "forge test — all passing"

# --- 5. run vitest (unit tests, no anvil needed) ----------------------------
step "Frontend — vitest"
(
  cd "${FRONTEND}"
  npx vitest run 2>&1
) || fail "vitest failed"
ok "vitest — all passing"

# --- 6. Playwright E2E (if requested) ---------------------------------------
if [[ "${MODE}" == "full" ]]; then
  step "Frontend build (Next.js)"
  (
    cd "${FRONTEND}"
    npx tsc --noEmit 2>&1
    npm run build 2>&1
  ) || fail "Next.js build failed"
  ok "build succeeded"

  step "Playwright E2E tests (headless browser against anvil)"
  (
    cd "${FRONTEND}"
    # --reuseExistingServer: playwright starts its own npm run dev via webServer config
    npx playwright test --reporter=list 2>&1
  ) || fail "Playwright E2E failed — check output above"
  ok "Playwright E2E — all passing"
fi

# --- 7. dev server mode -----------------------------------------------------
if [[ "${MODE}" == "dev" ]]; then
  step "Starting dev server (Ctrl+C to stop)"
  trap 'kill ${ANVIL_PID} 2>/dev/null || true' INT TERM
  cd "${FRONTEND}" && npm run dev
  # unreachable — npm run dev runs until Ctrl+C
fi

# --- summary ----------------------------------------------------------------
step "All checks passed"
c_green "━━━ E2E test complete ━━━"
c_green "  anvil    : ${RPC} (pid ${ANVIL_PID}, still running)"
c_green "  deployer : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
printf '\n'
c_cyan "Multi-user test accounts (import into MetaMask):"
c_cyan "  #0 deployer   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  (WETH + USDC + DAI + LP)"
c_cyan "  #1 LP B       0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d  (USDC + DAI + WBTC)"
c_cyan "  #2 swapper    0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a  (WETH + USDC + DAI)"
printf '\n'
c_cyan "Next: ./scripts/test-e2e.sh --dev    → open browser at http://localhost:3000"
c_cyan "      ./scripts/test-unit.sh          → unit tests only (no anvil needed for vitest)"
printf '\n'
