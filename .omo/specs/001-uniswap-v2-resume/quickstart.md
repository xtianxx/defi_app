# Quickstart — Uniswap V2 Resume Project

> Runnable validation guide for the end-to-end feature. References the contract interface in
> [`contracts/smart-contract-interfaces.md`](./contracts/smart-contract-interfaces.md) and the
> frontend module API in [`contracts/frontend-module-api.md`](./contracts/frontend-module-api.md)
> rather than duplicating their bodies. Implementation detail belongs in `tasks.md` (Phase 2),
> not here.

---

## Prerequisites

- Foundry (`forge`, `cast`, `anvil`) — `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- Node.js ≥ 20 and a package manager (npm/pnpm/bun)
- MetaMask (or any EIP-1193 wallet) installed for browser flows
- For Sepolia demo: a Sepolia RPC URL (Alchemy/Infura, with archive access for TWAP) and a funded deployer wallet

---

## Scenario A — Local anvil: full stack, zero gas (primary dev loop)

**Goal**: prove contracts + frontend together on a deterministic local chain.

### A.1 Start a local chain

```bash
anvil --chain-id 31337 --port 8545
# keep this terminal open; anvil prints 10 funded accounts (each 10000 ETH)
```

### A.2 Deploy the demo

```bash
cd contracts
forge install                                   # if contracts/lib is empty
forge build                                      # must succeed with viaIR + optimizer (R0.2)

# deploy the full demo (Factory, WETH9, Router02, 4 MockERC20s, seed 2 pairs)
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  -vvv
```

**Expected outcome**: console logs print the addresses of Factory, Router02, WETH9, and the four tokens. `broadcast/31337/run-latest.json` is written. Two pairs (`WETH/USDC`, `WETH/DAI`) are created with seeded liquidity; `forge script` exits 0.

### A.3 Sync addresses into frontend

```bash
cd ../frontend
node scripts/sync-deploy.ts ../contracts/broadcast/31337/run-latest.json 31337
# regenerates src/lib/contracts/addresses.ts and refreshes abis.ts from contracts/out/
```

### A.4 Run the frontend

```bash
npm install
npm run dev                                       # Next.js on http://localhost:3000
```

### A.5 Browser validation (manually — SC-001)

1. Connect MetaMask to the **anvil** network (chainId `31337`, RPC `http://127.0.0.1:8545`) by importing anvil account 0's private key.
2. Open `/swap`, pick **WETH → USDC**, enter `1` WETH.
   - **Expected**: estimated output ≈ `USDC_reserve * 1000 / (WETH_reserve + 1000 * 997/1000)` (client `getAmountOut`), price impact and 0.30% fee shown (FR-005), `Find out now` enabled.
3. Approve USDC spending (`useToken.approve`) and confirm the swap.
4. **Expected**: `status === 1` receipt, balances update (WETH -1, USDC +out), tx history appended.
5. Repeat with USDC → DAI pair that has **no liquidity** → UI shows `pool-empty` error + CTA to add liquidity (FR-008, edge case).
6. Open `/liquidity`, add to the **USDC/DAI** pool (initial liquidity, spec US2-4), set both amounts, confirm.
7. Open `/portfolio` → both positions visible with `sharePct`, deposited amounts, fees-earned estimate (SC-004) in < 3 s.

### A.6 Automated validation (CI parity)

```bash
# contracts
cd contracts
forge fmt --check                 # Constitution IV formatting
forge build --sizes                # Router02 under 24KB after optimizer
forge test -vvv                    # all tests green
forge test --coverage              # ≥ 95% (Constitution III)
forge snapshot                     # gas baseline committed; CI diffs this

# frontend
cd ../frontend
npm run lint                       # ESLint + tsc --noEmit
npm run test                       # Vitest unit + component
npm run test:e2e                   # Playwright against anvil (auto-seeds via DeployDemo)
```

**Expected**: all green. `forge coverage` lines ≥ 95%. Playwright asserts the SC-001 swap flow end-to-end and SC-004 portfolio < 3 s.

---

## Scenario B — Sepolia testnet public demo

**Goal**: a public, shareable resume demonstration.

### B.1 Deploy

```bash
cd contracts
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast --verify \
  --private-key $SEPOLIA_DEPLOYER_PK \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvv
```

**Expected**: addresses verified on Sepolia Etherscan. (Sepolia archive access required at runtime for TWAP; otherwise UI degrades to labeled "spot (no archive)" — see `useTwapPrice`.)

### B.2 Sync + publish frontend

```bash
cd ../frontend
node scripts/sync-deploy.ts ../contracts/broadcast/11155111/run-latest.json 11155111
npm run build
# deploy to Vercel (or `npm run preview`); set the public URL as the MetaMask "Connected site"
```

### B.3 Validation (manual, with any funded Sepolia wallet)

1. Open the deployed app — wallet prompts to switch to Sepolia (`wrong-network` handler; SC edge case).
2. Swap `WETH → USDC` on the seeded Sepolia pairs (see A.5 steps; expect identical UX).
3. Provide + remove liquidity on a Sepolia pair; verify portfolio updates.
4. Open a block explorer link to each tx from the portfolio history.

**Expected**: all core operations succeed on Sepolia with real test gas; no `high`/`critical` static-analysis findings (Constitution `forge fmt --check`, plus `slither` if installed — see phase 2 tasks).

---

## Scenario C — Contract-only quick verification (no browser)

If you only want to prove the contracts work without the UI:

```bash
cd contracts
forge test -vvv                                 # unit + integration
forge test --match-contract UniswapV2Pair -vvvv  # reentrancy + TWAP invariant fuzz
cast call --rpc-url http://127.0.0.1:8545 \
  $FACTORY "getPair(address,address)" $WETH $USDC   # returns non-zero pair after A.2
cast call --rpc-url http://127.0.0.1:8545 \
  $PAIR "getReserves()"                           # returns seeded reserves
```

**Expected**: returns seeded reserves matching A.2; fuzz tests cover the K-invariant under fuzz inputs (Constitution III).

---

## What this guide does NOT include

- The actual contract/hook/component bodies (see `tasks.md` for the implementation phase).
- Full gas snapshots baseline or the complete fuzz test suite (implementation-phase artifacts).
- CI workflow definition (GitHub Actions matrix on `forge` + `next build`) — added in `tasks.md`.
- The constitution file edit applying the Vite → Next.js amendment (also a `tasks.md` task; plan-phase does not modify `constitution.md`).