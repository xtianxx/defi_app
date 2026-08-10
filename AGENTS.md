# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-10
**Commit:** f6bd597
**Branch:** 002-sepolia-vercel-deploy

## OVERVIEW
Monorepo for a Uniswap V2–style DEX resume project. Two independent packages — `contracts/` (Foundry; core + router implemented) and `frontend/` (Next.js 15 App Router dApp) — plus `specs/` (authoritative feature docs). The old Vite/`Counter.sol` scaffold is gone; the dev loop lives in root `scripts/`.

Two feature specs exist: `001-uniswap-v2-resume` (the DEX itself, fully implemented) and `002-sepolia-vercel-deploy` (Sepolia testnet + Vercel hosting + demo accounts/faucet for interviewers — **plan + tasks complete, no code changes yet**; contracts/frontend remain anvil-only until implemented). 002's design artifacts (spec/plan/tasks/research/data-model/quickstart/contract interfaces) live in `specs/002-sepolia-vercel-deploy/` — all tracked, including `tasks.md`. **002 tasks T001–T036 are mirrored as GitHub issues** (`xtianxx/defi_app` #8–#43): use the task ID (`T0XX`) as the canonical link, and never re-create issues for a task that already has one. 002 implementation will add a `DemoFaucet` contract, multi-chain frontend wiring (Sepolia chainId 11155111), and a `/faucet` page.

## DEV WORKFLOW (use these first)
| Command | Purpose |
|---|---|
| `./scripts/test-unit.sh [--forge-only\|--vitest-only\|--watch]` | forge test -vvv + vitest run (default: both) |
| `./scripts/test-e2e.sh [--unit-only\|--no-playwright\|--dev]` | Fresh anvil (31337:8545) → DeployDemo → sync → forge test → vitest → [full] next build + Playwright |
| `./scripts/test-e2e-phase5.sh [--playwright\|--dev]` | US3 (liquidity-removal) loop: anvil → DeployDemo → sync → **LP-readiness gate** (deployer LP > 0); `--playwright` filters to remove-liquidity specs |
| `./scripts/dev-deploy.sh [--dev]` | Fresh anvil → deploy demo → sync addresses → verify swap-ready (WETH bal > 0); **anvil stays running**; `--dev` also starts `npm run dev` |

Focused checks: `forge test --match-contract UniswapV2Pair -vvvv` (contracts/) · `npx vitest run tests/unit/<file>` · `npx tsc --noEmit` · `npm run lint` (frontend/).

**After clone:** `forge install` in contracts/ — and install `openzeppelin-contracts` too (in `lib/` + remappings but NOT in `.gitmodules`) · `npm install` in frontend/.

## STRUCTURE
```
contracts/      Foundry, solc 0.8.19, via_ir, optimizer 200 runs
  src/core/       UniswapV2Factory/Pair/ERC20; libraries/ Math, SafeMath, UQ112x112
  src/router/     UniswapV2Router02, WETH9; libraries/ UniswapV2Library, TransferHelper
  script/         DeployDemo.s.sol ← main demo (Factory+Router+WETH9+4 tokens, 2 seeded pairs)
frontend/       Next.js 15 App Router · React 19 · TS 6 strict · ethers v6 · tailwind+shadcn · react-query
  src/app/        /swap /liquidity /portfolio /debug pages + api/reserves/route.ts (server-side RPC reads)
  src/hooks/      useWeb3, useToken, usePair, useSwap, useLiquidity, useTwapPrice, usePortfolio, useEarnedFees
  src/lib/        chains.ts (anvil 31337), rpc.ts, tx.ts, contracts/ (generated bindings)
  tests/          unit/ (vitest + testing-library, jsdom) · e2e/ (Playwright: portfolio, remove-liquidity, responsive + fixtures/wallet.ts) · load/ (swap-readonly.js + RESULTS.md)
scripts/        dev-deploy.sh, test-unit.sh, test-e2e.sh, test-e2e-phase5.sh — the canonical dev loop
specs/001-uniswap-v2-resume/   spec.md · plan.md · tasks.md · quickstart.md (runnable guide)
specs/002-sepolia-vercel-deploy/  spec.md · plan.md · tasks.md · research.md · data-model.md · quickstart.md · contracts/ (faucet + frontend API contracts) — plan + tasks complete, no code yet
.github/workflows/test.yml     CI: contracts fmt→build(--sizes)→test; frontend tsc→lint→vitest→build
.specify/       Speckit planning framework + constitution.md (5 principles; CI gates cite them)
```

