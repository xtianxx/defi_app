# Implementation Plan: Sepolia Testnet & Vercel Deployment for Interview Demo

**Branch**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-sepolia-vercel-deploy/spec.md`

## Summary

Deploy the existing Uniswap V2 DEX (contracts + frontend, currently anvil-only) to a public, interviewer-ready demo environment:

- **Contracts** (FR-001): deploy the full stack (Factory, Router02, WETH9, USDC/DAI/WBTC, 2 seeded pairs) to **Sepolia** (chainId 11155111) via a new `DeployDemoSepolia.s.sol` script, verified on Sepolia Etherscan (FR-007).
- **Frontend** (FR-002/FR-003): deploy the Next.js 15 app to **Vercel** (Hobby tier, `frontend/` root dir), wired to the Sepolia deployment; server-side RPC reads use a server-only `SEPOLIA_RPC_URL` env var (never `NEXT_PUBLIC_`), wallet writes use the user's own provider. Multi-chain support is added to `chains.ts`, `sync-deploy.ts`, and the generated `addresses.ts`/`tokens.ts` so anvil (31337) and Sepolia (11155111) coexist.
- **Demo accounts** (FR-004/FR-005): two fresh Sepolia demo accounts (LP provider + swapper, mirroring the anvil roles) with documented credentials; master funding account charged once via public Sepolia faucets; replenishment via `cast` transfers from the master (≤5 min, FR-005/SC-003); documented re-seeding process.
- **In-app faucet** (FR-008): new pure on-chain `DemoFaucet` contract with a 24h per-wallet time-window rate limit, granting USDC/DAI/WBTC (via `MockERC20.mint`) and WETH (from a pre-funded reserve); no backend service, no server-held keys. New `/faucet` page in the frontend.
- **Demo guide** (FR-012): Chinese-primary interview demo script documenting accounts, addresses, pools, replenishment, and step-by-step expected results (P3).
- **Docs** (FR-010/FR-013): deployment guide (Chinese-primary, per repo convention) so a developer can reproduce the full deployment in under 30 minutes.

Regression requirement (FR-009/SC-006): the anvil local dev loop (`scripts/dev-deploy.sh`, `test-e2e.sh`, unit suites) keeps working unchanged; new code is additive (faucet contract + tests, multi-chain frontend wiring, new page).

## Technical Context

**Language/Version**: Solidity `^0.8.19` (Foundry: forge, cast) — unchanged from 001; TypeScript ~6 strict + React 19 + Next.js 15 (App Router) for the frontend.

**Primary Dependencies**: unchanged from 001 — ethers.js v6, Tailwind + shadcn/ui, @tanstack/react-query; no new runtime libraries required. New contracts-side surface is a self-written `DemoFaucet` (no OpenZeppelin dependency beyond what 001 already vendors).

**Storage**: No database. All state on-chain (Sepolia). Configuration remains versioned TS constants: `chains.ts` (chain metadata) + generated `addresses.ts`/`tokens.ts`/`abis.ts` from `sync-deploy.ts`. The only new secret is the Sepolia RPC key, held as a **server-only** Vercel/env var (`SEPOLIA_RPC_URL`), read exclusively inside the `api/reserves` route handler / server provider factory — never at client-imported module top level, never `NEXT_PUBLIC_`-prefixed.

**Testing**:
- Contracts: `forge test -vvv` — existing suites unchanged (regression) + new `test/faucet/DemoFaucet.t.sol` (rate-limit window, grant amounts, per-token transfer, boundary `vm.warp`, reentrancy-absent invariants); ≥95% coverage gate (Constitution III).
- Frontend: Vitest unit tests for new multi-chain `chains.ts`/`addresses.ts` logic and the `useFaucet` hook; existing suites unchanged. No Playwright against live Sepolia (flaky by nature) — validation via quickstart manual scenarios instead.
- Live-net validation: quickstart.md runnable scenarios (swap, add/remove liquidity, faucet claim, replenishment) with expected outcomes.

**Target Platform**:
- Contracts: EVM — Sepolia (11155111) for the public demo; anvil (31337) unchanged for local dev.
- Frontend: Vercel Hobby tier — `frontend/` imported as root directory, Next.js auto-detected, auto-deploy from `main`; Node runtime route handler (already `runtime = "nodejs"`); no `vercel.json` needed. Browser: modern evergreen + MetaMask (or EIP-1193 wallet).

**Project Type**: Web application / dApp — existing two-package monorepo (`contracts/` + `frontend/`); this feature adds deployment tooling, one new contract, and frontend multi-chain/faucet wiring.

**Performance Goals** (from spec SC-001..SC-007):
- First swap within 2 min of opening the public URL (SC-001) — bounded by wallet UX, not code.
- Portfolio/core pages load live data without errors on Sepolia (SC-004) — existing `unstable_cache` route handler (revalidate 2s) reused; Sepolia RPC round-trips ~100–500 ms, far under Vercel Hobby 300 s function limit.
- Reproducible full deployment from docs ≤ 30 min (SC-005).
- Demo-account replenishment ≤ 5 min (SC-003).

**Constraints**:
- No backend service, no server-held private keys (faucet is pure on-chain — FR-008 clarification).
- Sepolia RPC via Alchemy/Infura free tier only; public RPCs rejected (spec clarification).
- Testnet-only private keys in docs: accepted, documented risk (spec assumption).
- `SEPOLIA_RPC_URL` must not leak into the browser bundle (Vercel env naming rule).
- Broadcasts against Sepolia need `--slow` handling awareness (anvil EIP-1559 gotcha from 001 — re-validate on Sepolia).
- Constitution NON-NEGOTIABLE (Principle I): the new faucet contract must follow security patterns (no untrusted external calls, CEI ordering, input validation, exhaustive tests).
- Hosting: Hobby tier — 1-hour runtime log retention; GitHub **org** repos can't connect (must be a personal repo).

**Scale/Scope**: Resume demo — 4 tokens, 2 seeded pairs on Sepolia; 1 new contract (~60–80 LOC) + tests; 1 new frontend page + multi-chain wiring; 2 deploy scripts + doc set. Local anvil path untouched.

**Persistent Unknowns**: None — Phase 0 research (research.md) resolves: R0.1 Sepolia faucet landscape (master funding), R0.2 Vercel free-tier/env-var specifics (done), R0.3 Foundry Etherscan verification procedure, R0.4 faucet contract pattern.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution: `.specify/memory/constitution.md` v1.1.0 (amended 2026-07-27).

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| I | Smart Contract Security First (NON-NEGOTIABLE) | ✅ PASS | New `DemoFaucet` is a state machine over a per-wallet timestamp mapping: input validation (no msg.value needed; token list fixed), CEI ordering, no untrusted external calls (MockERC20 is self-owned project code; WETH9 is ours), rate-limit enforced before any state change; dedicated test suite (Phase 1 design below). AMM core untouched — no new security surface. |
| II | DeFi Protocol Compliance | ✅ PASS | No AMM/Uniswap V2 logic changes; faucet is a peripheral grant contract, not a trading primitive. Seeded pools on Sepolia keep the constant-product flows intact. |
| III | Test-Driven Development | ✅ PASS | Faucet contract: tests written first (rate limit, amounts, boundaries, events); ≥95% coverage gate applies to new contract; frontend multi-chain/faucet logic covered by Vitest. Existing suites must still pass (SC-006). |
| IV | Professional Code Quality | ✅ PASS | NatSpec on all public faucet functions; `forge fmt`; deploy scripts documented; generated bindings follow existing conventions. |
| V | Documentation & Reproducibility | ✅ PASS | Deployment guide (≤30 min repro, FR-010/SC-005), Chinese-primary demo guide (FR-012/SC-007), README update (FR-013), quickstart validation scenarios. |

### Gate Notes (accepted, documented — not violations)

| Item | Decision | Justification |
|------|----------|---------------|
| Testnet private keys published in demo guide | Accepted, documented risk | Spec assumption (line: "exposing testnet-only private keys is an accepted, documented risk"). Keys hold Sepolia-only test assets; master funding account key stays out of the guide (held by developer). |
| `MockERC20.mint` is permissionless | Accepted for testnet demo | `MockERC20` is a project-owned test fixture (001); the faucet exploits its open mint rather than introducing role/permission machinery. On a public testnet this is harmless (no real value); documented in research.md R0.4 alternatives. |
| New on-chain contract for faucet vs. backend service | Spec-mandated | FR-008 clarification (2026-08-10): pure contract, no backend. Simpler alternative (faucet API server) rejected by spec. |

**Gate Evaluation**: No principle violations. Veto gate (Principle I) PASS. **Proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/002-sepolia-vercel-deploy/
├── plan.md              # This file
├── research.md          # Phase 0: faucets / Vercel / verification research
├── data-model.md        # Phase 1: DemoAccount, TestToken, LiquidityPool, Deployment, FaucetGrant
├── quickstart.md        # Phase 1: runnable validation guide (Sepolia + demo flows)
├── demo-guide.md        # NEW (implementation phase): Chinese-primary interviewer script (FR-012)
├── contracts/           # Phase 1: faucet + deployment interface contracts
│   ├── faucet-contract.md
│   └── frontend-module-api.md   # multi-chain + faucet additions
└── checklists/requirements.md   # existing (spec quality — done)
```

