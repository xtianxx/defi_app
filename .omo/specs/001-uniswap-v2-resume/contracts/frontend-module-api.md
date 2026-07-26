# Interface Contract — Frontend Modules (Next.js ↔ Contracts)

> Defines the frontend module/hook API surface and how each maps to the on-chain contracts in
> [smart-contract-interfaces.md](./smart-contract-interfaces.md). TypeScript + ethers v6.
> Aligns with Constitution IV (modular) & V (API documentation). All wallet-interacting modules
> use the `'use client'` directive; read-only modules run server-side via `JsonRpcProvider`.

---

## Module map

```text
frontend/src/
  hooks/
    useWeb3.ts          -- 'use client'; singular wallet connection state
    useToken.ts         -- " saturated reads
    usePair.ts          -- pool + reserves + cumulative prices
    useSwap.ts          -- swap write flow + approval
    useLiquidity.ts     -- add/remove liquidity flows
    useTwapPrice.ts     -- TWAP window computation
  lib/
    contracts/abis.ts      -- generated from contracts/out/*.json
    contracts/addresses.ts -- generated from broadcast/run-latest.json (per chainId)
    contracts/tokens.ts    -- hardcoded WETH/USDC/DAI/WBTC config
    chains.ts
    rpc.ts                 -- JsonRpcProvider (server) vs BrowserProvider (client)
    errors.ts              -- error code -> human message
    format.ts              -- formatUnits / parseUnits by token decimals
  providers/
    Web3Provider.tsx      -- 'use client' React context
  app/
    api/reserves/route.ts -- server-side read proxy (SC-004)
  components/
    wallet/ConnectButton.tsx
    swap/SwapWidget.tsx
    liquidity/{Add,Remove}Liquidity.tsx
    portfolio/PositionCard.tsx
```

---

## 1. `useWeb3()` — wallet connection (single source of truth)

```ts
type Web3Status = 'idle' | 'connecting' | 'ready' | 'error';

interface UseWeb3 {
  status: Web3Status;
  account: `0x${string}` | null;
  chainId: number | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  error: { code: ErrorCode; message: string } | null;
  connect(): Promise<void>;          // calls eth_requestAccounts, then getSigner (ASYNC v6)
  switchChain(chainId: number): Promise<void>;  // wallet_switchEthereumChain, fallback add
  disconnect(): void;
}
```

**Contract calls**: none directly — wraps `window.ethereum` (EIP-1193).
**Event handlers**: `accountsChanged` → reconnect or reset to `idle` on `[]`; `chainChanged` → `window.location.reload()` (EIP-1193 mandate). On wrong network, expose `switchChain(SEPOLIA_CHAIN_ID = 11155111)`.

---

## 2. `useToken(address)` — ERC-20 metadata + balance + allowance

```ts
interface UseToken {
  symbol: string | null;
  decimals: number | null;
  balance: bigint | null;             // for current account
  allowance(spender: string): bigint | null;
  approve(spender: string, amount: bigint): Promise<ContractTransactionReceipt>;
  refresh(): Promise<void>;
}
```

**Buffer**: pure read via `BrowserProvider` (client) or `JsonRpcProvider` (server-route handler composition).
**Implements**: `getContract(tokenAddress, IERC20_ABI, signerOrProvider)` from `lib/contracts/abis.ts`.

---

## 3. `usePair(tokenA, tokenB)` — pool lookup + reserves + cumulative TWAP accumulators

```ts
interface UsePair {
  pairAddress: `0x${string}` | null;           // null => pool doesn't exist
  token0: `0x${string}` | null;
  token1: `0x${string}` | null;
  reserves: { reserve0: bigint; reserve1: bigint; blockTimestampLast: number } | null;
  price0CumulativeLast: bigint | null;
  price1CumulativeLast: bigint | null;
  liquidity: bigint | null;                    // pair.totalSupply (for share calc)
  lpBalance: bigint | null;                     // pair.balanceOf(account)
  refresh(): Promise<void>;
}

function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint;
function getAmountIn(amountOut: bigint, reserveOut: bigint, reserveIn: bigint): bigint;
```

`getAmountOut` mirrors `UniswapV2Library.getAmountOut` exactly (0.3% fee, numerator/denominator rounding) — **replicated client-side** for the live "estimated output" preview (FR-005) without a round-trip, validated against the on-chain function in tests.

---

## 4. `useSwap()` — swap write flow (direct pair)

```ts
interface UseSwap {
  // inputs:
  tokenIn: `0x${string}` | null;
  tokenOut: `0x${string}` | null;
  amountIn: bigint | null;
  // computed preview:
  amountOutEstimated: bigint | null;
  priceImpactPctBp: number | null;             // (amountIn vs slippage estimation)
  feePctBp: number;                            // always 30 (=0.30%)
  // tx state machine:
  phase: 'idle' | 'approving' | 'submitting' | 'mining' | 'confirmed' | 'reverted' | 'rejected' | 'error';
  txHash: `0x${string}` | null;
  receipt: ContractTransactionReceipt | null;
  error: { code: ErrorCode; message: string } | null;
  setParams(tokenIn, tokenOut, amountIn): void;
  execute(amountOutMin: bigint, deadlineSeconds: bigint): Promise<void>;
  reset(): void;
}
```

**Contract calls**:
- approval: `token.approve(router, amountIn)` via `useToken.approve`
- swap: `router.swapExactTokensForTokens(amountIn, amountOutMin, [tokenIn, tokenOut], to, deadline)`
    - asserts `path.length === 2` (frontend guard too — error if user picks pair that needs multi-hop)
