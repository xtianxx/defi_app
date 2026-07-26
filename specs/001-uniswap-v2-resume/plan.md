# Implementation Plan: Uniswap V2 Resume Project

**Branch**: `001-uniswap-v2-resume` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-uniswap-v2-resume/spec.md`

## Summary

Build a Uniswap V2–style decentralized exchange as a resume/portfolio project. The contract layer is a Foundry project that re-implements the Uniswap V2 core (Factory, Pair, LP ERC-20) and a simplified periphery (Router + WETH9 + libraries), excluding flash swaps and multi-hop routing per FR-011. The frontend is a Next.js (App Router) + React + TypeScript + ethers.js v6 dApp that connects MetaMask, performs direct-pair swaps, manages liquidity (add/remove), and surfaces a portfolio/analytics view backed by on-chain TWAP-only prices. Deploy targets are local `anvil` (dev) and Sepolia testnet (demo).

Technical approach was grounded in best-practice research (see [research.md](./research.md)): the canonical Foundry UniswapV2 project layout (`src/core` + `src/router`), `viaIR` + optimizer for the oversized Router02 contract, dynamic `INIT_CODE_PAIR_HASH` handling, and the well-established `BrowserProvider` + `'use client'` hook pattern for ethers v6 in Next.js App Router.

## Technical Context

**Language/Version**: Solidity `^0.8.19` for contracts (Foundry, `forge`, `cast`, `anvil`); TypeScript ~5.x + React 19 for the frontend.

**Primary Dependencies**:
- Contracts: Foundry (`forge-std`); OpenZeppelin Contracts as a forge lib is optional for ERC20 reference / safe-transfer patterns (see research.md decision).
- Frontend: Next.js 15 (App Router), React 19, ethers.js v6, TypeScript, Tailwind CSS + shadcn/ui for UI primitives, `@tanstack/react-query` optional for read-call caching.

**Storage**: No database. All state is on-chain (pair reserves, LP balances, cumulative TWAP prices). The frontend is stateless beyond React component state + read-through cache; configuration (token list, deployed addresses) is a versioned TS constant sourced from deployment artifacts.

**Testing**:
- Contracts: `forge test -vvv` (unit + integration); `forge test --coverage` ≥ 95% (Constitution III); fuzz tests for AMM math; fork tests vs Sepolia RPC; `forge snapshot` for gas regression.
- Frontend: Vitest (unit hooks/util tests) + Testing Library (component tests) + Playwright E2E against a local anvil chain.

**Target Platform**:
- Contracts: EVM — local `anvil` (chainId 31337) for dev; Sepolia testnet (chainId 11155111, hex `0xaa36a7`) for public demo.
- Frontend: Modern evergreen browsers with MetaMask (or any EIP-1193 wallet); responsive desktop + mobile (FR-010).

**Project Type**: Web application / dApp — two-package monorepo: `contracts/` (Foundry) + `frontend/` (Next.js).

**Performance Goals** (from spec SC-001..SC-008):
- Swap end-to-end (connect → confirm) < 2 min (SC-001).
- Portfolio view loads < 3 s (SC-004).
- 100 concurrent users without degradation (SC-005, interpreted as frontend/readonly RPC throughput, not on-chain TPS).
- Contract gas: documented snapshots for `swap`, `mint`, `burn`, `createPair` (Constitution II).

**Constraints**:
- No flash swaps, no multi-hop routing (FR-011) — direct single-pair swaps only.
- On-chain TWAP only for price display (no off-chain price feed).
- Testnet/anvil only — no real value at risk.
- Router02 bytecoded exceeds the 24KB EIP-170 limit without the optimizer; `viaIR = true` + optimizer runs 200 required.
- Constitution NON-NEGOTIABLE: reentrancy guards on value-transferring external calls, 95%+ coverage, NatSpec on all public functions, `forge fmt` formatting.

**Scale/Scope**: Resume demonstration project — 4 demo tokens (WETH, USDC, DAI, WBTC) with their pair set; pages: Swap, Liquidity, Portfolio, Pool detail. Smart-contract LOC on the order of original Uniswap V2 core+periphery (~1.5–2k LOC). Frontend ~5–10 routes.

**Persistent Unknowns**: None remaining after Phase 0 research. All NEEDS CLARIFICATION resolved in research.md.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: `.specify/memory/constitution.md` v1.0.0 (ratified 2026-07-23).

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Smart Contract Security First (NON-NEGOTIABLE) | ✅ PASS | Reentrancy guard on `UniswapV2Pair.swap` (the only value-transferring external call); Solidity 0.8+ overflow checks; access-control modifiers on `Factory.setFeeTo`/`setFeeToSetter` and Pair `mint`/`burn` restricted to Router via `sk`/lock pattern; input validation (non-zero amounts, deadline checks, slippage `amountOutMin`/`amountInMax`) in Router; comprehensive fuzz+edge tests. |
| II | DeFi Protocol Compliance | ✅ PASS | Constant-product `x*y=k` invariant in `UniswapV2Pair.swap`; 0.3% swap fee (1/6 to `feeTo` when enabled); LP mint/burn proportional share math; TWAP via `price0CumulativeLast`/`price1CumulativeLast` + `blockTimestampLast`; gas snapshots documented. |
| III | Test-Driven Development | ✅ PASS | Forge tests first; ≥95% coverage gate; fuzz tests for `getAmountOut`/sqrt math; fork tests vs Sepolia. |
| IV | Professional Code Quality | ✅ PASS | NatSpec on all public/external functions; `forge fmt` enforced; modular `core`/`router` split; gas optimizations documented (UQ112x112 fixed-point, `viaIR`). |
| V | Documentation & Reproducibility | ✅ PASS | README setup; this plan + research.md + data-model.md + contracts/ + quickstart.md; deploy scripts for anvil + Sepolia; ABI export for frontend. |

### Violations Requiring Justification (recorded in Complexity Tracking below)

| Constitution Standard | Standard Text | Project Decision | Justification |
|----------------------|---------------|------------------|----------------|
| Frontend Requirements → Build tooling | "React 18+ with TypeScript; Vite for build tooling" | **Use Next.js 15 (App Router) instead of Vite** | Explicit user instruction (`/speckit.plan` arg: "前端部分使用next.js/react"). Next.js provides App Router, SSR, file-based routing, and route handlers that simplify the multi-page dApp (Swap / Liquidity / Portfolio) and read-only RPC proxying for performance (SC-004). The existing `frontend/` is a minimal Vite scaffold with effectively no product code (only `App.tsx` + `App.css` + a `hooks/` stub), so the migration cost is a scaffold replacement, not a rewrite. Constitution amendment recorded below. |
| Frontend Requirements → React version | "React 18+" | **Use React 19** | The existing scaffold already pins React 19, and Next.js 15 requires React 19. Backward-compatible with the spirit of "React 18+". No code-impact violation. |
| Smart Contract Requirements → Solidity version | "^0.8.19" | **Confirmed ^0.8.19** (test reference repos use 0.8.30; we stay on the constitution-mandated 0.8.19) | No deviation. Listed only to note the researched reference repos use a newer minor — we follow the constitution, not the reference repos. |

**Gate Evaluation**: The deviations are (a) user-mandated and (b) backward-compatible. Veto gate (NON-NEGOTIABLE Principle I security) is unaffected and PASS. All other gates PASS. **Proceed to Phase 0.**

### Constitution Amendment (Vite → Next.js)

Per the constitution's Amendment Process (§Governance), this plan records a **MINOR** amendment to the "Frontend Requirements" section of the Technical Standards:

> **Old**: "React 18+ with TypeScript; Vite for build tooling; ethers.js v6 for Web3 integration; responsive design with mobile-first approach; error handling for network switching and transaction failures"
> **New**: "React 19 with TypeScript; **Next.js 15 (App Router) for build tooling and routing**; ethers.js v6 for Web3 integration; responsive design with mobile-first approach; error handling for network switching and transaction failures. Wallet-interacting components MUST use the `'use client'` directive; read-only RPC calls SHOULD run in Server Components / Route Handlers via a `JsonRpcProvider` for performance."

This amendment will be applied to `constitution.md` as a follow-up task in `tasks.md` (the plan phase does not edit the constitution file itself). Bumped version: 1.0.0 → 1.1.0 (MINOR: framework change, no breaking core-principle change).

## Project Structure

### Documentation (this feature)

```text
.omo/specs/001-uniswap-v2-resume/         # staged here (Prometheus plan-mode), mirror of:
specs/001-uniswap-v2-resume/              # canonical speckit feature dir (worker copies files here)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── smart-contract-interfaces.md
│   └── frontend-module-api.md
├── checklists/          # Pre-existing
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
contracts/                       # Foundry project (existing root, reorganized)
├── foundry.toml                 # +viaIR=true, optimizer=true, optimizer_runs=200, solc=0.8.19
├── src/
│   ├── core/
│   │   ├── UniswapV2Factory.sol        # CREATE2 pair deployer, feeTo governance
│   │   ├── UniswapV2Pair.sol           # AMM vault: swap/mint/burn + TWAP cumulative prices
│   │   ├── UniswapV2ERC20.sol          # LP token (EIP-2612 permit optional)
│   │   ├── interfaces/
│   │   │   ├── IUniswapV2Factory.sol
│   │   │   ├── IUniswapV2Pair.sol
│   │   │   └── IUniswapV2ERC20.sol
│   │   └── libraries/
│   │       ├── Math.sol                # Babylonian sqrt, min
│   │       ├── UQ112x112.sol            # Fixed-point price encoding
│   │       └── SafeMath.sol             # kept for clarity under 0.8 unchecked blocks
│   └── router/
│       ├── UniswapV2Router02.sol        # Direct-pair swap + add/remove liquidity (NO multi-hop)
│       ├── WETH9.sol                    # Wrapped ETH for ETH<->ERC20 pairs
│       ├── interfaces/
│       │   ├── IUniswapV2Router02.sol
│       │   ├── IERC20.sol
│       │   └── IWETH.sol
│       └── libraries/
│           ├── UniswapV2Library.sol      # pairFor/getReserves/getAmountOut (dynamic init hash)
│           └── TransferHelper.sol       # safeTransfer/safeTransferFrom
├── script/
│   ├── core/DeployFactory.s.sol
│   ├── router/DeployRouter.s.sol
│   └── DeployDemo.s.sol                # Full demo: tokens + pairs + seed liquidity (anvil)
├── test/
│   ├── core/UniswapV2Factory.t.sol
│   ├── core/UniswapV2Pair.t.sol         # incl. reentrancy + TWAP invariant tests
│   ├── router/UniswapV2Router02.t.sol   # direct-pair swap + liquidity flows
│   ├── mocks/MockERC20.sol              # WETH/USDC/DAI/WBTC fixtures
│   └── utils/                           # test helpers, error-selector constants
└── broadcast/, out/, lib/forge-std/      # gitignored / generated

