# Phase 1 Data Model — Uniswap V2 Resume Project

> Derives the on-chain + frontend entities from `spec.md` Key Entities and FR-001..FR-011.
> This is a **logical** data model. Physical storage is the EVM contract state for on-chain entities;
> the frontend entities are TypeScript types in `src/lib/contracts/` and `src/hooks/`.

---

## Entity summary

| # | Entity | Lives | Key identity | Relates to |
|---|--------|-------|--------------|-----------|
| E1 | Token | on-chain (ERC-20) + frontend enum | contract address | pair, swap, liquidityPosition |
| E2 | Pair | on-chain (`UniswapV2Factory` registry) | `(token0, token1)` ordered by address | token (2), liquidityPool, swap, liquidityPosition |
| E3 | LiquidityPool | on-chain (`UniswapV2Pair`) | the Pair's contract address (= the CREATE2 output) | pair, liquidityToken, swap |
| E4 | LiquidityToken (LP) | on-chain (`UniswapV2ERC20`) | the pool's own ERC-20 contract | liquidityPool, liquidityPosition |
| E5 | SwapTransaction | on-chain events (`Swap` on Pair, indexed) | tx hash + log index | pair, token (2), user |
| E6 | LiquidityPosition | derived (frontend) from `balanceOf(user)` on the LP token | `(user, pool)` | liquidityPool, token (2), user |
| E7 | UserWallet | frontend session state | EIP-55 address | all flow entities |
| E8 | TwapSample | on-chain cumulative price state + frontend cache | `(pool, blockNumber)` | liquidityPool (price) |

---

## E1 — Token

A demo ERC-20 (or WETH9) listed in the hardcoded token set.

| field | type | validation | source |
|-------|------|-----------|--------|
| `address` | `0x${string}` (EIP-55) | non-zero, checksummed | `lib/contracts/tokens.ts` (per-chain) |
| `symbol` | string | WETH / USDC / DAI / WBTC | hardcode per spec Token Configuration |
| `name` | string | non-empty | hardcode / `ERC20.name()` |
| `decimals` | uint8 | WETH=18, USDC=6, DAI=18, WBTC=8 | spec + `ERC20.decimals()` |
| `chainId` | number | 31337 (anvil) or 11155111 (sepolia) | `lib/chains.ts` |

**Derived read** (per user): `balance(address) -> bigint` via `useToken`.
**Token set is fixed** (FR: only WETH/USDC/DAI/WBTC). Adding a token = code change in `tokens.ts`; no on-chain governance.

---

## E2 — Pair

The ordered registered association of two Tokens. **Singleton per unordered token pair** — `UniswapV2Factory.createPair(A,B)` reverts if the unordered pair exists (Constitution II).

| field | type | validation | source |
|-------|------|-----------|--------|
| `token0` | address | `token0 < token1` (lexicographic ordering via `UniswapV2Library.sortTokens`, by address) | on-chain (Pair) |
| `token1` | address | `token0 < token1` | on-chain (Pair) |
| `factory` | address | constant per deployment | `UniswapV2Factory` address |
| `pairAddress` | address | deterministic CREATE2 output → `keccak256(0xff, factory, salt=keccak256(token0,token1), initCodeHash)` | on-chain |
| `exists` | bool | `factory.getPair(token0,token1) != address(0)` | on-chain read |

**Factory registry state**: `mapping(address => mapping(address => address)) allPairs`, `address[] public allPairs`, `uint256 public allPairsLength`. No pair state lives in the Factory.

---

## E3 — LiquidityPool (the `UniswapV2Pair`)

The AMM vault: holder of reserves, the constant-product invariant, and the cumulative TWAP accumulators.

| field | type | validation / invariant | source |
|-------|------|------------------------|--------|
| `reserve0` | uint112 | invariant `reserve0 * reserve1` non-decreasing (excl. fee) — K-invariant | on-chain (`UniswapV2Pair.getReserves()`)| 
| `reserve1` | uint112 | as above | on-chain |
| `blockTimestampLast` | uint32 | updated on every `mint`/`burn`/`swap` via `_update` | on-chain |
| `price0CumulativeLast` | uint256 | `price0CumulativeLast += reserve1 * 2^112 / reserve0` over elapsed time | on-chain |
| `price1CumulativeLast` | uint256 | symmetric | on-chain |
| `kLast` | uint256 | set when `feeTo` set; used for `mintFee` cut | on-chain (private) |
| `totalSupply` | uint256 | LP token supply; mint on deposit, burn on withdraw | on-chain (LP token) |

