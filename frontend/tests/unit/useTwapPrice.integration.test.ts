import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { computeTwapFromPair, useTwapPrice } from "@/hooks/useTwapPrice";
import type { TwapSample } from "@/hooks/useTwapPrice";

const POOL = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984" as `0x${string}`;
const STORAGE_KEY = `uniswap-v2-resume:twap:${POOL}`;

function sample(priceCumulative: bigint, timestamp: number): TwapSample {
  return { priceCumulative, timestamp };
}

describe("computeTwapFromPair", () => {
  it("computes the 30-min TWAP from two samples 1800s apart in Q112.112", () => {
    const sampleA0 = sample(1000000n << 112n, 1_000_000);
    const sampleB0 = sample(2000000n << 112n, 1_001_800);
    const sampleA1 = sample(3000000n << 112n, 1_000_000);
    const sampleB1 = sample(5000000n << 112n, 1_001_800);

    const { price0, price1 } = computeTwapFromPair(sampleA0, sampleB0, sampleA1, sampleB1, 1800);

    // price0 = ((cumulativeB - cumulativeA) << 112) / dt
    expect(price0).toBe(((sampleB0.priceCumulative - sampleA0.priceCumulative) << 112n) / 1800n);
    expect(price0).toBe(((2000000n - 1000000n) << 112n << 112n) / 1800n);
    expect(price1).toBe(((sampleB1.priceCumulative - sampleA1.priceCumulative) << 112n) / 1800n);
    expect(price1).toBe(((5000000n - 3000000n) << 112n << 112n) / 1800n);
  });

  it("returns zero prices when windowSeconds < 1 or the sample delta is zero (div-by-zero guard)", () => {
    const a = sample(1000n << 112n, 0);
    const b = sample(2000n << 112n, 100);

    expect(computeTwapFromPair(a, b, a, b, 0)).toEqual({ price0: 0n, price1: 0n });
    expect(computeTwapFromPair(a, b, a, b, -1800)).toEqual({ price0: 0n, price1: 0n });

    // same-timestamp samples → dt = 0
    expect(computeTwapFromPair(a, a, a, a, 1800)).toEqual({ price0: 0n, price1: 0n });
  });
});

describe("useTwapPrice — spot fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to the spot price (labeled 'spot-fallback') when no cached samples exist", async () => {
    const reserve0 = 1000n * 10n ** 18n;
    const reserve1 = 2000n * 10n ** 18n;
    const ts = 1_700_000_000;
    const cum0 = 123456n << 112n;
    const cum1 = 654321n << 112n;

    const { result } = renderHook(() =>
      useTwapPrice({
        pool: POOL,
        price0Cumulative: cum0,
        price1Cumulative: cum1,
        blockTimestampLast: ts,
        reserve0,
        reserve1,
      }),
    );

    // Spot price0 = reserve1 * 2^112 / reserve0
    await waitFor(() => expect(result.current.price0).toBe((reserve1 << 112n) / reserve0));
    expect(result.current.price1).toBe((reserve0 << 112n) / reserve1);
    expect(result.current.source).toBe("spot-fallback");
    expect(result.current.windowSeconds).toBe(0);

    // First sample is persisted under the per-pool cache key.
    const cached = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(cached).toEqual([
      { priceCumulative: cum0.toString(), timestamp: ts },
      { priceCumulative: cum1.toString(), timestamp: ts },
    ]);
  });
});

describe("useTwapPrice — rolling per-pool localStorage cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("computes TWAP from the cached + new sample and rolls the cache forward", async () => {
    const oldTs = 1_700_000_000;
    const newTs = oldTs + 1800;
    const oldCum0 = 1000000n << 112n;
    const oldCum1 = 3000000n << 112n;
    const newCum0 = 2000000n << 112n;
    const newCum1 = 5000000n << 112n;

    // Pre-seed the 2-sample cache (stored with stringified bigints, as loadCache expects).
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { priceCumulative: oldCum0.toString(), timestamp: oldTs },
        { priceCumulative: oldCum1.toString(), timestamp: oldTs },
      ]),
    );

    const { result } = renderHook(() =>
      useTwapPrice({
        pool: POOL,
        price0Cumulative: newCum0,
        price1Cumulative: newCum1,
        blockTimestampLast: newTs,
      }),
    );

    await waitFor(() => expect(result.current.source).toBe("twap"));
    expect(result.current.price0).toBe(((newCum0 - oldCum0) << 112n) / 1800n);
    expect(result.current.price1).toBe(((newCum1 - oldCum1) << 112n) / 1800n);
    expect(result.current.windowSeconds).toBe(1800);

    // Cache key is uniswap-v2-resume:twap:<pool> and has rolled forward:
    // the new sample replaced the old one (the hook persists [b0, b0]).
    const rolled = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(rolled).toEqual([
      { priceCumulative: newCum0.toString(), timestamp: newTs },
      { priceCumulative: newCum0.toString(), timestamp: newTs },
    ]);
  });
});
