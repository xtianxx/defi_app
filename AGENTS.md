# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-10
**Commit:** f8d28b3
**Branch:** 002-sepolia-vercel-deploy

## OVERVIEW
Monorepo for a Uniswap V2–style DEX resume project. Two independent packages — `contracts/` (Foundry; core + router implemented) and `frontend/` (Next.js 15 App Router dApp) — plus `specs/` (authoritative feature docs). The old Vite/`Counter.sol` scaffold is gone; the dev loop lives in root `scripts/`.

Two feature specs exist: `001-uniswap-v2-resume` (the DEX itself, fully implemented) and `002-sepolia-vercel-deploy` (Sepolia testnet + Vercel hosting + demo accounts/faucet for interviewers — **spec-phase only, no code changes yet**; contracts/frontend remain anvil-only until implemented).

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
  src/hooks/      useWeb3, useToken, usePair, useSwap, useLiquidity, useTwapPrice
  src/lib/        chains.ts (anvil 31337), rpc.ts, tx.ts, contracts/ (generated bindings)
  tests/          unit/ (vitest + testing-library, jsdom); e2e/ and load/ are EMPTY
scripts/        dev-deploy.sh, test-unit.sh, test-e2e.sh, test-e2e-phase5.sh — the canonical dev loop
specs/001-uniswap-v2-resume/   spec.md · plan.md · tasks.md · quickstart.md (runnable guide)
specs/002-sepolia-vercel-deploy/  spec.md · checklists/requirements.md (Draft; no plan/tasks yet)
.github/workflows/test.yml     CI: contracts fmt→build(--sizes)→test; frontend tsc→lint→vitest→build
.specify/       Speckit planning framework + constitution.md (5 principles; CI gates cite them)
```

## WHERE TO LOOK
| Task | Location |
|---|---|
| Spec / plan / task breakdown | specs/001-uniswap-v2-resume/{spec,plan,tasks}.md (implemented) · specs/002-sepolia-vercel-deploy/spec.md (Draft — Sepolia/Vercel demo) |
| Runnable validation guide | specs/001-uniswap-v2-resume/quickstart.md |
| Research / data model / phase checklists | specs/001-uniswap-v2-resume/{research,data-model}.md · specs/001-uniswap-v2-resume/checklists/ |
| Governing rules (v1.1.0) | .specify/memory/constitution.md |
| Deploy scripts | contracts/script/DeployDemo.s.sol (+ core/DeployFactory.s.sol, router/DeployRouter.s.sol) |
| Frontend contract bindings | frontend/src/lib/contracts/ (generated — see GOTCHAS) |

## CONVENTIONS
- **Packages independent** — no root workspace, no cross-package imports
- **Tests**: contracts `test/*.t.sol` (`test_*()` / `testFuzz_*()`); frontend `tests/unit/*.test.{ts,tsx}`; `@/` alias → `src/` (tsconfig + vitest)
- **ethers v6 split**: server reads = JsonRpcProvider in route handlers; client writes = BrowserProvider via Web3Provider context
- **Generated bindings**: `sync-deploy.ts` overwrites **tracked** `addresses.ts` + `tokens.ts` + `abis.ts`; `abis.generated.ts` is **gitignored** (legacy, not regenerated) — `forge build` + deploy first, then `node scripts/sync-deploy.ts <chainId>` (auto-finds `broadcast/DeployDemo.s.sol/<chainId>/run-latest.json`)
- **No .env needed** — chains/RPC hardcoded in `lib/chains.ts` for the anvil chain (chainId 31337)

## GOTCHAS
- **Spec source of truth is `specs/`** — `.omo/specs/` is a partial mirror that diverges; never edit there
- **dev-deploy.sh leaves anvil running on purpose** (frontend needs the RPC; only failure paths kill it). Broadcasts need `--slow` or they can fail with EIP-1559 fee-estimation timeouts and never deploy
- **CI e2e job is disabled** (`if: false`) pending wiring of DeployDemo + sync-deploy
- **Deployer key** = anvil account 0, hardcoded in scripts: `0xac0974…ff80` (WETH+USDC+DAI+LP); accounts #1 (LP B: USDC+DAI+WBTC) / #2 (swapper: WETH+USDC+DAI) available for multi-user testing
- **Coverage/gas CI gates are conditional**: coverage runs only if `contracts/src/**/*.sol` exists; gas snapshot only with a committed `contracts/.gas-snapshot`
- **`contracts/broadcast/31337/` is gitignored** — re-run DeployDemo to refresh frontend bindings
- **CI push trigger is `main` + `001-**` only** — pushing feature branches like `002-*` runs no CI until a PR is opened (pull_request triggers on all branches)
- **Docs are bilingual, Chinese-primary**: `README.md` is the Chinese root doc; English lives in `README.en.md` (contracts/ and frontend/ READMEs follow the same pattern)