## WHERE TO LOOK
| Task | Location |
|---|---|
| Spec / plan / task breakdown | specs/001-uniswap-v2-resume/{spec,plan,tasks}.md (implemented) · specs/002-sepolia-vercel-deploy/{spec,plan,tasks,research,data-model,quickstart}.md + checklists/ + contracts/ (Sepolia/Vercel demo — plan + tasks complete, no code yet) |
| Runnable validation guide | specs/001-uniswap-v2-resume/quickstart.md |
| Research / data model / phase checklists | specs/001-uniswap-v2-resume/{research,data-model}.md · specs/001-uniswap-v2-resume/checklists/ |
| Governing rules (v1.1.0) | .specify/memory/constitution.md |
| Deploy scripts | contracts/script/DeployDemo.s.sol (+ core/DeployFactory.s.sol, router/DeployRouter.s.sol) |
| Frontend contract bindings | frontend/src/lib/contracts/ (generated — see GOTCHAS) |

## CONVENTIONS
- **Packages independent** — no root workspace, no cross-package imports
- **Tests**: contracts `test/*.t.sol` (`test_*()` / `testFuzz_*()`); frontend `tests/unit/*.test.{ts,tsx}`; `@/` alias → `src/` (tsconfig + vitest)
- **ethers v6 split**: server reads = JsonRpcProvider in route handlers; client writes = BrowserProvider via Web3Provider context
- **Generated bindings**: `sync-deploy.ts` writes **tracked** `addresses.ts` + `tokens.ts` and regenerates **gitignored** `abis.generated.ts` (from `contracts/out/` artifacts); `abis.ts` is a **curated tracked** file NOT touched by sync-deploy — add new ABI exports there by hand. Run via `npm run sync-deploy` in frontend/ — **no CLI args**; chainIds are **hardcoded `[31337]`** in the script (002 T008 extends to `[11155111]`); auto-finds `broadcast/DeployDemo.s.sol/<chainId>/run-latest.json` — `forge build` + deploy first
- **No .env needed** — chains/RPC hardcoded in `lib/chains.ts` for the anvil chain (chainId 31337); `.env` is already gitignored (002 T001 will add `.env.example` for SEPOLIA_RPC_URL at implementation time)

## GOTCHAS
- **Spec source of truth is `specs/`** — `.omo/specs/` is a partial mirror that diverges; never edit there
- **dev-deploy.sh leaves anvil running on purpose** (frontend needs the RPC; only failure paths kill it). Broadcasts need `--slow` or they can fail with EIP-1559 fee-estimation timeouts and never deploy
- **CI e2e job is disabled** (`if: false`) pending wiring of DeployDemo + sync-deploy; when re-enabled, its invocation `node scripts/sync-deploy.ts <broadcast-path> <chainId>` is **stale** — the argless form (`npm run sync-deploy`) must replace it
- **Deployer key** = anvil account 0, hardcoded in scripts: `0xac0974…ff80` (WETH+USDC+DAI+LP); accounts #1 (LP B: USDC+DAI+WBTC) / #2 (swapper: WETH+USDC+DAI) available for multi-user testing
- **Coverage/gas CI gates are conditional**: coverage runs only if `contracts/src/**/*.sol` exists; gas snapshot only with a committed `contracts/.gas-snapshot`
- **`contracts/broadcast/31337/` is gitignored** — re-run DeployDemo to refresh frontend bindings
- **CI push trigger is `main` + `001-**` only** — pushing feature branches like `002-*` runs no CI until a PR is opened (pull_request triggers on all branches)
- **Docs are bilingual, Chinese-primary**: root `README.md` (Chinese) + `README.en.md` (English); `contracts/README.md` and `frontend/README.md` are single English files — no `.en.md` sibling in subpackages
