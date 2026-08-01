#!/usr/bin/env bash
# test-unit.sh — run all unit tests (contracts + frontend).
# Usage: ./scripts/test-unit.sh [--forge-only|--vitest-only|--watch]
#
# Default: runs both forge test and vitest.
#   --forge-only   only contracts (forge test -vvv)
#   --vitest-only  only frontend (vitest run)
#   --watch        run vitest in watch mode (TDD loop)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT}/contracts"
FRONTEND="${ROOT}/frontend"

MODE="${1:-all}"
echo "▶ test-unit.sh — ${MODE}"

# --- helpers ---
c_pass() { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }
c_fail() { printf '\033[31m  ✗ %s\033[0m\n' "$*"; }

run_forge() {
  printf '\n\033[36m▶ Contracts — forge test -vvv\033[0m\n'
  cd "${CONTRACTS}"
  forge test -vvv 2>&1 && c_pass "forge test — all passing" || {
    c_fail "forge test failed — check output above"
    return 1
  }
}

run_vitest() {
  printf '\n\033[36m▶ Frontend — vitest\033[0m\n'
  cd "${FRONTEND}"
  if [[ "${1:-}" == "--watch" ]]; then
    npx vitest
  else
    npx vitest run 2>&1
  fi
}

case "${MODE}" in
  --forge-only)
    run_forge
    ;;
  --vitest-only)
    run_vitest
    ;;
  --watch)
    printf '\n\033[36m▶ Frontend — vitest (watch mode)\033[0m\n'
    cd "${FRONTEND}" && npx vitest
    ;;
  all|*)
    run_forge || exit 1
    run_vitest || exit 1
    printf '\n\033[32m━━━ All tests pass ━━━\033[0m\n'
    ;;
esac