frontend/                        # Replaced: Vite scaffold -> Next.js App Router
├── next.config.mjs
├── package.json                 # next, react, react-dom, ethers@6, tailwindcss, shadcn
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json              # shadcn/ui config
├── public/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout + Web3Provider (client) + Navbar
│   │   ├── page.tsx            # Landing -> redirect to /swap
│   │   ├── swap/page.tsx       # FR-001/005/008/009
│   │   ├── liquidity/page.tsx  # FR-003/004 (add/remove)
│   │   ├── portfolio/page.tsx  # FR-006/009 (SC-004: < 3s load)
│   │   └── api/reserves/route.ts  # Server-side read proxy (JsonRpcProvider) for SC-004
│   ├── components/
│   │   ├── wallet/ConnectButton.tsx   # 'use client' - MetaMask connect, chain switch
│   │   ├── swap/SwapWidget.tsx        # 'use client' - amount in, estimated out, price impact
│   │   ├── liquidity/AddLiquidity.tsx
│   │   ├── liquidity/RemoveLiquidity.tsx
│   │   ├── portfolio/PositionCard.tsx
│   │   └── ui/                        # shadcn primitives
│   ├── hooks/
│   │   ├── useWeb3.ts                 # BrowserProvider, signer, account, events (single source of truth)
│   │   ├── useToken.ts                 # ERC20 metadata + balance + approval
│   │   ├── usePair.ts                 # pair address, reserves, cumulative prices (TWAP)
│   │   ├── useSwap.ts                 # swapExactTokensForTokens + approval flow + tx state
│   │   ├── useLiquidity.ts            # add/removeLiquidity + LP balance
│   │   └── useTwapPrice.ts            # TWAP window computation from cumulative prices
│   ├── lib/
│   │   ├── contracts/abis.ts          # imported from contracts/out (codegen)
│   │   ├── contracts/addresses.ts     # per-chain deployed addresses (anvil/sepolia)
│   │   ├── contracts/tokens.ts        # WETH/USDC/DAI/WBTC decimals/addresses
│   │   ├── chains.ts                  # anvil (31337) + sepolia (11155111) config
│   │   ├── rpc.ts                     # JsonRpcProvider for server reads, BrowserProvider for client
│   │   ├── errors.ts                  # error code -> human message map (spec clarification)
│   │   └── format.ts                  # formatUnits by token decimals
│   ├── providers/Web3Provider.tsx     # 'use client' context wrapping useWeb3
│   └── styles/globals.css
└── tests/
    ├── unit/                          # Vitest hooks/lib tests
    └── e2e/                           # Playwright against local anvil