### Source Code (repository root)

```text
contracts/
├── src/faucet/
│   └── DemoFaucet.sol            # NEW: on-chain faucet, 24h per-wallet rate limit
├── script/
│   ├── DeployDemo.s.sol          # UNCHANGED (anvil demo — regression path)
│   └── DeployDemoSepolia.s.sol   # NEW: Sepolia deploy + seeding + faucet funding
└── test/
    ├── faucet/DemoFaucet.t.sol   # NEW: rate-limit/amounts/boundaries tests
    └── (existing core/ router/ tests unchanged)

scripts/
├── dev-deploy.sh                 # UNCHANGED (anvil)
├── sepolia-deploy.sh             # NEW: full Sepolia loop — deploy --slow → verify →
│                                 #   sync-deploy 11155111 → funding/replenishment helpers
└── (test-unit.sh / test-e2e*.sh unchanged)

frontend/
├── src/lib/
│   ├── chains.ts                 # MODIFIED: + SEPOLIA_CHAIN_ID (11155111) + CHAINS entry
│   ├── rpc.ts                    # MODIFIED: server provider reads SEPOLIA_RPC_URL for 11155111
│   ├── contracts/addresses.ts    # REGENERATED (sync-deploy): multi-chain + faucet field
│   ├── contracts/tokens.ts       # REGENERATED (sync-deploy): addressByChain {31337, 11155111}
│   ├── contracts/abis.ts         # MODIFIED: + DemoFaucet ABI export (curated file — see GOTCHA)
│   └── contracts/abis.generated.ts  # gitignored legacy (unchanged)
├── src/app/
│   ├── api/reserves/route.ts     # MODIFIED: env-driven RPC for Sepolia (server-only)
│   └── faucet/                   # NEW: page (client)
├── src/components/faucet/        # NEW: FaucetWidget (+ countdown, claim button)
├── src/hooks/useFaucet.ts        # NEW: phase machine (idle→claiming→mining→confirmed)
└── scripts/sync-deploy.ts        # MODIFIED: chainIds [31337, 11155111] + faucet address

README.md (+ README.en.md)        # MODIFIED: deployment guide link + Sepolia section (FR-013)
```

