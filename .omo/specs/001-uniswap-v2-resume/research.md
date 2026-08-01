# Phase 0 Research — Uniswap V2 Resume Project

> Output of `/speckit.plan` Phase 0. Resolves every NEEDS CLARIFICATION from `plan.md` Technical Context.
> Each decision cites the evidence source. Format: **Decision / Rationale / Alternatives considered**.

---

## R0.1 — Foundry UniswapV2 contract layout (NEEDS CLARIFICATION: project structure)

**Decision**: Adopt the canonical Foundry UniswapV2 layout split into `src/core/` and `src/router/` (periphery), mirrored in `script/` and `test/`.

- `src/core/`: `UniswapV2Factory.sol`, `UniswapV2Pair.sol`, `UniswapV2ERC20.sol` (LP token), `interfaces/`, `libraries/` (`Math`, `UQ112x112`, `SafeMath`).
- `src/router/`: `UniswapV2Router02.sol`, `WETH9.sol`, `interfaces/` (`IUniswapV2Router02`, `IERC20`, `IWETH`), `libraries/` (`UniswapV2Library`, `TransferHelper`).
- `script/core/DeployFactory.s.sol`, `script/router/DeployRouter.s.sol`, `script/DeployDemo.s.sol`.
- `test/core/`, `test/router/`, `test/mocks/MockERC20.sol`, `test/utils/`.

**Rationale**: This split is the dominant industry pattern across multiple independent Foundry re-implementations surveyed (`etherzeth/UniswapV2-Foundry`, `aayushmayush/uniswapv2-foundry`, `UdayPandey01/dex-amm`, `MarcusWentz/uniswapV2_foundry_deployment`). It mirrors Uniswap's own core/periphery separation, keeps the value-holding `Pair` auditable in isolation, and lets us exclude periphery features (flash swaps, multi-hop) cleanly without touching core invariants.

**Alternatives considered**:
- Single flat `src/` folder — rejected: harder to reason about trust boundaries, deviates from every reference repo, makes the auditor's job harder (Constitution IV: modular architecture).
- Pulling Uniswap V2 core as a git submodule — rejected: this is a *resume* project; the value is in writing/owning the contracts, and a submodule prevents Solidity 0.8.19 pinning (submodules use 0.5.x/0.8.30).

---

## R0.2 — Router02 is oversized; `viaIR` + optimizer required (NEEDS CLARIFICATION: build config)

