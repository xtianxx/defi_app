# TWAP Oracle

Time-weighted average price maintained by the Pair through two cumulative accumulators
(`contracts/src/core/UniswapV2Pair.sol:_update`, `libraries/UQ112x112.sol`).

## UQ112x112 accumulators

The Pair stores two cumulative prices, one per token:

```text
price0CumulativeLast   spot price = reserve1 / reserve0   (token0 priced in token1)
price1CumulativeLast   spot price = reserve0 / reserve1   (token1 priced in token0)
```

Spot prices are encoded as `UQ112x112` fixed-point numbers (112-bit integer part + 112-bit
fraction), so the division keeps full precision. Every `mint / burn / swap / sync` calls
`_update`, which accumulates when at least one second has elapsed and both reserves are
non-zero:

```text
timeElapsed = block.timestamp − blockTimestampLast
priceNCumulativeLast += spotPriceN × timeElapsed        (UQ112x112 × seconds)
```

`blockTimestampLast` is refreshed on every update, so the accumulators move only when the
pool is touched. Both balances must stay within `uint112` (`UniswapV2: OVERFLOW` otherwise).

## Taking the TWAP over [t0, t1]

```text
TWAP =
  (priceNCumulativeLast(t1) − priceNCumulativeLast(t0))
  /
  (t1 − t0)
```

A consumer reads a cumulative price plus the block timestamp at t0 and again at t1. The
difference in cumulative price divided by the elapsed time is the time-weighted average of the
spot price over that window (the Portfolio view uses this for position valuation). Because
accumulation is additive over time, a single-block manipulation of the spot price is diluted
across the whole window — the longer the window, the more it costs to attack.