**Structure Decision**: Keeps the existing two-package monorepo exactly as-is (no root workspace, per repo convention). All changes are additive within existing directories: the faucet follows the `src/core|router` → `src/faucet/` pattern; deploy scripts stay in `contracts/script/`; the canonical shell-loop pattern extends `scripts/` with `sepolia-deploy.sh`; frontend wiring follows the established `hooks/` + `components/` + `app/` layout. No new top-level packages — Complexity Tracking n/a.

**Key design decisions (details in research.md / contracts/):**
1. **Server-only RPC key**: `SEPOLIA_RPC_URL` env var (no `NEXT_PUBLIC_`), read only inside `createServerProvider`/route handler; client never touches it (wallet BrowserProvider covers client reads). Vercel: set for Production + Preview.
2. **Multi-chain sync-deploy**: `chainIds = [31337, 11155111]`; broadcast for 11155111 lives locally (gitignored) after the Sepolia deploy; regenerated `addresses.ts`/`tokens.ts` are **tracked** and committed with Sepolia addresses (testnet-public). Deployment interface gains `faucet` field.
3. **Faucet mechanics**: `request()` grants the fixed token set once per wallet per 24 h; USDC/DAI/WBTC minted via `MockERC20.mint`, WETH transferred from a deploy-time-funded reserve; `nextEligibleTime(address)` view powers the UI countdown (SC: "explains the limit and when they can request again").
4. **Demo accounts**: fresh keys generated for Sepolia (anvil's well-known keys are public knowledge and would be drained); roles LP provider + swapper mirror 001; keys + addresses live in demo-guide.md.
5. **Vercel**: import `frontend/` as root directory; framework auto-detected; auto-deploy from `main`; no `vercel.json`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No gate violations — table intentionally empty. New complexity (one faucet contract, multi-chain config) is the minimum that satisfies FR-008 and FR-001/FR-003; simpler alternatives (faucet backend service; single-chain fork of the frontend) were rejected in the spec clarification and research (R0.2, R0.4).
