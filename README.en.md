# Uniswap V2-style AMM DEX built from scratch

[中文版](README.md) | English

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

```text
Solidity · Foundry · Next.js · ethers v6

Constant Product AMM · Liquidity Pools · LP Tokens
0.3% Swap Fee · Protocol Fee · TWAP · CREATE2

Sepolia Live Demo · Verified Contracts · CI · E2E
```

| Entry | Link |
|---|---|
| 🌐 Live Demo | <https://defi-app-three.vercel.app/> |
| ⛓ Network | Sepolia (chainId `11155111`), switch in MetaMask to interact |
| ✅ Contracts | Factory / Router02 / WETH9 / Faucet / 4 tokens, all verified on Etherscan (addresses in [Sepolia Testnet Deployment](#sepolia-testnet-deployment)) |
| 📖 Demo Guide | [demo-guide.md](specs/002-sepolia-vercel-deploy/demo-guide.md) (demo accounts & balances) |
| ⚙️ Actions | [test.yml](.github/workflows/test.yml) |

## Overview

A Uniswap V2-inspired constant-product AMM **re-implemented from scratch with Solidity and
Foundry** — not an import or fork of the canonical contracts. `Factory` / `Pair` / LP `ERC20` /
`Router02` / `WETH9` are all hand-written, including the constant-product invariant, 0.3% fee
encoding, LP accounting, TWAP accumulator, `MINIMUM_LIQUIDITY`, and the reentrancy lock.

- **Uniswap V2 core from scratch**: `contracts/` (Foundry) hand-written `Factory`, `Pair`, LP
  `ERC20`, plus a subset periphery `Router02`, `WETH9`, `UniswapV2Library`, `TransferHelper`.
- **Full DEX loop**: `frontend/` (Next.js 15 App Router + ethers v6) supports Swap, Add/Remove
  Liquidity, and a Portfolio view backed by on-chain TWAP, with direct MetaMask connectivity.
- **Public demo is live**: verified Sepolia contracts + Vercel frontend — swap and
  market-make with test tokens right away.
- **Engineering rigor**: Foundry unit + fuzz tests, Vitest + Playwright, CI gates, one-command
  local / production deployment scripts.

Core features:

- Constant-product market making (`x·y=k`), direct-pair swaps
- 0.3% swap fee encoded into the invariant — no separate fee accounting
- Geometric-mean first mint + proportional LP mint/burn, `MINIMUM_LIQUIDITY` locked
- UQ112x112 TWAP oracle (`price0/1CumulativeLast` + `blockTimestampLast`)
- Protocol fee minted as LP on `√k` growth (1/6 to protocol when fee-on)
- `CREATE2` deterministic pair addresses, derivable off-chain by the library
- DemoFaucet: test-token faucet powering the public demo experience

## Demo

Live Demo · Sepolia (chainId `11155111`) · verified contracts (addresses in [Sepolia Testnet
Deployment](#sepolia-testnet-deployment)).

<p align="center">
  <img src="docs/screenshots/swap.png" alt="Swap page — exchange tokens" width="720" />
</p>

<p align="center"><em>Swap — /swap (placeholder)</em></p>

<p align="center">
  <img src="docs/screenshots/liquidity.png" alt="Liquidity page — add / remove liquidity" width="720" />
</p>

<p align="center"><em>Liquidity — /liquidity (placeholder)</em></p>

<p align="center">
  <img src="docs/screenshots/portfolio.png" alt="Portfolio page — TWAP-backed position view" width="720" />
</p>

<p align="center"><em>Portfolio — /portfolio (placeholder)</em></p>

Screenshots pending — placeholders; see Live Demo: <https://defi-app-three.vercel.app/>.

## Engineering Highlights

| Challenge | Implementation | Why it matters |
|---|---|---|
| AMM pricing | Constant-product invariant | Permissionless market making |
| Swap fee | Fee-adjusted invariant (`1000/3`) | 0.3% fee with no separate accounting |
| LP accounting | Geometric mean + proportional shares | Fair liquidity ownership |
| Pair deployment | CREATE2 | Deterministic addresses, derivable off-chain |
| Oracle | UQ112x112 cumulative prices | On-chain TWAP |
| Protocol fee | `kLast` / `√k` growth mints LP | Protocol revenue without per-swap settlement |
| Reentrancy | Pair-level `lock` | Protects every state-changing AMM path |
| Full-stack integration | Router + Next.js + wallet | Complete DEX lifecycle |

## Architecture

```text
contracts/  (Foundry, Solidity ^0.8.19, viaIR + optimizer 200 runs)
  src/core/     Factory · Pair · ERC20 (LP) · Math · SafeMath · UQ112x112
  src/router/   Router02 · WETH9 · UniswapV2Library · TransferHelper
  src/faucet/   DemoFaucet (test-token faucet powering the public demo)
  script/       DeployDemo.s.sol (Factory + Router + WETH9 + 4 tokens + 2 seeded pairs)

Foundry deploy artifacts (out/ ABIs + broadcast/ per-chain addresses)
          ↓  sync-deploy (npm run sync-deploy, argumentless multi-chain)
          ↓  generated ABIs + address bindings
Next.js dApp (React 19, ethers v6, Tailwind + shadcn/ui) — /swap · /liquidity · /portfolio · /faucet · /debug
```

The two packages are coupled only through generated artifacts (ABIs + deployed addresses);
there is no root-level workspace. Full conventions live in the `specs/` design docs; package
details in `contracts/README.md` and `frontend/README.md`.

## Core AMM Mechanics

Six mechanisms define the pair contracts; each has a dedicated doc with the full derivation.
Code references: `contracts/src/core/UniswapV2Pair.sol`, `UniswapV2Factory.sol`,
`contracts/src/router/libraries/UniswapV2Library.sol`.

- **Swap lifecycle** — Router checks deadline/slippage and quotes via `getAmountOut`
  (`amountIn × 997 × reserveOut / (reserveIn × 1000 + amountIn × 997)`); the Pair measures the
  actual input as balance-after-transfer minus reserve, applies the 0.3% fee, enforces the
  invariant, then updates reserves and the TWAP accumulator. [Docs](docs/amm-mechanics.md)
- **Fee-adjusted invariant** — the check that executes per swap encodes the 0.3% fee:
  `balance0Adjusted × balance1Adjusted ≥ reserve0 × reserve1 × 1000²`, where
  `balanceAdjusted = balance × 1000 − amountIn × 3`. No separate fee accounting — the fee
  settles as `k` growth. [Docs](docs/amm-mechanics.md)
- **LP accounting** — first mint is geometric mean `sqrt(amount0 × amount1) −
  MINIMUM_LIQUIDITY` (1000 wei locked to `address(0)`); later mints/burns are proportional to
  the smaller deposit ratio; removal pays out `liquidity × reserve / totalSupply` per token.
  [Docs](docs/amm-mechanics.md)
- **CREATE2 pair address** — pairs deploy with `salt = keccak256(abi.encodePacked(token0,
  token1))` after sorting; the library derives addresses off-chain from the Factory's
  init-code hash (`pairFor`). [Docs](docs/amm-mechanics.md)
- **TWAP oracle** — two UQ112x112 cumulative price accumulators updated by `_update` on every
  `mint/burn/swap/sync`; TWAP over [t0, t1] is the accumulator difference divided by elapsed
  time. [Docs](docs/twap.md)
- **Protocol fee** — when `feeTo` is set, `_mintFee` mints LP on `√k` growth since `kLast`
  (`totalSupply × (√k − √kLast) / (√k × 5 + √kLast)`): 1/6 of swap fees to the protocol, no
  per-trade transfers. [Docs](docs/protocol-fee.md)

## Testing & Security

Contracts: 12 test files in `contracts/test/` organized by `core / router / faucet / invariant /
utils`, covering Factory/CREATE2 derivation, Factory-only pair initialization, mint/burn with
the `MINIMUM_LIQUIDITY` lock, the fee-adjusted swap invariant, `_mintFee` / `kLast`, TWAP
accumulators, edge cases, and the reentrancy lock. Beyond 2 `testFuzz_*` tests, the suite runs
**stateful invariant fuzzing across randomized liquidity and swap sequences**. Frontend tests
live in `frontend/tests/` (`unit/` for Vitest, `e2e/` for Playwright).

Frontend: 19 Vitest unit tests (hooks/components/bindings) + 3 Playwright e2e (portfolio,
remove-liquidity, responsive) + a read-only load test (`frontend/tests/load/`). Commands
(identical to CI; full loops live in the scripts):

```bash
./scripts/test-unit.sh                  # forge test + vitest (both packages)
./scripts/test-e2e.sh                   # fresh anvil → deploy → sync → tests → build + Playwright
cd contracts && forge test -vvv && forge test --coverage
cd frontend && npx vitest run && npx tsc --noEmit && npm run lint
```

CI (`.github/workflows/test.yml`): contracts `fmt --check` → `build --sizes` → `forge test`;
frontend `tsc` → `lint` → `vitest` → `build`; e2e runs locally via `./scripts/test-e2e.sh`.

Security properties:

- Fee-adjusted invariant enforced after every swap
- Pair-level reentrancy lock on all of `mint / burn / swap / skim / sync`
- `MINIMUM_LIQUIDITY` permanently locked at the first mint
- Reserves capped at `uint112`; overflow reverts outright
- `initialize` callable only by the Factory
- `_safeTransfer` accepts non-returning tokens; `permit` with deadline + signature checks

## Sepolia Testnet Deployment

The public demo **is live** (testnet tokens, no real funds):

| Contract | Sepolia Address |
|---|---|
| Factory | [0xc32bc046beafd48827f3d55356568476df322dde](https://sepolia.etherscan.io/address/0xc32bc046beafd48827f3d55356568476df322dde) |
| Router02 | [0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4](https://sepolia.etherscan.io/address/0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4) |
| WETH9 | [0xd1647800688ccb78c1f378329110fd10791b8af9](https://sepolia.etherscan.io/address/0xd1647800688ccb78c1f378329110fd10791b8af9) |
| DemoFaucet | [0xcba03ecf90db02aae02fa02dbba6e55b6431b9db](https://sepolia.etherscan.io/address/0xcba03ecf90db02aae02fa02dbba6e55b6431b9db) |
| USDC / DAI / WBTC | [0xf20503…5566](https://sepolia.etherscan.io/address/0xf205032b263672b814d26c81fa6b1c2697855566) / [0xfa30fb…7a97](https://sepolia.etherscan.io/address/0xfa30fbba942e92afe1bcfaed35698f360d9f7a97) / [0x1ea6c4…23df](https://sepolia.etherscan.io/address/0x1ea6c4954ab3632dfccdc676db96a3ec1c6023df) |

- Seeded pairs: WETH/USDC, WETH/DAI (Pair addresses are derived at runtime by the library, not
  committed as hardcoded values).
- Try it: open <https://defi-app-three.vercel.app/>, switch MetaMask to Sepolia and swap,
  add/remove liquidity, or view your positions; test tokens come from the in-app faucet, demo
  accounts in demo-guide.
- Address source: `frontend/src/lib/contracts/addresses.ts` (`DEPLOYMENTS`, anvil 31337 +
  Sepolia 11155111), generated and committed from Foundry `broadcast/` via `npm run
  sync-deploy`.

## Quick Start

After a fresh clone: `forge install` in `contracts/` (plus
`forge install openzeppelin-contracts` — present in `lib/` + remappings but not in
`.gitmodules`) and `npm install` in `frontend/`.

Local development (one command, recommended):

```bash
./scripts/dev-deploy.sh --dev
# fresh anvil → deploy the full AMM (Factory/Router/WETH9/4 tokens/2 pairs)
# → sync ABI+address bindings → verify swap-ready → start frontend http://localhost:3000
```

Full manual steps → [specs/001 quickstart](specs/001-uniswap-v2-resume/quickstart.md).

Reproduce the production deployment (one command + docs):

```bash
./scripts/sepolia-deploy.sh
```

Full 6 steps (≤30 min: keys/faucet/verification/Vercel/top-up) →
[specs/002 quickstart](specs/002-sepolia-vercel-deploy/quickstart.md).
Env var template in `contracts/.env.example` (`SEPOLIA_RPC_URL` is read server-side only, never
prefixed with `NEXT_PUBLIC_`).

## Scope / Non-goals

- No flash swaps (`swap` has no `bytes data` callback parameter).
- No multi-hop routing: all swap paths are limited to direct pairs (`path.length == 2`,
  otherwise `DirectPairOnly`).
- `Router02` is a subset implementation (incl. `removeLiquidityWithPermit`); the
  fee-on-transfer compatibility variant was not carried over.
- The public demo is testnet + faucet assets only; no real funds involved.

## Docs

- AMM mechanics — swap lifecycle, fee-adjusted invariant, LP accounting, CREATE2:
  [docs/amm-mechanics.md](docs/amm-mechanics.md)
- TWAP oracle — UQ112x112 accumulators and Δcumulative/Δt:
  [docs/twap.md](docs/twap.md)
- Protocol fee — `_mintFee` `√k` formula and the 1/6 split:
  [docs/protocol-fee.md](docs/protocol-fee.md)
- Runnable local guide: [specs/001 quickstart](specs/001-uniswap-v2-resume/quickstart.md)
- Sepolia deployment guide: [specs/002 quickstart](specs/002-sepolia-vercel-deploy/quickstart.md)
- Demo narrative & accounts: [specs/002 demo-guide](specs/002-sepolia-vercel-deploy/demo-guide.md)
- Faucet / frontend API contracts: [specs/002 contracts](specs/002-sepolia-vercel-deploy/contracts/)
- Research & data model: [specs/002 research](specs/002-sepolia-vercel-deploy/research.md) ·
  [data-model](specs/002-sepolia-vercel-deploy/data-model.md)

## License

MIT License. Copyright (c) 2026 Ray Tian.