```

**Structure Decision**: Two independent packages under the repo root — `contracts/` (Foundry, existing) and `frontend/` (Next.js, replacing the Vite scaffold). Coupled only at build/test time through exported ABIs and a per-chain `addresses.ts` produced from Foundry `broadcast/` artifacts (see [contracts/frontend-module-api.md](./contracts/frontend-module-api.md)). No root monorepo workspace tool is added (per AGENTS.md: "No root opencode.json"; packages are independent), avoiding accidental coupling. The frontend imports deployed addresses + ABIs via a generated `src/lib/contracts/addresses.ts` to avoid drift.

## Complexity Tracking

> **Constitution violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Framework switch Vite -> Next.js (Frontend Requirements standard) | User explicitly mandated Next.js for App Router / SSR / file-based routing suited to a multi-page dApp and SC-004 (server-side read proxying for fast portfolio load). | Keeping Vite would honor the constitution literally but contradict the explicit user instruction and lose the SSR/route-handler read-proxy performance path. Constitution's *spirit* (TypeScript + ethers v6 + responsive + error handling) is preserved; only the bundler/routing layer changes. Amendment recorded above (v1.0.0 -> v1.1.0). |
| Solidity `^0.8.19` vs reference repos' 0.8.30 | (Not a violation — listed to forestall drift) Reference Foundry UniswapV2 repos use 0.8.30, but constitution pins `^0.8.19`. | Adopting 0.8.30 would deviate from the constitution for no functional gain in this resume scope. Stays at `^0.8.19`. |

## Quick Reference: Phase Outputs

- **Phase 0** -> [research.md](./research.md) (all NEEDS CLARIFICATION resolved)
- **Phase 1** -> [data-model.md](./data-model.md), [contracts/smart-contract-interfaces.md](./contracts/smart-contract-interfaces.md), [contracts/frontend-module-api.md](./contracts/frontend-module-api.md), [quickstart.md](./quickstart.md)

## Post-Design Constitution Re-check

After Phase 1 design, no new violations were introduced:
- The data model and contract interface design retain direct-pair-only swaps (FR-011), TWAP-only pricing, reentrancy guard, access control, and ≥95% test intent — fully aligned with Principles I–V.
- The Next.js amendment is the only deviation and is justified above with a recorded constitution amendment path.
- **Gate: PASS.** Ready for `/speckit.tasks` (Phase 2).