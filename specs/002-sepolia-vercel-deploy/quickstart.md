# Quickstart: Sepolia Testnet & Vercel Deployment Validation

**Feature**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data model**: [data-model.md](./data-model.md)

This is the **runnable validation guide** for the Sepolia/Vercel demo. Implementation details live in [tasks.md](./tasks.md) (generated later) and the contract docs: [faucet-contract.md](./contracts/faucet-contract.md), [frontend-module-api.md](./contracts/frontend-module-api.md).

## Prerequisites

| Item | Requirement |
|---|---|
| RPC | Alchemy/Infura free-tier Sepolia endpoint (env: `SEPOLIA_RPC_URL`) |
| Explorer | Free Etherscan API key (env: `ETHERSCAN_API_KEY`) — works for Sepolia (R0.3) |
| Wallet | MetaMask (or EIP-1193) with Sepolia network added |
| Keys | Master funding account key (dev-held, never documented) + 2 fresh demo account keys |
| Test ETH | **0.25–0.5 ETH** to master: Chainstack (one-shot, tops to 0.5, if ≥0.08 ETH mainnet held) else Google Cloud Web3 faucet (0.05 ETH/24h) + ethfaucet supplement over a few days — covers deploy gas + demo-account funding + 0.2 ETH faucet WETH reserve (T010); fallback checklist in research.md R0.1 |
| Tools | `forge`/`cast` (Foundry), `node` (sync-deploy), GitHub repo (personal, not org — R0.2) |

## Setup: Full Sepolia Deployment (FR-010, ≤30 min)

```bash
# 1. Generate fresh demo account keys (never reuse anvil's well-known keys — plan D5)
cast wallet new   # × 3: master, LP provider, swapper — record addresses

# 2. Fund master via public Sepolia faucet(s) → master address (research.md R0.1)

# 3. One-shot deploy + seed + verify (script --verify: constructor args auto-decoded — R0.3)
export SEPOLIA_RPC_URL=... ETHERSCAN_API_KEY=...
forge script script/DeployDemoSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast \
  --verify --etherscan-api-key "$ETHERSCAN_API_KEY" --slow -vvv
#    → deploys Factory/Router/WETH9/USDC/DAI/WBTC, creates + seeds WETH/USDC + WETH/DAI,
#      funds faucet WETH reserve, funds demo accounts, deploys DemoFaucet

# 4. Regenerate + commit frontend bindings (multi-chain — plan D7)
node scripts/sync-deploy.ts            # no args (multi-chain) — reads broadcast/DeployDemoSepolia.s.sol/11155111/run-latest.json
git add frontend/src/lib/contracts/addresses.ts frontend/src/lib/contracts/tokens.ts && git commit

# 5. Deploy frontend to Vercel (R0.2 — see contracts/frontend-module-api.md §8)
#    Import repo → Root Directory: frontend/ → env SEPOLIA_RPC_URL (Production + Preview) → Deploy

# 6. Replenish demo accounts from master (primary path, FR-005, ≤5 min)
cast send <demo_account> --value 0.05ether --rpc-url "$SEPOLIA_RPC_URL" --private-key <master_key>
cast send <usdc_addr> "mint(address,uint256)" <demo_account> 20000e6 --rpc-url ... --private-key <master_key>  # tokens minted via MockERC20 open mint
```

**Expected outcome**: every address from step 3 is **verified** on `sepolia.etherscan.io` (SC-002: 100%); a fresh browser at the Vercel URL connects and loads live balances/prices.

## Validation Scenarios

### VS-1 Publicly Accessible DEX (US1, SC-001/SC-004)

1. Open the production Vercel URL in a fresh browser; connect MetaMask (Sepolia network added).
2. **Expect**: app shows live balances/prices; each page (swap/liquidity/portfolio) loads without errors.
3. Swap 10 USDC → WETH: **expect** tx mined on Sepolia; balances update; explorer link works.
4. Add liquidity to WETH/USDC: **expect** LP tokens appear on the liquidity page.
5. Wrong-network check: switch wallet to Ethereum mainnet → **expect** clear "请切换到 Sepolia" message with switch guidance (US1-4).

### VS-2 Demo Accounts (US2, FR-004/FR-005, SC-003)

1. Import LP-provider demo account into MetaMask; connect to Sepolia.
2. **Expect**: pre-funded test ETH + USDC/DAI/WBTC + WETH balances (FR-004).
3. Complete swap + add liquidity + remove liquidity — **expect** all succeed with gas covered.
4. Deplete account's ETH; follow demo-guide replenishment (master `cast send`, step 6 above) — **expect** usable again within 5 minutes (SC-003).
5. Drain/remove seeded liquidity; follow re-seeding process from the demo guide — **expect** pools demo-ready again.

### VS-3 In-App Faucet (US3, FR-008)

1. Connect any wallet (visitor) to the `/faucet` page.
2. **Expect**: grant table (0.1 WETH / 200 USDC / 200 DAI / 0.01 WBTC); Claim enabled.
3. Claim → **expect** tx confirmed; balances credited on-chain within one minute (US3-1); success UI with explorer link.
4. Claim again immediately → **expect** rate-limit message with countdown (US3-3); button disabled until `nextEligibleTime`.
5. Disconnect wallet → **expect** connect prompt (US3-2).

### VS-4 Regression: Local Anvil (FR-009, SC-006)

```bash
./scripts/test-unit.sh                          # forge test + vitest — all pass, unchanged
./scripts/dev-deploy.sh --dev                   # anvil stays running; frontend on :3000
# /faucet page works against the anvil deployment too (faucet deployed on 31337)
./scripts/test-e2e.sh                           # full local loop still green
```

**Expect**: no existing suite modified to pass; zero changes to anvil flows.

### VS-5 Reproducibility (FR-010, SC-005)

On a clean machine, a developer follows [deployment guide → README] steps 1–6 above — **expect** full deployment in under 30 minutes (documented time budget per step).

## Acceptance Traceability

| Scenario | Spec refs | Success criteria |
|---|---|---|
| VS-1 | US1.1–1.4, FR-001..003 | SC-001, SC-004 |
| VS-2 | US2.1–2.4, FR-004..006 | SC-003 |
| VS-3 | US3.1–3.3, FR-008, FR-011 | US3 independent test |
| VS-4 | FR-009 | SC-006 |
| VS-5 | FR-010, FR-013 | SC-005, SC-007 |

## Rollback / Cleanup

- Vercel: Settings → Environment Variables remove `SEPOLIA_RPC_URL`; pause project (Hobby keeps URL). No code change required — client never depends on the env var.
- Contracts: testnet deployment — no state at risk; redeploy is free.
- Anvil path: untouched by every step above.
