// Server-side Route Handler that batches pair read calls against a single RPC
// for portfolio perf (SC-004). Spec: T061 — GET /api/reserves.
import { Contract } from "ethers";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { IUniswapV2Pair_ABI } from "@/lib/contracts/abis";
import { ANVIL_CHAIN_ID } from "@/lib/chains";
import { createServerProvider } from "@/lib/rpc";

export const runtime = "nodejs";

export interface ReservesResponse {
  reserve0: string;
  reserve1: string;
  blockTimestampLast: number;
  price0CumulativeLast: string;
  price1CumulativeLast: string;
  totalSupply: string;
  lpBalance: string;
}

/** Thrown when the pair address holds no deployed code (the pool does not exist). */
export class PairNotFoundError extends Error {
  constructor(pair: string) {
    super(`pair not found: ${pair}`);
    this.name = "PairNotFoundError";
  }
}

interface PairReadContract {
  getReserves(): Promise<readonly [bigint, bigint, bigint]>;
  price0CumulativeLast(): Promise<bigint>;
  price1CumulativeLast(): Promise<bigint>;
  totalSupply(): Promise<bigint>;
  balanceOf(account: string): Promise<bigint>;
}

/**
 * Uncached core read: reserves, cumulative prices, supply and LP balance for a
 * pair, batched into a single RPC round trip. Exported so unit tests can
 * exercise the logic directly without going through the Next.js data cache.
 */
export async function fetchReserves(
  pair: string,
  account: string,
  chainId: number = ANVIL_CHAIN_ID,
): Promise<ReservesResponse> {
  const provider = createServerProvider(chainId);
  const code = await provider.getCode(pair);
  if (code === "0x") {
    throw new PairNotFoundError(pair);
  }
  const pairContract = new Contract(
    pair,
    IUniswapV2Pair_ABI,
    provider,
  ) as unknown as PairReadContract;
  const [reserves, price0CumulativeLast, price1CumulativeLast, totalSupply, lpBalance] =
    await Promise.all([
      pairContract.getReserves(),
      pairContract.price0CumulativeLast(),
      pairContract.price1CumulativeLast(),
      pairContract.totalSupply(),
      pairContract.balanceOf(account),
    ]);
  return {
    reserve0: reserves[0].toString(),
    reserve1: reserves[1].toString(),
    blockTimestampLast: Number(reserves[2]),
    price0CumulativeLast: price0CumulativeLast.toString(),
    price1CumulativeLast: price1CumulativeLast.toString(),
    totalSupply: totalSupply.toString(),
    lpBalance: lpBalance.toString(),
  };
}

// revalidate=2s keeps reserves fresh for the app's TWAP window. The cache key
// is derived from keyParts ["reserves"] plus the (pair, account, chainId) args
// passed to the wrapped function.
const cachedReserves = unstable_cache(fetchReserves, ["reserves"], {
  tags: ["reserves"],
  revalidate: 2,
});

async function cachedFetchReserves(
  pair: string,
  account: string,
  chainId: number,
): Promise<ReservesResponse> {
  try {
    return await cachedReserves(pair, account, chainId);
  } catch (err) {
    // unstable_cache requires Next's incremental cache (App Router runtime).
    // Outside it (unit tests, plain node) degrade to the uncached read.
    if (err instanceof Error && err.message.includes("incrementalCache missing")) {
      return fetchReserves(pair, account, chainId);
    }
    throw err;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pair = searchParams.get("pair");
  const account = searchParams.get("account");
  const chainIdParam = searchParams.get("chainId");
  const chainId = chainIdParam ? Number(chainIdParam) : ANVIL_CHAIN_ID;

  if (!pair || !account) {
    return NextResponse.json({ error: "missing pair or account" }, { status: 400 });
  }

  try {
    const data = await cachedFetchReserves(pair, account, chainId);
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=4" },
    });
  } catch (err) {
    if (err instanceof PairNotFoundError) {
      return NextResponse.json({ error: "pair not found" }, { status: 404 });
    }
    const detail = err instanceof Error ? err.message : String(err);
    // Missing SEPOLIA_RPC_URL is a server misconfiguration (500), distinct
    // from runtime RPC failures (502 + Retry-After). frontend-module-api.md §2.
    if (detail === "SEPOLIA_RPC_URL not configured") {
      return NextResponse.json(
        { error: "rpc not configured", detail },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "rpc error", detail },
      { status: 502, headers: { "Retry-After": "2" } },
    );
  }
}