- listen `tx.wait()`, then verify `receipt.status === 1` (R0.6)
- on rejection: `err.code === 4001` → `phase = 'rejected'` (no scary toast)
- on revert: decode selector against `abis.ts` error map → `errors.ts` message

---

## 5. `useLiquidity()` — add/remove flows

```ts
interface UseLiquidity {
  pair: UsePair | null;
  addLiquidity(args: {
    tokenA, tokenB, amountADesired, amountBDesired,
    amountAMin, amountBMin, deadlineSeconds,
  }): Promise<void>;
  addLiquidityETH(args: {
    token, amountTokenDesired, amountTokenMin, amountETHMin, deadlineSeconds, msgValue,
  }): Promise<void>;
  removeLiquidity(args: {
    tokenA, tokenB, liquidity, amountAMin, amountBMin, deadlineSeconds,
  }): Promise<void>;
  removeLiquidityETH(args: { ... }): Promise<void>;
  // same phase/tx state machine as useSwap
}
```

Calls `router.addLiquidity`/`addLiquidityETH`/`removeLiquidity`/`removeLiquidityETH` (direct pair — both must already exist or `addLiquidity` creates via Factory if needed; spec scenario US2-4 "initial liquidity").

---

## 6. `useTwapPrice()` — TWAP computation

```ts
interface UseTwap {
  price0: bigint | null;            // Q224.112 — price of token0 in token1 units (TWAP)
  price1: bigint | null;
  windowSeconds: number;            // default 1800 (30 min)
  source: 'twap' | 'spot-fallback'; // twap requires archive; fallback labeled in UI
}

function computeTwap(
  sampleA: TwapSample, sampleB: TwapSample, windowSeconds: number,
): { price0: bigint; price1: bigint };
```

`computeTwap` is pure & unit-tested (Vitest). It mirrors the on-chain accumulator math from `data-model.md` E8.

---

## 7. `lib/errors.ts` — error code → human message contract

```ts
type ErrorCode =
  | 'user-rejection' | 'wallet-missing' | 'wrong-network'
  | 'insufficient-balance' | 'allowance' | 'slippage' | 'deadline'
  | 'pool-empty' | 'gas-estimation' | 'rpc' | 'invalid' | 'internal';

interface ErrorEntry { code: ErrorCode; message: string; hint?: string; }

function decodeError(err: unknown, ctx?: { tokenSymbol?: string }): ErrorEntry;
```

Maps provider/contract errors (raw error code 4001, contract error selectors from `abis.ts`, RPC timeout/429) to the canonical entries in `research.md` R0.8. **All UI error toasts route through this function** (FR-008 single source of error UX).

---

## 8. `app/api/reserves/route.ts` — server-side read proxy (SC-004)

```ts
// GET /api/reserves?pair=0x...&account=0x...
// Returns: { reserve0, reserve1, blockTimestampLast, price0CumulativeLast,
//            price1CumulativeLast, totalSupply, lpBalance } cached 2s server-side
```

Runs under `next/server` `runtime = 'nodejs'` with a request-scoped `JsonRpcProvider`. Cache via `next/unstable_cache` (2s TTL) for SC-004 (portfolio < 3 s load). Wallet state never touches the server.

This is the App Router performance lever for Vercel deployment (the read proxy keeps server components thin and gives us caching without re-render spam).

---

## 9. `lib/contracts/addresses.ts` (generated)

```ts
export const DEPLOYMENTS: Record<number, {
  factory: `0x${string}`;
  router: `0x${string}`;
  weth: `0x${string}`;
  tokens: Record<'WETH' | 'USDC' | 'DAI' | 'WBTC', `0x${string}`>;
}> = {
  31337: { /* generated from broadcast/31337/run-latest.json */ },
  11155111: { /* generated from broadcast/11155111/run-latest.json */ },
};
```

Regenerated by `frontend/scripts/sync-deploy.ts` (R0.9). Read by every hook & component. **No hardcoded addresses in components** (anti-drift discipline).

---

## 10. Scope-fence contract: FR-011 enforced client-side

- `SwapWidget` token pickers only offer the 4-token demo set; pair selection auto-resolves to a known existing pair. If a chosen pair has no pool, UI shows `pool-empty` error and offers a "Add liquidity" CTA. Multi-hop routes are impossible to even attempt (picker is single-hop).
- "Path length 2" is asserted both client (`useSwap.execute`) and on-chain (`UniswapV2Router: DIRECT_PAIR_ONLY` revert).

---

## 11. Cross-references

| Frontend symbol | On-chain contract invoked |
|-----------------|---------------------------|
| `useToken` | `IERC20` at `tokens[WETH/USDC/DAI/WBTC]`, `WETH9` |
| `usePair.getReserves` | `IUniswapV2Pair.getReserves` at `pairAddress` (computed via `UniswapV2Library.pairFor`) |
| `useSwap.execute` | `IUniswapV2Router02.swapExactTokensForTokens` |
| `useLiquidity.addLiquidity*` | `IUniswapV2Router02.addLiquidity` / `addLiquidityETH` |
| `useLiquidity.removeLiquidity*` | `IUniswapV2Router02.removeLiquidity` / `removeLiquidityETH` |
| `useTwapPrice.computeTwap` | reads `IUniswapV2Pair.price{0,1}CumulativeLast` + `Sync`/`Swap` events |
| `app/api/reserves/route.ts` | `IUniswapV2Pair` view fns via `JsonRpcProvider` |
| `lib/contracts/addresses.ts` | Foundry `broadcast/<chainId>/run-latest.json` |