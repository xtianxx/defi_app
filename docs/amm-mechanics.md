# AMM Mechanics

Core mechanics implemented in `contracts/`: swap lifecycle, fee-adjusted invariant, LP
accounting, CREATE2 pair derivation (TWAP: [twap.md](twap.md) · protocol fee:
[protocol-fee.md](protocol-fee.md)). Code: `contracts/src/core/UniswapV2Pair.sol`,
`UniswapV2Factory.sol`, `contracts/src/router/libraries/UniswapV2Library.sol`.

## Swap lifecycle

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
enforce: balance0Adjusted × balance1Adjusted ≥ reserve0 × reserve1 × 1000²
  ↓
update reserves
  ↓
update TWAP accumulator (_update)
```

The Pair does not trust Router inputs — the real input is **balance after receipt minus
reserve**, and every swap is gated by the fee-adjusted invariant (`swap`). Quote formula
(`UniswapV2Library.getAmountOut`):

```text
amountOut = amountIn × 997 × reserveOut / (reserveIn × 1000 + amountIn × 997)
```

## Fee-adjusted invariant — why not just `x × y = k`

What actually executes on every swap is the 0.3% fee encoded into the invariant:

```text
(balance0 × 1000 − amount0In × 3) × (balance1 × 1000 − amount1In × 3) ≥ reserve0 × reserve1 × 1000²
```

0.3% of the input is deducted first (`×997/1000`); the remainder must satisfy `k` invariance —
**no separate transfer accounting** needed, the fee settles as `k` growth rewarding all LPs.

## Liquidity & LP accounting

```text
First mint (geometric mean; MINIMUM_LIQUIDITY locked to address(0)):
  liquidity = sqrt(amount0 × amount1) − MINIMUM_LIQUIDITY

Subsequent adds (proportional, smaller ratio wins):
  liquidity = min(amount0 × totalSupply / reserve0, amount1 × totalSupply / reserve1)

Removal (burn, proportional):
  amount0 = liquidity × reserve0 / totalSupply
  amount1 = liquidity × reserve1 / totalSupply
```

`MINIMUM_LIQUIDITY = 1000` (wei), locked forever at the first mint, prevents pathological share
manipulation from an undersized first deposit — "dust attack" distortion (`mint` / `burn`).

## CREATE2 deterministic pair address

```text
sort tokens (token0 < token1)
  ↓
salt = keccak256(abi.encodePacked(token0, token1))
  ↓
CREATE2 → deterministic Pair address
```

The Router / library derives the Pair address off-chain without querying Factory storage
(`pairFor`); the init-code hash is read dynamically from the Factory (`pairCodeHash()`), and
Factory tests cover derivation consistency.
