"use client";

import { useCallback, useEffect, useState } from "react";

export interface TwapSample {
  priceCumulative: bigint;
  timestamp: number;
}

export interface TwapResult {
  price0: bigint | null;
  price1: bigint | null;
  windowSeconds: number;
  source: "twap" | "spot-fallback";
}

export interface UseTwapPriceInput {
  pool: `0x${string}` | null;
  price0Cumulative: bigint | null;
  price1Cumulative: bigint | null;
  blockTimestampLast: number | null;
  reserve0?: bigint | null;
  reserve1?: bigint | null;
  windowSeconds?: number;
  minimumWindow?: number;
}

const STORAGE_PREFIX = "uniswap-v2-resume:twap:";

function loadCache(pool: `0x${string}`): [TwapSample, TwapSample] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + pool);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as [TwapSample, TwapSample];
    if (!parsed?.[0] || !parsed?.[1]) return null;
    return [
      { priceCumulative: BigInt(parsed[0].priceCumulative), timestamp: Number(parsed[0].timestamp) },
      { priceCumulative: BigInt(parsed[1].priceCumulative), timestamp: Number(parsed[1].timestamp) },
    ];
  } catch {
    return null;
  }
}

function saveCache(pool: `0x${string}`, samples: [TwapSample, TwapSample]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + pool, JSON.stringify(samples));
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Compute TWAP from two samples (different accumulators for price0 vs price1).
 * Prices are returned in Q112.112 fixed-point.
 *   price0 = (price0CumulativeB - price0CumulativeA) << 112 / (timestampB - timestampA)
 *   price1 = (price1CumulativeB - price1CumulativeA) << 112 / (timestampB - timestampA)
 */
export function computeTwapFromPair(
  sampleA0: TwapSample,
  sampleB0: TwapSample,
  sampleA1: TwapSample,
  sampleB1: TwapSample,
  windowSeconds: number,
): { price0: bigint; price1: bigint } {
  if (windowSeconds < 1) return { price0: 0n, price1: 0n };
  const dt0 = sampleB0.timestamp - sampleA0.timestamp;
  const dt1 = sampleB1.timestamp - sampleA1.timestamp;
  if (dt0 <= 0 || dt1 <= 0) return { price0: 0n, price1: 0n };
  return {
    price0: ((sampleB0.priceCumulative - sampleA0.priceCumulative) << 112n) / BigInt(dt0),
    price1: ((sampleB1.priceCumulative - sampleA1.priceCumulative) << 112n) / BigInt(dt1),
  };
}

/**
 * React hook: tracks a rolling 2-sample cache per pool and returns the
 * current TWAP (or spot fallback if the cache is empty / window too small).
 * Spec: contracts/frontend-module-api.md §6, data-model.md E8.
 */
export function useTwapPrice(input: UseTwapPriceInput): TwapResult {
  const {
    pool,
    price0Cumulative,
    price1Cumulative,
    blockTimestampLast,
    reserve0,
    reserve1,
    windowSeconds = 1800,
    minimumWindow = 60,
  } = input;

  const [result, setResult] = useState<TwapResult>({
    price0: null,
    price1: null,
    windowSeconds,
    source: "spot-fallback",
  });

  const update = useCallback(() => {
    if (!pool || price0Cumulative === null || price1Cumulative === null || blockTimestampLast === null) {
      return;
    }
    const cached = loadCache(pool);
    const now: [TwapSample, TwapSample] = [
      { priceCumulative: price0Cumulative, timestamp: blockTimestampLast },
      { priceCumulative: price1Cumulative, timestamp: blockTimestampLast },
    ];
    if (!cached) {
      saveCache(pool, [now[0], now[1]]);
      setResult({ price0: null, price1: null, windowSeconds, source: "spot-fallback" });
      return;
    }
    const [a0, a1] = cached;
    const [b0, b1] = now;
    const dt = b0.timestamp - a0.timestamp;
    if (dt < minimumWindow) {
      setResult({ price0: null, price1: null, windowSeconds, source: "spot-fallback" });
      return;
    }
    const twap = computeTwapFromPair(a0, b0, a1, b1, dt);
    setResult({ price0: twap.price0, price1: twap.price1, windowSeconds: dt, source: "twap" });
    // Roll the cache: shift B to A, keep B.
    saveCache(pool, [b0, b0]);
  }, [pool, price0Cumulative, price1Cumulative, blockTimestampLast, windowSeconds, minimumWindow]);

  useEffect(() => {
    update();
  }, [update]);

  // If we have reserves but no TWAP yet, fall back to spot price in Q112.112.
  useEffect(() => {
    if (result.source === "twap") return;
    if (reserve0 === null || reserve1 === null || reserve0 === undefined || reserve1 === undefined) {
      setResult((r) => ({ ...r, price0: null, price1: null, source: "spot-fallback" }));
      return;
    }
    if (reserve0 === 0n || reserve1 === 0n) {
      setResult((r) => ({ ...r, price0: null, price1: null, source: "spot-fallback" }));
      return;
    }
    // Spot price0 = reserve1 * 2^112 / reserve0 (token0 in token1 units).
    const price0Spot = (reserve1 << 112n) / reserve0;
    const price1Spot = (reserve0 << 112n) / reserve1;
    setResult({ price0: price0Spot, price1: price1Spot, windowSeconds: 0, source: "spot-fallback" });
  }, [reserve0, reserve1, result.source]);

  return result;
}
