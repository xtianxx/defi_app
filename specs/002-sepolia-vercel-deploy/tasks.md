# Tasks: Sepolia Testnet & Vercel Deployment for Interview Demo

**Feature**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10
**Input**: Design documents from `specs/002-sepolia-vercel-deploy/` (plan.md, spec.md, research.md, data-model.md, quickstart.md, contracts/)

**Prerequisites**: Contracts + frontend already implemented (feature 001). This feature is **additive** — the anvil local loop (FR-009/SC-006) must keep working unchanged.

**Tests**: Contract tests are REQUIRED by the spec (Constitution III TDD; plan.md Testing section; faucet-contract.md §5 lists concrete cases). Frontend Vitest cases are required for new multi-chain + faucet logic (plan.md Testing). Live-network behavior is validated via quickstart.md scenarios (VS-1..VS-5), not automated tests (Sepolia E2E is flaky by nature).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1..US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Environment variables, demo keys, and master funding — everything needed before any deployment code can run.

- [X] T001 Create `contracts/.env.example` with placeholders for `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `SEPOLIA_DEPLOYER_KEY` (comments noting they are server/deploy-only, never `NEXT_PUBLIC_`); confirm `.env` is gitignored (contracts/ or root `.gitignore` — verify no `.env` is tracked)
- [X] T002 [P] Generate 3 fresh Sepolia demo keys with `cast wallet new` (never reuse anvil's well-known keys — plan D5): **master** (deployer + replenishment source; store key in `contracts/.env` as `SEPOLIA_DEPLOYER_KEY`, NEVER documented), **LP provider**, **swapper**; record the two demo addresses in a draft section of `specs/002-sepolia-vercel-deploy/demo-guide.md` (credentials finalized in T019/T031)
- [X] T003 [P] Fund the **master** account with 0.25–0.5 ETH via public Sepolia faucets following research.md R0.1 checklist (budget: ~0.02–0.03 ETH deploy gas + demo-account ETH/WETH funding + 0.2 ETH initial faucet WETH reserve — see T010; Chainstack one-shot tops to 0.5 ETH, else Google Cloud Web3 faucet + ethfaucet supplement over a few days; pk910 PoW as emergency fallback); verify with `cast balance <master> --rpc-url "$SEPOLIA_RPC_URL"` — faucet payouts can take minutes-to-hours, re-check before proceeding

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Multi-chain frontend infrastructure that MUST be complete before US1 (Sepolia public demo) and US3 (faucet) can be implemented. BLOCKS all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Add `SEPOLIA_CHAIN_ID = 11155111` and a `CHAINS[11155111]` entry in `frontend/src/lib/chains.ts` per frontend-module-api.md §1: hex `0xaa36a7`, name "Sepolia", explorerUrl `https://sepolia.etherscan.io`, nativeCurrency ETH, **rpcUrl: ""** (never baked into client-importable code — R0.2). `isSupportedChain(11155111)` must return true; anvil entry unchanged
- [X] T005 [P] Create Vitest suite `frontend/tests/unit/chains.test.ts`: Sepolia entry shape, `isSupportedChain(11155111)` → true, `getBlockExplorerTxUrl(11155111, hash)` → `https://sepolia.etherscan.io/tx/{hash}`, existing anvil assertions unchanged (follow 001 test conventions: `npx vitest run tests/unit/chains.test.ts`)
- [X] T006 Implement `createServerProvider(chainId)` in `frontend/src/lib/rpc.ts` per frontend-module-api.md §2: for `SEPOLIA_CHAIN_ID` resolve `process.env.SEPOLIA_RPC_URL` **inside the function body** (never module top-level, never in a client-imported path); throw a clear error if unset; `new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true })`; default chainId stays `ANVIL_CHAIN_ID` (regression)
- [X] T007 [P] Create Vitest suite `frontend/tests/unit/rpc.test.ts`: env resolution for 11155111 (mock `process.env.SEPOLIA_RPC_URL`), missing-env error, anvil path unchanged; extend `frontend/tests/unit/reservesRoute.test.ts` with a `chainId=11155111` mock-provider fetch case (existing pattern in that file)
- [X] T008 Extend `frontend/scripts/sync-deploy.ts` per frontend-module-api.md §3: `chainIds = [ANVIL_CHAIN_ID, SEPOLIA_CHAIN_ID]` (no CLI args — matches AGENTS.md convention), add `faucet: string` to the `Deployment` interface (ZERO-filled when absent), write `DEPLOYMENTS: {31337, 11155111}` keys in `addresses.ts` and `addressByChain: {31337, 11155111}` in `tokens.ts`; a missing broadcast for one chain must NEVER clobber the other chain's committed values; update the quickstart.md step-4 example (`node scripts/sync-deploy.ts` — no argument) to match
- [X] T009 [P] Create Vitest suite `frontend/tests/unit/bindings.test.ts`: multi-chain lookup behavior — `getDeployment(11155111)` present after generation, `isDeploymentConfigured` semantics unchanged (factory/router/weth non-zero), ZERO-handling for missing faucet/chain keys (test against the generated `frontend/src/lib/contracts/addresses.ts` + `tokens.ts`)