**State transitions** (per `UniswapV2Pair`):

| function | guard | effect |
|----------|-------|--------|
| `mint(to)` | caller == Router (`sk` lock pattern), non-zero liquidity | `_update` reserves+timestamp; mint LP `sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY` to `to`, lock `MINIMUM_LIQUIDITY` to address(0) on first mint |
| `burn(to)` | caller == Router, LP balance > 0 | burn caller's LP; transfer proportional `reserve0 * lp / totalSupply` & `reserve1 * lp / totalSupply` to `to`; `_update` |
| `swap(amount0Out, amount1Out, to)` | exactly one `amount{0,1}Out > 0`; post-swap `balance0 * balance1 >= reserve0 * reserve1` (K-invariant); reentrancy guard (no flash data) | transfer out tokens; `_update` new reserves |
| `sync()` | anyone | set `reserve0/1` to current balances (skew-safe) |
| `skim(to)` | anyone | transfer excess balances over reserves to `to` |

**Reentrancy**: `lock` boolean swapped at entry/exit (`require(lock == 1); lock = 0; ...; lock = 1;`) — the original Uniswap V2 pattern, retained under 0.8.19. No flash-callback `data` path per R0.3.

**Security mapping (Constitution I)**:
- Reentrancy guard → on `swap` (sends ETH/token before invariant checked)
- Overflow → Solidity 0.8+ checked arithmetic (uint112 reserve wrap is the historical reason for 112-bit; keep)
- Access control → only Router may mint/burn (Router is the trusted entry point that does the token transferFrom *before* mint, ensuring liquidity is actually deposited)

---

## E4 — LiquidityToken (LP ERC-20 — `UniswapV2ERC20`)

Standard ERC-20 minted/burned by the Pair; one instance per pool.

| field | type | notes |
|-------|------|-------|
| `name` | string | `"Uniswap V2"` |
| `symbol` | string | `"UNI-V2"` |
| `decimals` | uint8 | `18` |
| `totalSupply` | uint256 | mirror of Pool kLast flow |
| `permit` | (optional) | EIP-2612 permit included for Router02 permit-based removal; keep for ABI parity |

Validation rules inherited from ERC-20; mint/burn callable only by the owning Pair.

---

## E5 — SwapTransaction

Read-only derived entity surfaced by the `Swap` event on `UniswapV2Pair`. Powers the portfolio "transaction history" (SC-003, US4).

| field | type | notes |
|-------|------|-------|
| `txHash` | bytes32 | block explorer link |
| `logIndex` | uint | disambiguates multi-pool-tx (not needed here, direct-pair only) |
| `sender` | address | the Router (caller) |
| `amount0In` / `amount1In` | uint112 | one is non-zero |
| `amount0Out` / `amount1Out` | uint112 | one is non-zero |
| `to` | address | recipient |
| `blockTimestamp` | uint32 | indexed for history ordering |

**Aggregation** (for analytics): group by user (`to`), ordered by `blockTimestamp` desc, joined to `Pool` for `symbol0/symbol1` display via `lib/contracts/tokens.ts`. Source = the pair's `Swap` event filtered by `to == user` (and reciprocal `Transfer` for liquidity add/remove).

Liquidity events: `Mint(sender, amount0, amount1)` and `Burn(sender, amount0, amount1, to)` on the Pair drive the "liquidity provision history". Combined with `Transfer` of LP tokens for position aggregation.

---

## E6 — LiquidityPosition (derived, frontend)

A user's stake in a pool. **Not stored separately** — derived from `UniswapV2ERC20.balanceOf(user)` over all pools + the pool reserves.

| field | type | derived as |
|-------|------|-----------|
| `user` | address | session |
| `pool` | address | iterate `factory.allPairs()` OR the configured demo pair set |
| `lpBalance` | uint256 | `pair.balanceOf(user)` |
| `poolTotalSupply` | uint256 | `pair.totalSupply()` |
| `sharePctBp` | uint16 (basis points) | `lpBalance * 10000 / totalSupply` |
| `token0` / `token1` | address | from pool |
| `depositedAmount0` / `…1` | uint256 | `reserve0 * lpBalance / totalSupply` |
| `currentValue0` / `…1` | uint256 | same formula (pool is fixed-proportion; PnL comes from `mintFee` + fees accrued in reserves) |
| `feesEarned0` / `…1` | uint256 | `current - deposited` — approximated by tracking `Mint` vs current claimable; an on-chain exact requires snapshotting. For resume demo: computed from the difference between claimable now vs the historical deposit (Mint event captured client-side). |

