#!/usr/bin/env bash
# dev-deploy.sh — one-shot local dev environment: anvil → deploy → sync → verify.
# Usage: ./scripts/dev-deploy.sh [--dev]
#   --dev   also start `npm run dev` after sync (foreground; Ctrl+C stops everything).
#
# Restarts anvil on a clean state, deploys the demo (Factory/WETH9/Router02/4 tokens,
# seeds WETH/USDC + WETH/DAI pairs, retains deployer testing balance), syncs addresses
# into the frontend, and verifies the deployer can actually swap (WETH balance > 0).

set -euo pipefail

# --- config -----------------------------------------------------------------
CHAIN_ID=31337
PORT=8545
RPC="http://127.0.0.1:${PORT}"
# anvil account 0 (deterministic, 10000 ETH)
DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER_ADDR="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
FRONTEND="${ROOT}/frontend"
# Forge nests broadcasts under broadcast/<scriptName>/<chainId>/run-latest.json
BROADCAST_DIR="${CONTRACTS}/broadcast/DeployDemo.s.sol/${CHAIN_ID}"

# --- helpers ----------------------------------------------------------------
c_red()    { printf '\033[31m%s\033[0m\n' "$*"; }
c_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
c_cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
step()     { printf '\n\033[36m▶ %s\033[0m\n' "$*"; }
ok()       { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
# fail(): kill anvil (if we started it) then exit non-zero. We only kill on the
# failure path — on success anvil MUST stay alive so the frontend can connect.
fail()     { printf '\033[31m  ✗ %s\033[0m\n' "$*" >&2; [[ -n "${ANVIL_PID:-}" ]] && kill "${ANVIL_PID}" 2>/dev/null || true; exit 1; }

START_DEV=0
[[ "${1:-}" == "--dev" ]] && START_DEV=1

# --- preflight --------------------------------------------------------------
step "Preflight"
command -v anvil >/dev/null || fail "anvil not found — run: curl -L https://foundry.paradigm.xyz | bash && foundryup"
command -v forge >/dev/null || fail "forge not found"
command -v cast  >/dev/null || fail "cast not found"
command -v node  >/dev/null || fail "node not found (need ≥20)"
[[ -d "${CONTRACTS}/lib/forge-std" ]] || fail "forge-std missing — run: cd contracts && forge install"
ok "tools present"

# --- 1. restart anvil -------------------------------------------------------
step "Restart anvil (chain ${CHAIN_ID}, port ${PORT})"

# kill anything bound to the port (previous anvil / stale process)
if pkill -f "anvil.*--port ${PORT}" 2>/dev/null || lsof -ti :${PORT} 2>/dev/null | xargs -r kill 2>/dev/null; then
  ok "stopped previous anvil"
  sleep 1
fi

# start fresh anvil in background, log to file
ANVIL_LOG="${ROOT}/.anvil.log"
anvil --chain-id ${CHAIN_ID} --port ${PORT} --host 127.0.0.1 > "${ANVIL_LOG}" 2>&1 &
ANVIL_PID=$!
ok "anvil started (pid ${ANVIL_PID}, log: .anvil.log)"

# wait for RPC to respond (max ~15s)
for i in $(seq 1 30); do
  if cast block-number --rpc-url "${RPC}" >/dev/null 2>&1; then
    ok "RPC ready at ${RPC}"
    break
  fi
  sleep 0.5
  [[ $i -eq 30 ]] && { tail -20 "${ANVIL_LOG}" >&2; fail "anvil did not become ready"; }
done

# NOTE: we intentionally do NOT `trap ... EXIT` to kill anvil here. A blanket
# EXIT trap fires on successful exit too, which would tear down anvil the
# instant the script prints "ready to swap" — leaving the frontend with no RPC
# to connect to (the exact "swap fails / can't transact" symptom). Instead:
#   - On failure paths, `fail()` kills anvil explicitly.
#   - In --dev mode, the foreground `npm run dev` owns the process group;
#     Ctrl+C tears down both anvil and the dev server via the trap below.
#   - In default mode, anvil stays alive after the script returns so the
#     frontend can connect and the user can actually swap.

# --- 2. deploy demo ----------------------------------------------------------
step "Deploy demo (DeployDemo.s.sol)"
(
  cd "${CONTRACTS}"
  forge build
  # --slow: send txs one at a time, waiting for each receipt before the next.
  # Without it, forge's broadcast stage can fail with an EIP-1559 fee-estimation
  # timeout against anvil (the simulation succeeds and logs reserves, but the
  # contracts never actually deploy on-chain — leaving the frontend pointing at
  # empty addresses). --slow forces sequential, receipt-confirmed broadcast.
  forge script script/DeployDemo.s.sol:DeployDemo \
    --rpc-url "${RPC}" \
    --broadcast \
    --slow \
    --private-key "${DEPLOYER_PK}" \
    -vvv
) || fail "forge script failed — check output above"
ok "demo deployed"

[[ -f "${BROADCAST_DIR}/run-latest.json" ]] || fail "broadcast run-latest.json not found at ${BROADCAST_DIR}"

# --- 3. sync addresses into frontend ----------------------------------------
# sync-deploy.ts scans broadcast/<scriptName>/<chainId>/ automatically; it ignores
# argv (chainIds are hardcoded). We pass the chainId for documentation only.
step "Sync addresses → frontend"
(
  cd "${FRONTEND}"
  node scripts/sync-deploy.ts "${CHAIN_ID}"
) || fail "sync-deploy.ts failed"
ok "addresses.ts + abis.ts regenerated"

# --- 4. verify deployer balance (the fix validation) ------------------------
step "Verify deployer testing balance"

# Parse deployed contract addresses from the broadcast JSON (valid JSON, no TS involved).
# NOTE: run under `set +e` so a cast/RPC hiccup doesn't abort the whole script + kill anvil.
set +e
parse_addr() {
  node -e "
    const f = JSON.parse(require('fs').readFileSync('${BROADCAST_DIR}/run-latest.json','utf8'));
    const t = (f.transactions||[]).find(x => (x.contractName||'') === '${1}');
    process.stdout.write(t?.contractAddress ?? '');
  "
}

WETH_ADDR=$(parse_addr WETH9)

if [[ -z "${WETH_ADDR}" ]]; then
  set -e
  fail "could not resolve WETH9 address from broadcast"
fi

# Query deployer WETH balance via cast. Capture raw wei, then convert to ether.
WETH_BAL_WEI=$(cast call --rpc-url "${RPC}" "${WETH_ADDR}" "balanceOf(address)(uint256)" "${DEPLOYER_ADDR}" 2>/dev/null | awk '{print $1}')
WETH_BAL_ETH=$(cast --to-unit "${WETH_BAL_WEI:-0}" ether 2>/dev/null | awk '{print $1}')
set -e

# awk float comparison (more reliable than bc across distros)
is_positive() { awk -v n="${1}" 'BEGIN{exit !(n+0 > 0)}'; }

if [[ -n "${WETH_BAL_ETH}" ]] && is_positive "${WETH_BAL_ETH}"; then
  ok "deployer WETH balance: ${WETH_BAL_ETH} WETH (swap-ready)"
else
  fail "deployer WETH balance is 0 — the fix did not apply; check DeployDemo.s.sol"
fi

# --- summary ----------------------------------------------------------------
step "Done — ready to swap"
c_green "  anvil     : ${RPC} (pid ${ANVIL_PID})"
c_green "  deployer  : ${DEPLOYER_ADDR}"
c_green "  WETH9     : ${WETH_ADDR}"
c_green "  WETH bal  : ${WETH_BAL_ETH}"
c_green "  log       : .anvil.log"

if [[ ${START_DEV} -eq 1 ]]; then
  step "Starting frontend dev server (Ctrl+C stops anvil + dev)"
  # Only in --dev mode do we own anvil's lifecycle: Ctrl+C (SIGINT) should tear
  # down both the dev server and anvil. Default mode leaves anvil running.
  trap 'kill ${ANVIL_PID} 2>/dev/null || true' INT TERM
  cd "${FRONTEND}"
  npm run dev
else
  printf '\n'
  c_cyan "Next: cd frontend && npm run dev"
  c_cyan "Then: http://localhost:3000/swap  (MetaMask → anvil chainId ${CHAIN_ID}, import deployer key)"
  printf '  Deployer private key:\n  %s\n\n' "${DEPLOYER_PK}"
fi