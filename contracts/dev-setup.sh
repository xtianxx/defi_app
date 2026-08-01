#!/usr/bin/env bash
# dev-setup.sh — one-shot local anvil deployment + frontend address sync.
# Prerequisite: anvil running on http://127.0.0.1:8545 (run `anvil` in another terminal).
# Usage: ./dev-setup.sh
set -euo pipefail

RPC_URL="http://127.0.0.1:8545"
# Anvil default account 0 (10000 ETH)
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> 1/3 Deploying contracts + seeding liquidity to anvil..."
cd "$SCRIPT_DIR"
forge script "script/DeployDev.s.sol" \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$PRIVATE_KEY" \
  -vvv

echo ""
echo "==> 2/3 Syncing addresses to frontend..."
cd "$REPO_ROOT/frontend"
npx tsx scripts/sync-deploy.ts

echo ""
echo "==> 3/3 Done!"
echo ""
echo "Contracts deployed and addresses synced. Now run:"
echo "  cd frontend && npm run dev"
echo ""
echo "Then open http://localhost:3000/debug to verify:"
echo "  - Wallet connects (import private key into MetaMask: $PRIVATE_KEY)"
echo "  - WETH/USDC pair shows reserves (100 WETH / 200,000 USDC)"
echo "  - LP balance is non-zero"
echo ""
echo "MetaMask network: Chain ID 31337, RPC http://127.0.0.1:8545"