**Validation**: a position with `lpBalance == 0` is hidden from "active positions" (SC-US2 scenario 2) but retained in history.

---

## E7 — UserWallet (frontend session)

Frontend-only session state owned by the `useWeb3` hook + `Web3Provider` React context.

| field | type | validation | lifecycle |
|-------|------|-----------|-----------|
| `status` | `'idle' \| 'connecting' \| 'ready' \| 'error'` | one at a time | connect() lifecycle |
| `account` | `0x${string}` \| null | EIP-55 checksum | set on connect; cleared on `accountsChanged` -> [] |
| `chainId` | number \| null | must be 31337 or 11155111 to act | `chainChanged` -> reload (EIP-1193 mandate) |
| `provider` | `BrowserProvider` \| null | wraps `window.ethereum` | created on connect |
| `signer` | `JsonRpcSigner` \| null | signer.getAccount() == account | (async in v6) |
| `error` | `{code, message} \| null` | from `lib/errors.ts` map | surfaced to UI toast |

**Reacts to** wallet events (`accountsChanged`, `chainChanged`) — see R0.6. No persistence; reconnect on load via persisted EIP-1193 permissions.

---

## E8 — TwapSample

| field | type | notes |
|-------|------|-------|
| `pool` | address | identifying pool |
| `priceCumulativeA` | uint256 | older cumulative price (window start) |
| `timestampA` | uint32 | block timestamp of sample A |
| `priceCumulativeB` | uint256 | newer cumulative price (window end = now) |
| `timestampB` | uint32 | block timestamp B |
| `windowSeconds` | uint32 | `timestampB - timestampA` (default 1800 = 30 min) |
| `price0` | Q224.112 | `(price0CumulativeB - price0CumulativeA) << 112 / windowSeconds` |
| `price1` | Q224.112 | symmetric |

**Validation**: `windowSeconds >= 1` (division-by-zero guard); reject if archive RPC unavailable on anvil (degrade to spot, labeled). Samples taken client-side with a rolling 2-sample cache per pool, persisted in `localStorage` for session continuity.

Per Constitution II: this is the canonical on-chain TWAP. No third-party oracle.

---

## Cross-entity validation & invariant summary (Constitution I/II)

| Invariant | Where enforced |
|-----------|---------------|
| `reserve0 * reserve1 >= pre` (K non-decreasing except fee accrual) | `UniswapV2Pair.swap` post-condition require |
| Pair uniqueness: `(A,B) == (B,A)`, singleton | `UniswapV2Factory.createPair` sorted-address salt |
| LP mint proportional to `sqrt(amount0*amount1)`, MINIMUM_LIQUIDITY lock on first mint | `UniswapV2Pair.mint` |
| LP burn proportional to `lpBalance / totalSupply` | `UniswapV2Pair.burn` |
| 0.3% swap fee (1/6 routed to `feeTo` when `feeTo != address(0)`) | `UniswapV2Pair._mintFee` + `swap` |
| Deterministic pair address via CREATE2 + dynamic init hash | `UniswapV2Factory.createPair` + `UniswapV2Library.pairFor` (R0.4) |
| No flash swap callback; Bounded K-invariant check | `UniswapV2Pair.swap` (R0.3) |
| No path longer than 2 in Router | `UniswapV2Router02._swap` assert |
| Deadline & slippage bounds | Router `require(deadline >= block.timestamp)`, `amountOutMin`, `amountInMax` |
| Reentrancy guard | `UniswapV2Pair` `lock` flag (R0.3) |

---

## Mapping spec FR → entity

| FR | Entity(es) |
|----|------------|
| FR-001/002 swap | E3 ᐧ E5 |
| FR-003 add liquidity | E3 ᐧ E4 ᐧ E6 |
| FR-004 remove liquidity | E3 ᐧ E4 ᐧ E6 |
| FR-005 estimated output/fee | E3 (`getAmountOut`) UI computed via `useSwap` |
| FR-006 positions | E6 |
| FR-007 wallet connect | E7 |
| FR-008 graceful errors | E7 `error` field, `lib/errors.ts` (R0.8) |
| FR-009 realtime prices | E8 (TWAP), E3 reserves |
| FR-010 responsive | E7 (client rendering only where needed) — UI concern |
| FR-011 no flash / no multi-hop | E3 (no data callback), Router `path.length==2` invariant |