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

## Edge Cases

Failure/state conditions the presenter may hit during the demo, mapped to the validation scenarios and the acceptance table above.

### EC-1 RPC Slow/Unavailable (VS-1, VS-5)

`/api/reserves` is the server-side RPC read path (`frontend/src/app/api/reserves/route.ts`; frontend-module-api.md §2): it batches pair reads — `getReserves`, cumulative prices, `totalSupply`, `lpBalance` — into one round trip via `createServerProvider(chainId)`, then serves them through `unstable_cache` (`revalidate: 2`) with `Cache-Control: public, s-maxage=2, stale-while-revalidate=4`.

- **Runtime RPC failure** (timeout, network error, JSON-RPC error) → **HTTP 502** `{ "error": "rpc error", detail }` with a **`Retry-After: 2`** header: consumers should retry after ~2 s. There is no explicit timeout in the handler — the effective bound is the Vercel Hobby function duration limit (300 s, research.md), and Sepolia `eth_call` round trips run ~100–500 ms, so a healthy endpoint never approaches it. While healthy, the 2 s cache (`s-maxage=2` + stale-while-revalidate 4 s) masks brief blips; once it expires, failures surface as 502.
- **Missing env** — `SEPOLIA_RPC_URL` unset (only reachable with `chainId=11155111`; anvil's RPC is hardcoded in `chains.ts`) → **HTTP 500** `{ "error": "rpc not configured", detail: "SEPOLIA_RPC_URL not configured" }` — a server misconfiguration, deliberately distinct from the runtime-failure 502 (frontend-module-api.md §2).
- **Other statuses**: `400` missing `pair`/`account`; `404` `"pair not found"` (no deployed code at the pair address).
- **What the UI shows**: the app's pages currently read reserves through the connected wallet's provider (`usePair`/`usePortfolio`), not through this route — `/api/reserves` serves portfolio-perf consumers and direct verification (frontend-module-api.md §8.4: `curl "/api/reserves?pair=…&account=…&chainId=11155111"`). A provider outage therefore appears in the UI as missing/empty data (widgets fall back to empty states; portfolio surfaces its error string), not as the JSON error body — use `curl` to distinguish "RPC down" (502) from "env missing" (500).
- **Demo-operator fallback**:
  1. Check the provider's status page/dashboard (Alchemy/Infura free tier) for an outage or rate-limit spike.
  2. Create a second free-tier endpoint; update `SEPOLIA_RPC_URL` in `contracts/.env` (local `forge script`/`cast` runs) **and** on Vercel (Settings → Environment Variables, Production + Preview) → redeploy — env changes apply to new deployments only.
  3. Vercel Hobby retains logs for **1 h** — pull any needed evidence of the failure before that window closes.

### EC-2 Wallet-less Device (VS-1, VS-3)

- The app loads and renders normally without a wallet — no crash, no redirect; the Navbar always shows the Connect button. Wallet-gated reads return empty states and widgets surface connect CTAs:
  - `/faucet`: "Connect your wallet to request demo tokens." + Connect button (FaucetWidget).
  - Swap: the action button reads "Connect wallet" (SwapWidget).
  - Portfolio: "Connect your wallet to view positions and transaction history." + Connect button.
- The server-side `/api/reserves` route needs **no wallet** — it takes `pair`/`account`/`chainId` as query params, so a wallet-less device (or `curl`) can still read live Sepolia data. In-app live balances/prices, however, require a connected wallet (client reads go through the browser provider).
- All interactive flows (swap, add/remove liquidity, faucet claim) require a wallet — see demo-guide.md for wallet setup and demo-account import.

### EC-3 Pre-existing Token Balances (VS-2, VS-3)

- Demo accounts may hold **leftover balances** from previous runs: earlier faucet claims, prior demo sessions, replenishment top-ups. The UI always displays real on-chain balances — never assume an account is "fresh" or that a shown balance is zero (spec.md edge case: "Balances, not grants, must be displayed"). If a balance looks unexpected, explain it as the result of a previous claim/run instead of "fixing" it.
- The faucet's **per-wallet 24 h rate limit** interacts with this: a wallet that already claimed shows the countdown ("下次可领取: Xh Ym 后") with Claim disabled — **not** zero balances. Attempts before `nextEligibleTime` are rate-limited; use a different wallet (e.g., the other demo account) for a live claim, or present the countdown as expected behavior.
- Cross-references: VS-2 step 2 (expect pre-funded balances — they reflect prior funding, not a freshness guarantee), VS-3 step 4 (rate-limit countdown), acceptance-table rows VS-2/VS-3.

## Rollback / Cleanup

- Vercel: Settings → Environment Variables remove `SEPOLIA_RPC_URL`; pause project (Hobby keeps URL). No code change required — client never depends on the env var.
- Contracts: testnet deployment — no state at risk; redeploy is free.
- Anvil path: untouched by every step above.