**Checkpoint**: Foundation ready — multi-chain config, server-only RPC resolution, and multi-chain sync-deploy all tested. User story implementation can now begin.

---

## Phase 3: User Story 1 - Publicly Accessible DEX Demo on Sepolia (Priority: P1) 🎯 MVP

**Goal**: The full DEX (factory, router, WETH, tokens, 2 seeded pairs) deployed and verified on Sepolia; the Next.js app deployed to Vercel serving live Sepolia data from a public URL; clear wrong-network guidance.

**Independent Test** (VS-1): Open the public URL in a fresh browser on any machine, connect a Sepolia wallet, complete one swap and one liquidity add; all core pages load live data; switching to mainnet shows the Sepolia switch message.

> **NOTE**: T010 (deploy script) imports `DemoFaucet` — the contract from US3. Both are P1; if implementing solo, pull T021→T022 (faucet contract + tests) forward and complete them **before** T010. This does not change story ownership: T021/T022 remain US3 tasks.

### Implementation for User Story 1

- [X] T010 [US1] Create `contracts/script/DeployDemoSepolia.s.sol` mirroring `contracts/script/DeployDemo.s.sol` structure: deploy MockERC20 (USDC/DAI/WBTC) + WETH9 + Factory + Router02; create + seed WETH/USDC and WETH/DAI pairs (same 100 WETH / 200k scale constants as anvil); fund LP-provider and swapper accounts (ETH + tokens); deploy `DemoFaucet` (import `contracts/src/faucet/DemoFaucet.sol` — requires T022) and fund its WETH reserve via `weth.transfer(faucet, FAUCET_WETH_RESERVE)` AFTER deployment (WETH cannot be minted — R0.4); define `FAUCET_WETH_RESERVE = 0.2 ether` (initial 2 grants, expandable via `reseed-pools` top-up — T017); deployer = master key from `SEPOLIA_DEPLOYER_KEY`; NatSpec + `forge fmt`
- [X] T011 [US1] Create `scripts/sepolia-deploy.sh` (canonical shell-loop pattern from `scripts/dev-deploy.sh`): preflight (env `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `SEPOLIA_DEPLOYER_KEY` present; master balance ≥ 0.05 ETH) → dry-run simulation `forge script script/DeployDemoSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" -vvv` WITHOUT `--broadcast` (verifies the script executes against live Sepolia state before spending gas — Constitution pre-deployment checklist "deployment scripts verified on forked network") → `forge script script/DeployDemoSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast --verify --etherscan-api-key "$ETHERSCAN_API_KEY" --slow -vvv` (constructor args auto-decoded; `--slow` per 001 gotcha) → `node frontend/scripts/sync-deploy.ts` → print address + verification summary table; fail loudly on any step
- [X] T012 [US1] Verify/adjust wrong-network UX per frontend-module-api.md §6 (FR-003/US1-4): wallet on mainnet/other chain shows "请切换到 Sepolia 测试网" + concrete switch steps (MetaMask network add: chainId 11155111, RPC from provider docs — the PUBLIC wallet RPC, distinct from server-only `SEPOLIA_RPC_URL`); reuse existing `decodeError` wrong-network path in `frontend/src/lib/errors.ts`; confirm flows through swap/liquidity/portfolio widgets
- [X] T013 [US1] Run `scripts/sepolia-deploy.sh` against live Sepolia (master must be funded — T003); commit regenerated tracked bindings `frontend/src/lib/contracts/addresses.ts` + `frontend/src/lib/contracts/tokens.ts` (Sepolia addresses are testnet-public — plan D7; broadcast JSON stays gitignored)
- [X] T014 [US1] Verify SC-002: ALL deployed contracts (Factory, Router02, WETH9, USDC, DAI, WBTC, 2 pairs, DemoFaucet) show verified source on `sepolia.etherscan.io`; if the script `--verify` path missed any, fall back to `forge verify-contract <ADDR> <Path.sol:Name> --chain 11155111 --compiler-version 0.8.19 --optimizer-runs 200 --via-ir --watch` (research.md R0.3; add `--skip-is-verified-check` if "Already verified", `--verifier-url "https://api.etherscan.io/v2/api?chainid=11155111"` for V2 keys)
- [X] T015 [US1] Deploy frontend to Vercel Hobby tier per frontend-module-api.md §8: import the **personal** GitHub repo (org repos can't connect — R0.2), Root Directory: `frontend/` (Next.js auto-detected, no vercel.json), set `SEPOLIA_RPC_URL` env for **Production + Preview**, production branch `main` → auto-deploy; verify the production URL loads and `/api/reserves?chainId=11155111` returns live Sepolia data (SC-004)
- [ ] T016 [US1] Validate VS-1 end-to-end: fresh browser → connect Sepolia wallet → swap 10 USDC→WETH mined on-chain + balances update + explorer link works; add liquidity to WETH/USDC (LP tokens appear); swap/liquidity/portfolio pages all load live data; switch wallet to mainnet → clear "请切换到 Sepolia" message (SC-001, SC-004)

**Checkpoint**: US1 complete — the DEX is demonstrable from any machine at a public URL.

---

## Phase 4: User Story 2 - Ready-to-Use Demo Accounts with Test Tokens (Priority: P1)

**Goal**: Two documented demo accounts (LP provider + swapper) pre-funded with test ETH and project tokens; a ≤5-min replenishment path (master `cast send` primary, public faucets fallback); documented pool re-seeding.

**Independent Test** (VS-2): Import a sample account into a browser wallet and, without any external faucet, complete a swap, an add-liquidity, and a remove-liquidity flow; deplete ETH → replenish within 5 minutes (SC-003).

### Implementation for User Story 2

- [X] T017 [US2] Extend `scripts/sepolia-deploy.sh` with helper subcommands: `fund-demo-accounts` (master `cast send` ETH to LP + swapper; `MockERC20.mint` USDC/DAI/WBTC per account per anvil constants; wrap ETH via `WETH9.deposit` + transfer for WETH) and `reseed-pools` (restore WETH/USDC + WETH/DAI seed reserves + faucet WETH reserve top-up via master; see quickstart.md step 6). File already owned by T011 — sequential, no [P]
- [X] T018 [US2] Execute funding: run `./scripts/sepolia-deploy.sh fund-demo-accounts`; verify LP-provider + swapper each hold test ETH (gas) + WETH/USDC/DAI/WBTC balances (FR-004); record final balances in demo-guide.md
- [X] T019 [US2] Draft `specs/002-sepolia-vercel-deploy/demo-guide.md` sections (merge T002 draft): account credentials + roles (LP provider/swapper — master key stays private), funded balance table, replenishment process (primary: master `cast send`, ≤5 min, SC-003; fallback: public faucets checklist per research.md R0.1), pool re-seeding process; narrative demo script + expected results finalized in T031
- [ ] T020 [US2] Validate VS-2: import LP-provider account in MetaMask → swap + add + remove liquidity all succeed with gas covered (approvals guided); drain account ETH → follow replenishment process → usable again within 5 minutes (FR-005, SC-003)

**Checkpoint**: US2 complete — demo can run immediately without external faucets.

---

## Phase 5: User Story 3 - In-App Test Token Faucet (Priority: P1)

**Goal**: Pure on-chain `DemoFaucet` (24h per-wallet window, no owner/no backend) granting WETH/USDC/DAI/WBTC to any connected wallet, plus a `/faucet` page with grant table, claim button, countdown, and human-readable errors.

**Independent Test** (VS-3): Connect any wallet → claim → tokens arrive on-chain within one minute; second claim shows countdown; disconnect shows connect prompt.

> **NOTE**: T021/T022 are the hard prerequisite of US1's T010 — implement them first if following phase order (see Phase 3 note).

### Tests for User Story 3 (TDD — write FIRST, ensure they FAIL before implementation) ⚠️

- [X] T021 [P] [US3] Write contract test suite `contracts/test/faucet/DemoFaucet.t.sol` per faucet-contract.md §5: exact grant amounts per token (`test_Request_GrantsExactAmounts`), revert within window (`test_Request_RateLimitedWithinWindow`), eligible after window via `vm.warp` (`test_Request_EligibleAfterWindow`), exact boundary `+WINDOW` ok / `+WINDOW - 1` reverts (`test_Request_BoundaryExactWindow`), `request{value: 1}` reverts non-payable (`test_Request_RejectsEth`), drained-reserve revert (`test_Request_RevertsWhenWethReserveEmpty`), `test_NextEligibleTime_ZeroBeforeFirstRequest` / `test_NextEligibleTime_EqualsLastPlusWindow` — nextEligibleTime views, event emission `Requested(wallet, ts)`, per-wallet independence, fuzz `testFuzz_Request_AnyWalletEligibleAfterWindow`. Run `forge test --match-contract DemoFaucet -vvv` → must FAIL (contract absent)

### Implementation for User Story 3

- [X] T022 [US3] Implement `contracts/src/faucet/DemoFaucet.sol` per faucet-contract.md: constants (`WINDOW = 24 hours`, `WETH_AMOUNT = 0.1 ether`, `USDC_AMOUNT = 200e6`, `DAI_AMOUNT = 200e18`, `WBTC_AMOUNT = 1e6` (0.01 WBTC @ 8 decimals — matches T030/VS-3 grant table)); immutable `weth` (IERC20) + `usdc/dai/wbtc` (MockERC20, imported from `../../test/mocks/MockERC20.sol`); `mapping(address => uint256) lastRequestAt`; `request()` — rate-limit check first, then mint×3 + WETH transfer from reserve, state write LAST (CEI), emit `Requested`; reverts `"DemoFaucet: rate limited"` / `"DemoFaucet: weth reserve empty"`; non-payable, no receive; `nextEligibleTime(address)` view; full NatSpec. Make T021 pass; `forge fmt`; `forge coverage` on the contract ≥ 95% (Constitution III)
- [X] T023 [US3] Additively extend `contracts/script/DeployDemo.s.sol` (anvil): after existing seeding, deploy `DemoFaucet` and fund its WETH reserve with `FAUCET_WETH_RESERVE = 0.2 ether` (same initial reserve as Sepolia — T010; existing behavior byte-for-byte unchanged — FR-009; makes `/faucet` locally testable per quickstart VS-4). Extend `contracts/script/DeployDemoSepolia.s.sol` only via T010 (do not duplicate here)
- [X] T024 [US3] Add `DemoFaucet_ABI` export to the curated `frontend/src/lib/contracts/abis.ts` (tracked file — see AGENTS.md GOTCHA; `abis.generated.ts` stays gitignored legacy)
- [X] T025 [US3] Create `frontend/src/hooks/useFaucet.ts` per frontend-module-api.md §5, mirroring `useSwap` conventions (`frontend/src/hooks/useSwap.ts`, `frontend/src/lib/tx.ts` waitForReceipt, `frontend/src/lib/errors.ts` decodeError): `FaucetPhase = "idle" | "claiming" | "mining" | "confirmed" | "reverted" | "rejected" | "error"`; `nextEligibleTime` + `grantAmounts` (contract constants) + `txHash`; `claim()` preconditions: signer + account + supported chain (11155111 or 31337) + `isDeploymentConfigured` + network matches; map reverts: rate limited → countdown message ("本钱包 24 小时内已领取过 — 下次可领取时间: {nextEligibleTime}"), weth reserve empty → "WETH 储备不足，请联系演示者补充"; `reset()`
- [X] T026 [P] [US3] Create Vitest suite `frontend/tests/unit/useFaucet.test.ts`: phase transitions (idle→claiming→mining→confirmed), rate-limited revert → error + countdown mapping, `nextEligibleTime` formatting, wrong-network gate, user-rejection → `rejected` (mock Web3Provider + generated addresses per 001 test conventions, e.g. `useSwap.test.ts`)
- [X] T027 [US3] Create `frontend/src/components/faucet/FaucetWidget.tsx` (props `{ deployment: Deployment }`) per frontend-module-api.md §4: not connected → connect prompt (no request button); eligible → grant table (amounts from contract constants) + Claim button; in-window → countdown "下次可领取: Xh Ym 后", button disabled (US3-3); success → confirmation + tx explorer link via `getBlockExplorerTxUrl` (US3-1); wrong network → switch-guidance message; errors → human-readable (FR-011)
- [X] T028 [US3] Create `frontend/src/app/faucet/page.tsx` (`'use client'`; wires `useWeb3` + `useFaucet` + `FaucetWidget`) and add a `/faucet` nav entry in `frontend/src/components/wallet/Navbar.tsx`
- [X] T029 [US3] Regenerate anvil bindings after T023 (`node frontend/scripts/sync-deploy.ts` from `frontend/`); confirm `faucet` field populated for 31337 in `frontend/src/lib/contracts/addresses.ts`; commit; verify `/faucet` works against local anvil (quickstart VS-4)
- [ ] T030 [US3] Validate VS-3 on Sepolia: connect visitor wallet → grant table shows 0.1 WETH / 200 USDC / 200 DAI / 0.01 WBTC → claim → tx confirmed, balances credited on-chain ≤ 1 min, success UI with explorer link; claim again immediately → rate-limit message + countdown + disabled button; disconnect → connect prompt (US3-1..US3-3)

**Checkpoint**: US3 complete — the demo is self-service for any visitor.

---

## Phase 6: User Story 4 - Interviewer Demo Guide (Priority: P3)

**Goal**: A concise Chinese-primary demo script a non-developer can follow unaided, with credentials, addresses, expected results, and failure-mode fallbacks.

**Independent Test** (SC-007): Hand the guide to someone unfamiliar with the project and watch them complete a swap and a liquidity flow without developer help.

### Implementation for User Story 4

- [X] T031 [US4] Finalize `specs/002-sepolia-vercel-deploy/demo-guide.md` (Chinese-primary, per repo convention): merge T019 drafts; structure = 演示前准备 (wallet requirement + Sepolia network add incl. the concrete public wallet RPC URL — from the provider dashboard, distinct from server-only `SEPOLIA_RPC_URL`) → 账户与余额 (LP provider + swapper credentials, funded balances) → 合约与代币地址 + 已建池 → 逐步演示脚本 (connect → check balances → swap → add liquidity → remove liquidity → faucet claim) with **expected on-screen result for every step** (spec US4-2/US4-3) → 补充流程 (replenishment ≤5 min, re-seed, faucet WETH top-up) → 故障排查 (wrong network, insufficient balance, missing approval, no wallet)
- [ ] T032 [US4] Validate SC-007: give the guide to someone unfamiliar with the project; they complete a swap and a liquidity flow without asking the developer for help; fix any ambiguous step found

**Checkpoint**: US4 complete — the interviewer can self-run the demo.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, regression, and quality gates across all stories.

- [X] T033 [P] Update `README.md` + `README.en.md` (repo root and `frontend/` per bilingual convention): add Sepolia/Vercel deployment guide section (FR-010 — reproduce full deployment in ≤30 min with per-step time budget), env var table (`SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `SEPOLIA_DEPLOYER_KEY` — server-only note), links to demo-guide.md + quickstart.md (FR-013)
- [ ] T034 [P] Full regression (SC-006/FR-009): `./scripts/test-unit.sh` (forge + vitest), `./scripts/dev-deploy.sh --dev` (anvil stays running, frontend on :3000, `/faucet` works on 31337), `./scripts/test-e2e.sh` — all green with ZERO behavioral changes to existing anvil flows; existing test suites pass unmodified (T023/T029 are additive by design)
- [X] T035 [P] Quality gates (Constitution + CI parity): `forge fmt` + `forge build --sizes` + `forge test -vvv` + `forge coverage` (new faucet contract ≥95%) in `contracts/` (+ `forge snapshot --check` only if a `contracts/.gas-snapshot` is committed — currently absent, CI parity per AGENTS.md); static analysis on the new faucet contract (`slither contracts/src/faucet/DemoFaucet.sol` if installed — Constitution Security; record results in checklists/, no high/critical findings, else record exemption in plan.md Gate Notes); `npx tsc --noEmit` + `npm run lint` + `next build` in `frontend/`
- [X] T036 [P] Document spec edge cases in `specs/002-sepolia-vercel-deploy/quickstart.md`: RPC slow/unavailable behavior (existing 502/`Retry-After` path + fallback guidance: check provider status/dashboard and swap in a second free-tier endpoint — spec edge case), wallet-less device note (guide + connect prompt), pre-existing token balances (display balances, never assume demo account)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately (T001..T003 all independent, T002/T003 parallel)
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all user stories (multi-chain config + sync-deploy + server RPC)
- **User Stories (Phase 3+)**: Depend on Phase 2. Execute sequentially in priority order; both P1 stories (US1, US2, US3) are designed to be independently implementable
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Phase 2 → T010 requires **T022** (DemoFaucet contract, US3) — implement T021→T022 before T010 (explicit cross-story dependency; both P1, solo-dev order: T021/T022 → US1 → US2 → rest of US3 → US4). T013 requires master funding (T003) + live Sepolia RPC.
- **US2 (P1)**: Phase 2 + live deployment (T013) + keys (T002). T017 extends the file created in T011 — must run after US1.
- **US3 (P1)**: Phase 2 (T008 supplies `faucet` binding field; T004 supplies chain entry). Contract (T021/T022) before any deploy script wiring (T010/T023).
- **US4 (P3)**: Live addresses + verified contracts (T013/T014) + funded accounts (T018) + drafts (T019).
- **Polish**: All stories.

### Within Each User Story

- Tests (where included) MUST be written and FAIL before implementation (T021 before T022; T005/T007/T009 before/during Phase 2 code; T026 before/with T025)
- Contract before deploy-script wiring (T022 → T010, T023)
- Hook before widget before page (T025 → T027 → T028)
- Live validation last (T016, T020, T030, T032)

### Parallel Opportunities

- **Setup**: T002 + T003 run in parallel (different domains)
- **Foundational**: T004 + T006 + T008 in parallel (different files); tests T005 + T007 + T009 in parallel
- **US3**: T021 (contract tests) parallel with T024 (ABI export); T023 + T026 parallel after T022; T025 (hook) → T027 (widget) → T028 (page) sequential by dependency
- **US2**: T017 + T019 parallel (script vs docs) after US1
- **Polish**: T033..T036 all parallel
- Never parallelize: writers of the same file (T011 then T017 — same `scripts/sepolia-deploy.sh`; T013 regenerates tracked bindings — no other writer at that time)

### Parallel Example: Foundational Phase

```bash
# Launch all code tasks together (different files):
Task: "T004 chains.ts Sepolia entry in frontend/src/lib/chains.ts"
Task: "T006 createServerProvider in frontend/src/lib/rpc.ts"
Task: "T008 sync-deploy multi-chain in frontend/scripts/sync-deploy.ts"

# Launch all test suites together:
Task: "T005 chains.test.ts"
Task: "T007 rpc.test.ts + reservesRoute extension"
Task: "T009 bindings.test.ts"
```

### Parallel Example: User Story 3 (after T022)

```bash
# Launch all independent lanes together:
Task: "T023 anvil DeployDemo.s.sol faucet wiring"
Task: "T024 DemoFaucet_ABI export in abis.ts"
Task: "T026 useFaucet.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup — env vars, keys, master funding (T001..T003)
2. Phase 2: Foundational — multi-chain frontend infra (T004..T009)
3. Pull forward US3's T021→T022 (faucet contract + tests — hard prerequisite of the deploy script)
4. Phase 3: US1 — DeployDemoSepolia + sepolia-deploy.sh + live Sepolia deployment + Vercel (T010..T016)
5. **STOP and VALIDATE**: VS-1 (fresh browser swap + liquidity + live pages) — the MVP is a public DEX demo

### Incremental Delivery

1. Setup + Foundational → foundation ready (all tests green)
2. + Faucet contract (T021/T022) → US1 (MVP!) → validate VS-1 → deploy/demo
3. + US2 demo accounts → validate VS-2 (SC-003)
4. + US3 faucet page → validate VS-3 → demo is self-service
5. + US4 demo guide → validate SC-007
6. Polish: README deployment guide (FR-013), full regression (SC-006), quality gates

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Developer A: US1 deploy scripts + Sepolia + Vercel (T010..T016)
3. Developer B: US3 faucet contract first (T021/T022 — needed by A), then frontend faucet (T023..T030)
4. Developer C: US2 demo accounts (after T013) + US4 guide (after T013/T018)
5. Team completes Polish together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable via its quickstart scenario (VS-1..VS-5)
- Verify tests fail before implementing (T021, T005/T007/T009, T026)
- Commit after each task or logical group (conventional commits)
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file parallel writes, cross-story dependencies that break independence (the only deliberate cross-story edge is T010 → T022, explicitly sequenced above)
- Do not modify the anvil dev loop (`scripts/dev-deploy.sh`, `test-e2e.sh`, existing tests) — additive changes only (FR-009)
- Live Sepolia operations (T013, T014, T015, T018, T030) require the developer's own API keys + funded master — spec'd env vars only, no secrets committed
