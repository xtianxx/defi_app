# Protocol Fee

How the protocol earns from swaps beyond the 0.3% fee — implemented as LP minted on `√k`
growth, not per-swap transfers (`contracts/src/core/UniswapV2Pair.sol:_mintFee`).

```text
Swap fee: 0.30%

fee off (feeTo == address(0)): 100% → LPs
fee on  (feeTo != address(0)): 5/6 → LPs, 1/6 → protocol (minted as LP to feeTo)
```

## Minting LP on √k growth

Swap fees stay in the pool as extra reserves, so they grow `k = reserve0 × reserve1` instead of
being transferred out per trade. The Pair caches the last `k` in `kLast`; on every `mint` /
`burn` while fee-on, `_mintFee` compares current `k` with `kLast` and mints the growth to
`feeTo`:

```text
rootK     = sqrt(reserve0 × reserve1)
rootKLast = sqrt(kLast)
liquidity = totalSupply × (rootK − rootKLast) / (rootK × 5 + rootKLast)
```

`kLast` is then refreshed to the current `reserve0 × reserve1`. The 1/6 protocol share is
baked into the `×5` denominator of the minted amount (5/6 of the growth stays with the LPs).
When the fee is off, `kLast` is reset to 0, so fees accrued while `feeTo` was unset cannot be
claimed retroactively. No per-trade settlement, no extra accounting — the same fee-on design
as canonical Uniswap V2.