**Decision**: Set `foundry.toml` to:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.19"
via_ir = true
optimizer = true
optimizer_runs = 200
```

**Rationale**: `UniswapV2Router02` exceeds the EIP-170 24KB contract size limit when compiled without optimization (confirmed by `MarcusWentz/uniswapV2_foundry_deployment`: "Uni‌swapV2Router02 will throw a contract code exceeding 24576 error … set optimization runs to 500"; and `etherzeth/UniswapV2-Foundry`: "`viaIR = true` is essential for compiling complex router logic in 0.8.30"). `via_ir` is needed for the complex control flow; 200 runs is the standard Uniswap deploys-use value and keeps runtime gas reasonable. Solidity pinned to `0.8.19` per the constitution (reference repos use 0.8.30; we do NOT follow them here).

**Alternatives**:
- Split Router into Router01 + a Library wrapper — rejected: still oversized with full feature set; harder to test.
- Use 0.8.30 — rejected: violates constitution.

---

## R0.3 — Drop flash swaps and multi-hop per FR-011 (NEEDS CLARIFICATION: scope simplification)

**Decision**: Excluding the two out-of-scope feature sets takes these concrete forms in the contracts:

1. **Flash swaps**: `UniswapV2Pair.swap` is implemented as the standard Uniswap V2 *without* the `bytes data` flash callback. Callers cannot borrow-then-repay in one tx; the invariant must hold before `swap` returns. This removes the reentrancy-surface flash path entirely (strengthens Constitution I).
2. **Multi-hop routing**: `UniswapV2Router02` exposes only direct-pair functions:
   - `addLiquidity` / `addLiquidityETH`
   - `removeLiquidity` / `removeLiquidityETH`
   - `swapExactTokensForTokens` / `swapTokensForExactTokens` — but accepting **only `path.length == 2`** (assert revert otherwise).
   - `swapExactETHForTokens` / `swapExactTokensForETH` / `swapETHForExactTokens` / `swapTokensForExactETH` — same single-pair constraint.
   - The multi-token `path` array is kept in the ABI signature (so the frontend can reuse the canonical ABI + a typed wrapper that asserts `path.length === 2`) but the implementation rejects longer paths.
   - `UniswapV2Library.sortTokens` / `getReserves` / `getAmountOut` / `getAmountIn` are retained; the multi-hop `getAmountsOut`/`getAmountsIn` helpers are kept but unused (or simply removed — research favors **removing them** to avoid dead code / Constitution IV).

**Rationale**: FR-011 explicitly declares these out of scope; the spec clarifications (Session 2026-07-26) confirm "No flash swaps + No multi-hop routing." Removing them shrinks the attack surface, simplifies the test matrix, and removes dead code. Keeping the canonical ABI shape lets the frontend use the well-documented `path: [tokenIn, tokenOut]` call form without deviation.

**Alternatives**:
- Implement fully and disable behind a flag — rejected: dead code violates Constitution IV and re-adds the flash-swap reentrancy surface (Constitution I risk).
- Custom `swapDirect(tokenIn, tokenOut, amountIn, amountOutMin, to, deadline)` ABI — rejected: breaks ABI compatibility with the canonical Uniswap V2 Router02 ABI that everyone recognizes; weakens the "demonstrates understanding of real Uniswap" resume signal.

---

## R0.4 — Deterministic pair addresses: dynamic `INIT_CODE_PAIR_HASH` (NEEDS CLARIFICATION: init-code hash handling)

**Decision**: Use the **dynamic init-code-hash** approach from `0xqige/uniswap-v2-devkit`:
- Add `pairCodeHash()` (pure, returns `keccak256(type(UniswapV2Pair).creationCode)`) to `UniswapV2Factory`.
- Also expose the legacy `bytes32 public constant INIT_CODE_PAIR_HASH = keccak256(...)` for ABI compatibility.
- `UniswapV2Library.pairFor()` becomes `view` and reads the hash from the factory via `IUniswapV2Factory(factory).pairCodeHash()`, eliminating the fragile "manually paste the deployed hash into the Router source" step (`MarcusWentz` warns this step causes silent reverts if mismatched).

**Rationale**: The classic Uniswap V2 Router hardcodes the pair init-code hash at compile time, so the Router source must be edited post-deployment with the actual factory-deployed hash. This is a classic resume-project footgun (silent swap reverts). The dynamic variant resolves it cleanly while staying ABI-compatible.

**Trade-off recorded**: `pairFor` changes from `pure` to `view` (extra SLOAD per call). Acceptable for a resume demo; documented as a gas decision in `data-model.md` and in NatSpec.

**Alternatives**:
- Hardcoded `INIT_CODE_PAIR_HASH` + manual patch step — rejected: footgun, breaks CI reproducibility.
- Precompute and inject via constructor arg — rejected: still one manual step per deplopment; dynamic read is the modern best practice.

---

## R0.5 — On-chain TWAP-only pricing (NEEDS CLARIFICATION: price source)

**Decision**: Price displays read TWAP directly from each pair's cumulative price accumulators (`price0CumulativeLast`, `price1CumulativeLast`, `blockTimestampLast`), exactly as Uniswap V2 exposes them. The frontend computes the TWAP over a configurable window (default 30 min) in `useTwapPrice.ts`:

```
twap = (priceCumulativeNow - priceCumulativeAtWindowStart) / (timestampNow - timestampStart) * UQ112x112
```

Two samples are taken: the current cumulative price (live RPC read), and the cumulative price ~30 min ago (queried via an archive node / `eth_call` at a historical block, or cached on the client). For the anvil dev chain (no historical state unless `--archive`), the frontend falls back to a *spot* price from reserves, clearly labeled "spot (no archive)".

**Rationale**: Spec clarification mandates "on-chain TWAP only" — no Chainlink, no off-chain price API. Uniswap V2's `price{0,1}CumulativeLast` accumulators are the canonical on-chain TWAP source (Permitted by Constitution II: "Price oracle implementation following TWAP patterns").

**Caveats**:
- TWAP requires either (a) an archive RPC endpoint, or (b) the client periodically sampling and caching cumulative prices. For the resume demo we use Alchemy/Infura Sepolia archive endpoints + a client-side rolling cache.
- On anvil without `--archive`, TWAP degrades to spot; documented in UI.

**Alternatives**:
- Spot price from reserves only — rejected for production demo (spec wants TWAP), but kept as the anvil dev fallback.
- Chainlink price feeds — explicitly rejected by spec clarification.

---

## R0.6 — ethers.js v6 + Next.js App Router wallet pattern (NEEDS CLARIFICATION: frontend Web3 stack)

**Decision**: Use **raw ethers.js v6** (per Constitution Frontend Requirements) with a single-source-of-truth `useWeb3` hook + React Context provider. No wagmi/viem.

Canonical pattern (synthesized from `rocco.me` 2026-05-12 guide, `markaicode.com` Next.js 14 Web3 guide, `dev.to` BSC Testnet ethers+Next.js guide):

```ts
// hooks/useWeb3.ts
'use client';
import { BrowserProvider, JsonRpcSigner, type Provider } from 'ethers';

