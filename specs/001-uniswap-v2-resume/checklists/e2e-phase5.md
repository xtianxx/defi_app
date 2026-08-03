# E2E Test Checklist — Phase 5 (User Story 3: Liquidity Removal)

**Generated:** 2026-08-02
**Scope:** End-to-end validation of US3 (remove liquidity) against a local anvil chain seeded by `contracts/script/DeployDemo.s.sol`.
**Status of code under test:** T052–T057 implementation + unit/component tests are complete (`[X]` in `tasks.md`). `frontend/tests/e2e/` is currently **empty** — this checklist defines the Playwright suite to be authored against it (see `tasks.md` T060 pattern for US4; US3 has no dedicated e2e task yet, so this checklist is the precursor).

---

## 1. Test Environment & Preconditions

| Item | Value | Notes |
|---|---|---|
| Chain | anvil, chainId `31337`, RPC `http://127.0.0.1:8545` | Fresh state per run |
| Deploy script | `contracts/script/DeployDemo.s.sol` | Deploys Factory + Router02 + WETH9 + USDC/DAI/WBTC, creates WETH/USDC + WETH/DAI pairs, **seeds LP to deployer (account #0)** via `pair.mint` |
| Frontend bindings | `node frontend/scripts/sync-deploy.ts 31337` | Regenerates `addresses.ts` + `tokens.ts` + `abis.generated.ts` from `broadcast/DeployDemo.s.sol/31337/run-latest.json` |
| Deployer / LP holder | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (anvil account #0) | Holds LP for WETH/USDC **and** WETH/DAI after DeployDemo — primary subject for remove-liquidity tests |
| Deployer private key | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` | Import into the test wallet |
| Seeded reserves (WETH/USDC) | 100 WETH / 200 000 USDC | price ≈ 2000 USDC/WETH; ~1% impact per 1 WETH swap |
| Seeded reserves (WETH/DAI) | 100 WETH / 200 000 DAI | second LP position for the deployer |
| Other anvil accounts | #1 `0x7099…79C8` (LP B), #2 `0x3C44…93BC` (swapper) | Funded but **no LP** — use for empty-state and multi-user cases |
| Frontend | `npm run dev` on `:3000` | Playwright `webServer` auto-starts it |
| Wallet in browser | EIP-1193 injected (MetaMask or test-injected mock) | Connect to anvil network, import deployer key |

**Hard precondition for ALL US3 e2e cases:** deployer `lpBalance > 0` on at least one seeded pair. The companion deploy script (`scripts/test-e2e-phase5.sh`) gates on this and fails fast if the seed is missing.

---

## 2. UI Surface Under Test

Page: `/liquidity` → **Remove** tab (`frontend/src/app/liquidity/page.tsx`).
Component: `frontend/src/components/liquidity/RemoveLiquidity.tsx`.
Hook: `frontend/src/hooks/useLiquidity.ts` (`removeLiquidity` / `removeLiquidityETH`, phase machine `idle→approving→submitting→mining→confirmed|reverted|rejected|error`).

**Stable selectors (use visible text / aria roles, not CSS classes):**

| Element | Locator anchor |
|---|---|
| Remove tab | button by text `Remove` (sibling `Add`) |
| Position row | button containing `WETH / USDC` (or `WETH / DAI`), `aria-pressed` reflects selection |
| LP available | text `{n} LP available` |
| Pool share | text `{n.nn}% of pool` |
| % presets | buttons `25%` / `50%` / `75%` / `100%` |
| Custom % | `input[type=number]` after `Custom` |
| Estimated returns | `You receive` block → rows `{symbolA}` / `{symbolB}` with formatted amounts |
| 100% warning | text `100% removal closes your position entirely.` + checkbox `I understand — close my position` |
| Permit toggle | checkbox labeled `Use permit instead of approve` |
| Slippage settings | `Settings` button (aria-label) → `Slippage tolerance` → `0.1%`/`0.5%`/`1.0%`/`2.0%`/`5.0%` |
| Main action | button with dynamic label: `Connect wallet` / `Select a position` / `Enter an amount` / `Confirm closing position` / `Remove Liquidity` / `Approving…` / `Submitting…` / `Mining…` / `Removed ✓` / `Reverted` / `Try again` |
| Success panel | text `Liquidity removed ✓` + link `View on explorer` + button `Remove another position` |
| Error panel | destructive panel showing `liq.error.message` |
| Empty state | `No active positions — add liquidity first.` / `Select a position to remove liquidity.` |

---

## 3. Test Cases

> Convention: `E2E-US3-<group>-<nn>` · **Pre** = preconditions · **Steps** = actions · **Expected** = observable outcome · **Pass** = assertion that must hold.

### Group A — US3-AC1: Estimated returns preview before confirmation
*Spec US3 Acceptance Scenario 1; FR-005 (preview) applied to removal.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-A-01 | anvil seeded; deployer connected | Open `/liquidity` → click `Remove` tab | Remove tab active; position list renders; ≥1 row shows `WETH / USDC` with `LP available > 0` | `Remove` button has primary style; row visible |
| E2E-US3-A-02 | A-01 | Click the `WETH / USDC` row | Row becomes selected (`aria-pressed=true`); % controls + `You receive` block appear; main button reads `Remove Liquidity` (disabled until % chosen) | selected row highlighted; controls visible |
| E2E-US3-A-03 | A-02 | Click `25%` preset | `lpToBurn = lpBalance * 25 / 100`; `You receive` shows non-zero `ETH (WETH unwrap)` and `USDC` amounts; amounts match `estimateRemoval(lpToBurn, totalSupply, reserve0, reserve1, token0, addressA)` | displayed `amountA`/`amountB` within 1 wei of on-chain `reserve * lpToBurn / totalSupply` |
| E2E-US3-A-04 | A-02 | Click `50%`, then `75%` | Estimated returns scale proportionally (≈2× and 3× the 25% values, within rounding) | ratio of 50%/25% ∈ [1.99, 2.01]; 75%/25% ∈ [2.99, 3.01] |
| E2E-US3-A-05 | A-02 | Type `33` in Custom input | `percent=33`; estimated returns update to `lpBalance*33/100`; preset highlight clears | custom value reflected; estimates non-zero |
| E2E-US3-A-06 | A-02 | Type `0` in Custom input | `lpToBurn=0`; main button reads `Enter an amount` and is disabled | button disabled; no estimate shown |
| E2E-US3-A-07 | A-02 | Type `150` in Custom input | Clamped to `100`; 100% warning appears | percent=100; warning visible |

### Group B — US3-AC2: Partial removal burns LP, returns proportional assets
*Spec US3 Acceptance Scenario 2; FR-004.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-B-01 | A-02 (WETH/USDC selected) | Snapshot `lpBalance_before`, `WETH_bal`, `USDC_bal` via cast/RPC | recorded | values captured |
| E2E-US3-B-02 | B-01 | Click `50%` → click `Remove Liquidity` | Phase transitions visible: `idle→approving` (token approve tx) `→submitting→mining→confirmed`; button label cycles `Remove Liquidity→Approving…→Submitting…→Mining…→Removed ✓` | each phase label observed in order |
| E2E-US3-B-03 | B-02 | Wait for success panel | `Liquidity removed ✓` panel; `View on explorer` link present; `txHash` non-empty | success panel visible; link href contains tx hash |
| E2E-US3-B-04 | B-03 | Re-query on-chain: `pair.balanceOf(deployer)`, native `ETH` balance, `WETH_bal`, `USDC_bal` | `lpBalance_after = lpBalance_before - lpToBurn` (within 1 wei); native ETH and USDC increase (ETH less gas), while wallet `WETH_bal` remains unchanged by the unwrap | on-chain deltas match preview ± slippage |
| E2E-US3-B-05 | B-04 | Click `Remove another position` | Form resets: `percent=25`, no pair selected, success panel hidden, main button `Select a position` | reset state confirmed |
| E2E-US3-B-06 | clean seed | Repeat B-01..B-04 for `WETH / DAI` at `25%` | Same proportional behavior; DAI (18 decimals) formatting correct | DAI amount formatted with 18-decimal precision |

### Group C — US3-AC3: 100% removal closes position
*Spec US3 Acceptance Scenario 3; FR-004.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-C-01 | A-02 | Click `100%` | 100% warning panel appears: `100% removal closes your position entirely.`; checkbox `I understand — close my position` shown; main button reads `Confirm closing position` and is **disabled** | warning visible; button disabled |
| E2E-US3-C-02 | C-01 | Click `Remove Liquidity` without checking the box | No tx submitted; button stays disabled | no phase transition; no RPC send |
| E2E-US3-C-03 | C-01 | Check `I understand — close my position` | Main button re-labels to `Remove Liquidity` and becomes enabled | button enabled |
| E2E-US3-C-04 | C-03 | Click `Remove Liquidity` → wait for confirmed | Success panel; on-chain `pair.balanceOf(deployer) == 0`; `pair.totalSupply` decreased by the burned LP | lpBalance == 0; totalSupply reduced |
| E2E-US3-C-05 | C-04 | Reload `/liquidity` → Remove tab | The closed pair no longer renders a position row (lpBalance 0 → row hidden); empty-state hint shows if no other positions | row absent for closed pair |

### Group D — removeLiquidityETH (WETH pair → ETH unwrap)
*FR-004; Router `removeLiquidityETH` path.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-D-01 | WETH/USDC position exists; deployer connected | Select `WETH / USDC` row → `50%` | Preview shows `ETH (WETH unwrap)` + `USDC` (the WETH leg is delivered as native ETH) | estimate non-zero for both |
| E2E-US3-D-02 | D-01 | Snapshot ETH balance (`cast balance`) + WETH balance | recorded | values captured |
| E2E-US3-D-03 | D-02 | Click `Remove Liquidity` → confirm | Phase machine reaches `confirmed`; Router calls `removeLiquidityETH` (unwrap WETH→ETH + transfer ETH) | success panel visible |
| E2E-US3-D-04 | D-03 | Re-query ETH balance + WETH balance | Native ETH balance increased by the WETH-leg amount (minus gas); WETH balance unchanged by unwrap (Router withdraws from pair, not deployer's WETH) | ETH delta ≈ preview WETH amount − gas |
| E2E-US3-D-05 | clean seed | Repeat on `WETH / DAI` at `100%` (with close confirmation) | Position fully closed; ETH + DAI returned | lpBalance == 0 |

### Group E — EIP-2612 permit flow (single signature, no approve tx)
*Router `removeLiquidityWithPermit` / `removeLiquidityETHWithPermit`; T052/T054.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-E-01 | A-02 | Check `Use permit instead of approve` | Toggle checked; hint `Sign one signature instead of an approval transaction.` visible | toggle checked |
| E2E-US3-E-02 | E-01 | Click `50%` → `Remove Liquidity` | Wallet prompts for a **signature** (not an approve tx); phase goes `idle→submitting` (skips `approving`); only one tx follows (the remove) | no approve tx sent; signature requested |
| E2E-US3-E-03 | E-02 | Sign + confirm remove tx | Phase `→mining→confirmed`; on-chain LP burned, assets returned as in Group B | success panel; on-chain deltas match |
| E2E-US3-E-04 | E-03 | Verify on-chain `pair.nonces(deployer)` incremented | nonce increased by 1 | nonce delta == 1 |

### Group F — Phase state machine & transaction feedback
*Mirrors `useSwap` phase machine per `frontend-module-api.md`.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-F-01 | A-02, `25%` | Reject the wallet's approve/sign prompt (code 4001) | Phase `→rejected`; **no scary error toast**; main button reads `Try again`; no tx hash | phase==rejected; no destructive panel |
| E2E-US3-F-02 | A-02, `25%` | Submit, then have the tx revert (e.g. manipulate `amountAMin` above actual via slippage settings `5%` + a prior price move, or anvil `anvil_mine` of a conflicting tx) | Phase `→reverted`; error panel shows decoded contract revert (e.g. `INSUFFICIENT_A_AMOUNT`); button `Try again` | phase==reverted; error message present |
| E2E-US3-F-03 | mid-tx | Disconnect wallet / trigger `accountsChanged` to `[]` during `mining` | UI resets to idle/disconnected gracefully; no stuck `Mining…` | no stuck phase |
| E2E-US3-F-04 | A-02 | Trigger RPC timeout (stop anvil mid-request) | Phase `→error` with `rpc` ErrorCode + hint; retry available | error panel shows rpc hint |

### Group G — Error & edge cases
*Spec Edge Cases; FR-008.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-G-01 | wallet disconnected | Open `/liquidity` → Remove tab | Position list empty or hidden; main button `Connect wallet` (disabled action) | button reads `Connect wallet` |
| E2E-US3-G-02 | connected to wrong network (e.g. Sepolia while anvil expected) | Open Remove tab | Wrong-network banner from `ConnectButton`; RemoveLiquidity not visible (`isVisible` false) | wrong-network banner visible; component hidden |
| E2E-US3-G-03 | anvil seeded; connect **anvil account #2** (swapper, no LP) | Open Remove tab | Empty state `No active positions — add liquidity first.`; no rows render | empty-state text visible; zero rows |
| E2E-US3-G-04 | A-02 | Set slippage `0.1%`, then attempt removal right after a swap that moves the pool >0.1% | Tx reverts with `INSUFFICIENT_A_AMOUNT` or `INSUFFICIENT_B_AMOUNT`; decoded error shown | error panel shows slippage selector |
| E2E-US3-G-05 | A-02 | Force deadline expiry (set `deadlineSeconds` path to past — requires hook-level override or anvil `evm_setNextBlockTimestamp` far future) | Tx reverts with `EXPIRED`; decoded error shown | error panel shows EXPIRED |
| E2E-US3-G-06 | A-02 | Drop anvil RPC during gas estimation | Phase `→error` with `gas-estimation` ErrorCode + hint | error panel shows gas-estimation hint |
| E2E-US3-G-07 | no pair exists for a KNOWN_PAIR not seeded (e.g. USDC/DAI) | Row renders only if `lpBalance>0`; otherwise hidden | No false-positive row; no crash | no row for unseeded pair |

### Group H — Cross-cutting & success criteria
*SC-001, SC-008, FR-010.*

| ID | Pre | Steps | Expected | Pass |
|---|---|---|---|---|
| E2E-US3-H-01 | clean seed, timer running | From wallet connected → select position → 50% → confirm → confirmed | Total wall-clock < 2 min (SC-001, applied to removal) | elapsed < 120 s |
| E2E-US3-H-02 | confirmed removal | Click `View on explorer` link | Opens block explorer tx URL for anvil (or correct chainId) | link href matches `getBlockExplorerTxUrl(chainId, txHash)` |
| E2E-US3-H-03 | viewport 375×667 (iPhone SE) | Walk A-01..A-03 | No horizontal scroll; % presets ≥44px touch target; `You receive` visible; Remove tab reachable | no overflowX; tap targets ≥44px |
| E2E-US3-H-04 | viewport 1440×900 | Walk A-01..A-03 | Layout centered, no clipping | card centered; no clipping |
| E2E-US3-H-05 | after B-04 | Open `/portfolio` | Removed pair's position updated (lpBalance reduced or absent); history shows a `burn` event with tx link | portfolio reflects burn |
| E2E-US3-H-06 | A-02 | Reload page mid-session | State resets to idle; no stale tx hash; position list re-fetches | clean reload |

---

## 4. Pass / Fail Criteria

**Suite passes** when:
- All Group A, B, C cases pass (US3 acceptance scenarios 1–3 directly covered).
- At least one of Group D (ETH unwrap) **and** one of Group E (permit) pass.
- All Group G edge cases pass (FR-008 graceful errors).
- Group H-01 (SC-001 < 2 min) and H-03 (mobile responsive) pass.

**Suite fails** if:
- Deployer `lpBalance == 0` after DeployDemo (seed broken — abort before any case).
- Any on-chain delta (LP burn, asset return) deviates from preview beyond the selected slippage tolerance.
- A phase transition lands in an unhandled state (stuck `Mining…`, missing error panel on revert).
- 100% removal leaves `lpBalance > 0`.

---

## 5. Traceability

| Case | Spec ref | FR / SC |
|---|---|---|
| A-01..A-07 | US3-AC1 | FR-005 (preview) |
| B-01..B-06 | US3-AC2 | FR-004 |
| C-01..C-05 | US3-AC3 | FR-004 |
| D-01..D-05 | US3-AC2 (ETH variant) | FR-004 |
| E-01..E-04 | US3-AC2 (permit variant) | FR-004, T052/T054 |
| F-01..F-04 | phase machine | FR-008 |
| G-01..G-07 | Edge Cases | FR-008 |
| H-01 | SC-001 | SC-001 (<2 min) |
| H-03, H-04 | responsive | FR-010, SC-008 |
| H-05 | US4 cross-check | FR-006 |
| H-02 | explorer link | FR-009 |

---

## 6. Out of Scope (covered elsewhere)

- Contract unit/fuzz tests → `contracts/test/router/UniswapV2Router02.t.sol` (T052, done).
- Frontend hook/component unit tests → `tests/unit/useLiquidity.remove.test.ts` + `RemoveLiquidity.test.tsx` (T053, done).
- Add-liquidity e2e → US2 (separate checklist).
- Portfolio e2e → US4 (T060).
- Load testing → T074 (k6).
- Sepolia public demo → quickstart.md Scenario B / T072.
