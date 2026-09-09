# Uniswap V2-style AMM DEX built from scratch

[中文版](README.md) | English

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

```text
Solidity · Foundry · Next.js · ethers v6

Constant Product AMM · Liquidity Pools · LP Tokens
0.3% Swap Fee · Protocol Fee · TWAP · CREATE2

Sepolia Live Demo · Verified Contracts · CI · E2E
```

> **A Uniswap V2-inspired constant-product AMM implemented from scratch with Solidity and Foundry.**
>
> This project **re-implements the core AMM mechanisms instead of importing / forking Uniswap
> contracts**: `Factory` / `Pair` / LP `ERC20` / `Router02` / `WETH9` are all hand-written
> (including the constant-product invariant, 0.3% fee encoding, LP accounting, TWAP
> accumulator, `MINIMUM_LIQUIDITY`, and the reentrancy lock).

| Entry | Link |
|---|---|
| 🌐 Live Demo | <https://defi-app-three.vercel.app/> |
| ⛓ Network | Sepolia (chainId `11155111`), switch in MetaMask to interact |
| ✅ Contracts | Factory / Router02 / WETH9 / Faucet / 4 tokens, all verified on Etherscan (addresses in [Sepolia Deployment](#sepolia-testnet-deployment)) |
| 📖 Demo Guide | [demo-guide.md](specs/002-sepolia-vercel-deploy/demo-guide.md) (demo accounts & balances) |
| ⚙️ Actions | [test.yml](.github/workflows/test.yml) |

> 📸 Product screenshot: `docs/screenshots/swap.png` (TODO: open the Live Demo's `/swap` in a
> 1440px browser, take a screenshot and commit it to that path; until then, see the Live Demo).

## What I Built

- **Uniswap V2 core from scratch**: `contracts/` (Foundry) hand-written `Factory`, `Pair`, LP
  `ERC20`, plus a simplified periphery `Router02`, `WETH9`, `UniswapV2Library`, `TransferHelper`.
- **Full DEX loop**: `frontend/` (Next.js 15 App Router + ethers v6) supports Swap, Add/Remove
  Liquidity, and a Portfolio view backed by on-chain TWAP, with direct MetaMask connectivity.
- **Public demo is live**: verified Sepolia contracts + Vercel frontend — try swapping and
  market-making with test tokens right away.
- **Engineering rigor**: Foundry unit + fuzz tests, frontend Vitest + Playwright, CI gates,
  one-command local / production deployment scripts.

## Core Features

- Constant-product market making (`x·y=k`), direct-pair swaps
- 0.3% swap fee (encoded into the invariant, no separate accounting)
- LP token accounting: geometric-mean first mint + proportional mint/burn, `MINIMUM_LIQUIDITY`
  permanently locked
- TWAP oracle: `UQ112x112` cumulative prices + `blockTimestampLast`
- Protocol fee: mints LP on `√k` growth (1/6 to protocol when fee-on)
- `CREATE2` deterministic Pair addresses, derivable off-chain by the library
- DemoFaucet: test-token faucet powering the public demo experience

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
contracts/  (Foundry, Solidity ^0.8.19)
  src/core/     Factory · Pair · ERC20 (LP) · Math · SafeMath · UQ112x112
  src/router/   Router02 · WETH9 · UniswapV2Library · TransferHelper
  src/faucet/   DemoFaucet (test-token faucet powering the public demo)
  script/       DeployDemo.s.sol (Factory + Router + WETH9 + 4 tokens + 2 seeded pairs)

Foundry deploy artifacts (out/ ABIs + broadcast/ per-chain addresses)
          ↓  sync-deploy (npm run sync-deploy, argumentless multi-chain)
          ↓  generated ABIs + address bindings
Next.js dApp (/swap · /liquidity · /portfolio · /debug)
```

The two packages are coupled only through generated artifacts (ABIs + deployed addresses);
there is no root-level workspace. Full conventions live in the `specs/` design docs.

## Core AMM Mechanics

Lifecycle of a complete swap:

```text
User
  ↓
Router (checks deadline / slippage, computes quote)
  ↓
transfer tokenIn → Pair
  ↓
Pair computes actual amountIn (balance-delta: current balance − reserve)
  ↓
apply 0.3% fee
  ↓
enforce:
  balance0Adjusted × balance1Adjusted ≥ reserve0 × reserve1 × 1000²
  ↓
update reserves
  ↓
update TWAP accumulator (_update)
```

Quote formula (`UniswapV2Library.getAmountOut`):

```text
amountOut =
  amountIn × 997 × reserveOut
  /
  (reserveIn × 1000 + amountIn × 997)
```

The key point: the Pair does not trust the numbers the Router passes in — it computes the real
input as **balance after receipt minus reserve**, then gates every swap with the fee-adjusted
invariant (`contracts/src/core/UniswapV2Pair.sol:swap`).

## Why it's not just `x × y = k`

Many READMEs stop at a single line `x·y=k`. What actually executes is the check with the
**0.3% fee encoded into the invariant**:

```text
(balance0 × 1000 − amount0In × 3)
×
(balance1 × 1000 − amount1In × 3)
≥
reserve0 × reserve1 × 1000²
```

Meaning: first deduct 0.3% of the input (`×997/1000`); the remainder must then satisfy `k`
invariance. The fee therefore needs **no separate transfer accounting** — it settles directly
as `k` growth that rewards all LPs. This is the line between "knowing the formula" and
"having implemented an AMM".

## Liquidity & LP Accounting

Initial liquidity (first mint):

```text
liquidity = sqrt(amount0 × amount1) − MINIMUM_LIQUIDITY
```

Subsequent adds:

```text
liquidity = min(
  amount0 × totalSupply / reserve0,
  amount1 × totalSupply / reserve1
)
```

Removing liquidity (burn, proportional):

```text
amount0 = liquidity × reserve0 / totalSupply
amount1 = liquidity × reserve1 / totalSupply
```

`MINIMUM_LIQUIDITY = 1000` (wei) is permanently locked to the zero address at the first mint.
This prevents pathological share manipulation from an undersized first deposit, protecting LP
share accounting from "dust attack" distortion
(`contracts/src/core/UniswapV2Pair.sol:mint/burn`).

## TWAP Oracle

The Pair maintains two cumulative prices:

```text
price0CumulativeLast
price1CumulativeLast
```

Every `mint / burn / swap / sync` accumulates through `_update`:

```text
spot price
   ↓
reserve1 / reserve0 (UQ112x112 fixed-point encoding)
   ↓
price × timeElapsed
   ↓
cumulative price
```

Taking the TWAP:

```text
TWAP =
  (cumulativePrice(t1) − cumulativePrice(t0))
  /
  (t1 − t0)
```

This one spot shows DeFi, fixed-point math, oracles, and Solidity time-weighting in a single
mechanism — high resume value
(`contracts/src/core/UniswapV2Pair.sol:_update`, `UQ112x112`).

## CREATE2 Deterministic Pair

```text
tokenA + tokenB
      ↓
sort tokens (token0 < token1)
      ↓
salt = keccak256(token0, token1)
      ↓
CREATE2
      ↓
deterministic Pair address
```

Significance: the `Router` / library can derive the Pair address **off-chain without querying
Factory storage** (`pairFor`). This repo reads the init-code hash dynamically from the Factory
(rather than a hardcoded constant), and the Factory tests cover CREATE2 derivation
consistency. A classic Solidity interview topic.

## Protocol Fee

More than just "charge 0.3% per trade":

```text
Swap fee: 0.30%

fee off (feeTo == 0): 100% → LPs
fee on (feeTo != 0):  5/6 → LPs, 1/6 → protocol
```

Key difference: the protocol fee is **not a token transfer per swap** — it mints LP to `feeTo`
on `√k` growth (`_mintFee`: `liquidity = totalSupply×(√k−√kLast)/(√k×5+√kLast)`, tracked via
`kLast`). No per-trade settlement, no extra accounting — consistent with Uniswap V2's fee-on
design.

## Testing & Invariants

What's verified first, then the commands. Tests are organized by
`core / router / faucet / mocks / utils` (11 files total in `contracts/test/`):

```text
Core
├─ Factory / CREATE2 (incl. library derivation consistency)
├─ Pair initialization (Factory-only)
├─ Mint / burn (incl. MINIMUM_LIQUIDITY lock)
├─ Swap invariant (incl. fee-adjusted K check)
├─ Fee accounting (_mintFee / kLast)
├─ TWAP (cumulative + timeElapsed)
└─ sync / skim

Router
├─ Add / remove liquidity (incl. permit variants)
├─ Token → Token swap (direct pair)
├─ ETH / WETH paths
└─ Slippage / deadline

Edge cases
├─ insufficient liquidity / output / input
├─ zero input / output
├─ invalid recipient
├─ reentrancy lock (LOCKED)
└─ reserve overflow (uint112)
```

Fuzz / invariant status (honest disclosure): there are currently 2 `testFuzz_*` tests
(`Math.sqrt` lower bound, faucet time window) but **no stateful invariant handler yet**.
The invariants an AMM is best suited for (roadmap, ordered by cost/benefit):

```text
reserve0 × reserve1 does not decrease after fees (post-swap)
LP mint/burn preserves proportional ownership
swap output never exceeds reserves
totalSupply / LP accounting internally consistent
CREATE2 address == library-derived address
handler: addLiquidity / swap0For1 / swap1For0 / removeLiquidity / sync executed randomly thousands of times
```

Frontend: 19 Vitest unit tests (hooks/components/bindings) + 3 Playwright e2e + read-only load
test. Commands (identical to CI; full loops live in the scripts):

```bash
./scripts/test-unit.sh                  # forge test + vitest (both packages)
./scripts/test-e2e.sh                   # fresh anvil → deploy → sync → forge + vitest → build + Playwright
cd contracts && forge test -vvv && forge test --coverage
cd frontend && npx tsc --noEmit && npm run lint && npm run test
```

CI (`.github/workflows/test.yml`): contracts `fmt --check` → `build --sizes` (Router02 held to
the 24KB limit) → `forge test`; frontend `tsc` → `lint` → `vitest` → `build`. e2e (Playwright)
runs locally via the scripts.

## Security Properties

- Constant-product invariant enforced after every swap (incl. fee-adjusted check)
- Pair-level reentrancy lock on all of `mint / burn / swap / skim / sync`
- Initial `MINIMUM_LIQUIDITY` permanently locked, preventing first-liquidity manipulation
- Reserves capped at `uint112`; overflow reverts outright
- `initialize` callable only by the Factory
- Fee-adjusted balances checked before reserves are updated
- `_safeTransfer` compatible with non-returning tokens; `permit` with deadline + signature
  verification

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

## Tech Stack

| Layer | Tech |
|---|---|
| Contracts | Solidity ^0.8.19, Foundry, viaIR + optimizer 200 runs |
| Frontend | Next.js 15 App Router, React 19, strict TS, ethers v6, react-query, Tailwind + shadcn/ui |
| Testing | Foundry (unit + fuzz) · Vitest · Playwright · read-only load test |
| Deployment | Anvil (31337) · Sepolia (11155111) · Vercel · Etherscan verification |
| Bindings | `sync-deploy`: broadcast/out → generated ABIs + address bindings |

Frontend pages: `/swap` swap · `/liquidity` add/remove liquidity · `/portfolio` TWAP position
view · `/faucet` test-token faucet · `/debug` debug. Protocol 70%, dApp 30%: pages are the presentation layer of the
protocol; the core is on-chain AMM accounting.

## Scope / Non-goals

- No flash swaps (`swap` has no `bytes data` callback parameter).
- No multi-hop routing: all swap paths are limited to direct pairs (`path.length == 2`,
  otherwise `DirectPairOnly`).
- `Router02` is a subset implementation (incl. `removeLiquidityWithPermit`); the
  fee-on-transfer compatibility variant was not carried over.
- The public demo is testnet + faucet assets only; no real funds involved.

## Docs

- Runnable local guide: [specs/001 quickstart](specs/001-uniswap-v2-resume/quickstart.md)
- Sepolia deployment guide: [specs/002 quickstart](specs/002-sepolia-vercel-deploy/quickstart.md)
- Demo narrative & accounts: [specs/002 demo-guide](specs/002-sepolia-vercel-deploy/demo-guide.md)
- Faucet / frontend API contracts: [specs/002 contracts](specs/002-sepolia-vercel-deploy/contracts/)
- Research & data model: [specs/002 research](specs/002-sepolia-vercel-deploy/research.md) ·
  [data-model](specs/002-sepolia-vercel-deploy/data-model.md)

## License

MIT License. Copyright (c) 2026 Ray Tian.