export function useWeb3() {
  // state: status ('idle'|'connecting'|'ready'|'error'), account, chainId, provider, signer
  const connect = async () => {
    if (!window.ethereum) throw new Error('No EIP-1193 wallet');
    const p = new BrowserProvider(window.ethereum);
    await p.send('eth_requestAccounts', []);
    const s = await p.getSigner();        // NOTE: getSigner() is ASYNC in v6 (not v5)
    // set state...
  };
  // listen: 'accountsChanged' -> reconnect or reset; 'chainChanged' -> window.location.reload()
}
```

Key v6 subtleties (from `rocco.me`):
- `getSigner()` is **async** in v6 (common v5->v6 migration bug).
- `'eth_requestAccounts'` (not `getSigner()`) triggers the MetaMask connect popup.
- After `tx.wait()`, `receipt.status === 1` must be checked — a mined tx can still have reverted.
- Differentiate rejection (`code === 4001` / `ACTION_REJECTED`) from real failures to avoid scary toasts on user-cancel.
- Gas estimation runs a `staticCall` first; a revert here throws *before* any popup — catch and explain ("can't simulate; probably insufficient balance / paused contract").
- Chain switching via `wallet_switchEthereumChain` (Sepolia `0xaa36a7`); on code `4902` fall back to `wallet_addEthereumChain` (spec edge case: network switching during tx).

**Server vs client split** (`markaicode.com`):
- All wallet-interacting components carry `'use client'`.
- Read-only RPC (reserves, cumulative prices, balances for the portfolio) runs in a **Route Handler** (`app/api/reserves/route.ts`) via `new ethers.JsonRpcProvider(rpcUrl)` — fulfilling SC-004 (< 3 s portfolio load) by caching reads server-side and keeping client bundles thin.

**Rationale**: Constitution Frontend Requirements mandates ethers.js v6. wagmi/viem would add another abstraction (and another constitution deviation). The raw-ethers + single-hook pattern is well-documented, sufficient for a resume project, and keeps the dependency surface minimal.

**Alternatives considered**:
- wagmi + viem — rejected: deviates from constitution; more deps; not needed at this scope.
- `@metamask/sdk-react` — optional layer; only adopt if we need WalletConnect later (out of current scope; FR-007 says "popular Web3 wallets" — MetaMask alone satisfies the resume demo, with the EIP-1193 abstraction leaving room for others).

---

## R0.7 — Frontend testing stack (NEEDS CLARIFICATION: testing was unspecified for frontend)

**Decision**: Vitest + Testing Library for unit/component tests; Playwright for E2E against a local anvil.

- Unit: pure helpers (`format.ts`, TWAP math, error-code mapping) + hooks tested with a mocked `BrowserProvider` / `window.ethereum` (use `vi.stubGlobal` + a fake EIP-1193 provider that implements `request`).
- Component: Testing Library on `ConnectButton`, `SwapWidget` with the mocked provider.
- E2E: Playwright drives the Next.js dev server pointed at `anvil`, seeding the demo via the `DeployDemo.s.sol` script, then runs the SC-001 swap flow and SC-004 portfolio-load assertion.

**Rationale**: Vitest is the Vite-native runner that works seamlessly with Next.js (Next 15 + Vitest is supported); Playwright is the current best practice for dApp E2E. Constitution III (TDD / ≥95% coverage) is interpreted as ≥95% on the **smart contracts** primarily, with frontend tests covering the critical flows (swap, liquidity, TWAP, error mapping).

**Alternatives**:
- Jest — rejected: heavier, slower, legacy default.
- Next.js built-in `experimental-test` — too immature; Playwright is the stable choice.

---

## R0.8 — Error surfacing: detailed error codes + human messages (NEEDS CLARIFICATION: spec clarification)

**Decision**: Define a versioned `lib/errors.ts` mapping `(networkClass, code|revertSelector) -> { code, message, hint }`. Categories per spec clarification + edge cases:

| Class | Codes | Human message hint |
|-------|-------|--------------------|
| user-rejection | `4001` / `ACTION_REJECTED` | "You declined the signature. No transaction was sent." |
| wallet-missing | (no `window.ethereum`) | "Install MetaMask or another EIP-1193 wallet." |
| wrong-network | chainId mismatch | `Wrong network. This dApp runs on Sepolia (or local Anvil). Switch network?` + switch action. |
| insufficient-balance | `staticCall` revert on transfer | "Insufficient ${tokenSymbol} balance to swap." |
| allowance | allowance < amount | "Approve ${tokenSymbol} spending first." |
| slippage | `UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT` | "Slippage moved past your minimum. Increase tolerance or retry." |
| deadline | `UniswapV2: EXPIRED` | "Deadline passed. Increase the deadline and retry." |
| pool-empty | reserves zero on `getAmountOut` | "This pool has no liquidity yet. Try another pair or add liquidity." |
| gas-estimation | estimation revert | "We couldn't simulate this. Check balance and approvals." |
| rpc | RPC timeout / 429 | "Network congested. Retrying…" with backoff. |

Custom contract error selectors are decoded against a generated `abis.ts` error map.

**Rationale**: Spec clarification mandates "Detailed error codes + human-readable messages" + differentiates user-rejection vs network failure vs contract revert. The centralized map is the only sane way to honor that consistently across pages (Constitution IV: separation of concerns).

**Alternatives**: ad-hoc `err.message` strings — rejected: inconsistent, hard to test, fails FR-008.

---

## R0.9 — Deployment artifacts + frontend ABI sync (NEEDS CLARIFICATION: cross-package coupling)

**Decision**: A single `DeployDemo.s.sol` Forge script deploys (anvil): the four MockERC20s (or, for Sepolia, reuses real test tokens / WBTC-style fixtures), WETH9, Factory, Router02, and seeds initial liquidity for two demo pairs (e.g., WETH/USDC, WETH/DAI). On success, Forge writes addresses to `broadcast/<chainId>/run-latest.json`. A small post-deploy Node script (`frontend/scripts/sync-deploy.ts`) reads the latest broadcast, resolves the deployed addresses + ABIs from `contracts/out/`, and writes `frontend/src/lib/contracts/addresses.ts` and refreshes `abis.ts`. This keeps the two packages decoupled at runtime (no live filesystem reads at build).

**Rationale**: Avoids address/ABI drift between contracts and frontend — the most common resume-project integration bug. The dependency flows one direction (contracts -> frontend) via a generated file under the frontend package.

**Alternatives**: shared `@repo/contracts` TS package with the ABI — rejected as over-engineering for a resume project; the generated-constants approach is simpler and matches AGENTS.md's "packages are independent" guidance.

---

## R0.10 — Reference repos consulted

| Repo | Use |
|------|-----|
| `Uniswap/v2-core`, `Uniswap/v2-periphery` | Authoritative source periphery/core ABI & invariants |
| `etherzeth/UniswapV2-Foundry`, `aayushmayush/uniswapv2-foundry` | Foundry layout + `viaIR` confirmation |
| `UdayPandey01/dex-amm` | TWAP oracle + Router01/02 separation + 100+ interview Q orientation (resume framing) |
| `MarcusWentz/uniswapV2_foundry_deployment` | Sepolia deploy mechanics + INIT_CODE_HASH pitfalls |
| `0xqige/uniswap-v2-devkit` | Dynamic `pairCodeHash()` improvement adopted in R0.4 |
| `rocco.me` (2026-05-12), `markaicode.com` Next.js 14 Web3, `dev.to` ethers+Next.js | ethers v6 + Next.js App Router patterns (R0.6) |
| `metamask.io/docs` SDK+Nextjs | `'use client'` + NavBar pattern reference |

---

## Open Questions Resolved = 0

All Technical Context "NEEDS CLARIFICATION" items resolved:
- Project structure → R0.1
- Build config (viaIR / optimizer) → R0.2
- Out-of-scope feature removal → R0.3
- Init-code hash handling → R0.4
- Price source (TWAP) → R0.5
- Frontend Web3 stack → R0.6
- Frontend testing → R0.7
- Error surfacing → R0.8
- Contract→frontend ABI sync → R0.9

**Phase 0 complete.** Proceed to Phase 1 design (data-model.md, contracts/, quickstart.md).