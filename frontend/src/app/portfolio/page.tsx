"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Minus, Plus } from "lucide-react";
import { PositionCard } from "@/components/portfolio/PositionCard";
import { usePair } from "@/hooks/usePair";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useEarnedFees } from "@/hooks/useEarnedFees";
import type { HistoryEntry } from "@/hooks/usePortfolio";
import { useTwapPrice } from "@/hooks/useTwapPrice";
import { useWeb3Context } from "@/providers/Web3Context";
import { getBlockExplorerTxUrl, isSupportedChain } from "@/lib/chains";
import { WrongNetworkBanner } from "@/components/wallet/WrongNetworkBanner";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { getToken, getTokenAddress, KNOWN_PAIRS } from "@/lib/contracts/tokens";
import { formatTokenAmountFixed, truncateAddress } from "@/lib/format";

type TokenSymbol = (typeof KNOWN_PAIRS)[number][0];
type SymbolPair = readonly [TokenSymbol, TokenSymbol];

/**
 * Format a Q112.112 binary fixed-point price (from useTwapPrice) for display.
 *
 * Q112.112 encodes value = integer / 2^112 (binary scaling), NOT decimal
 * scaling. ethers v6 `formatUnits` routes through FixedNumber which caps
 * decimals at 18, so it cannot format Q112.112 directly.
 *
 * The Q112 price from useTwapPrice is `reserveB_raw / reserveA_raw * 2^112` —
 * the reserve ratio in RAW token units. To get the human-readable price
 * (tokenB per tokenA in display units) we must adjust for the decimal
 * difference: humanPrice = Q112 * 10^(decimalsA - decimalsB) / 2^112.
 * We then scale to 6 fractional digits via integer math.
 */
function formatQ112Price(value: bigint, decimalsA: number, decimalsB: number): string {
  if (value <= 0n) return "0";
  const UNIT = 1n << 112n;
  const exp = 6 + decimalsA - decimalsB; // scaled = value * 10^exp / 2^112
  let scaled: bigint;
  if (exp >= 0) {
    const pow = 10n ** BigInt(exp);
    scaled = (value * pow + UNIT / 2n) / UNIT;
  } else {
    const pow = 10n ** BigInt(-exp);
    scaled = (value + (UNIT * pow) / 2n) / (UNIT * pow);
  }
  if (scaled <= 0n) return "0";
  const intPart = scaled / 1_000_000n;
  const fracPart = scaled % 1_000_000n;
  // For very large prices, Number() would overflow — fall back to a compact
  // integer string with up to 12 significant chars (matches prior behaviour).
  if (intPart > 1_000_000_000_000n) {
    return intPart.toString().slice(0, 12);
  }
  const intStr = intPart.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (fracPart === 0n) return intStr;
  const fracStr = fracPart.toString().padStart(6, "0").replace(/0+$/, "");
  return `${intStr}.${fracStr}`;
}

function tokenDecimals(symbol: string): number {
  const token = getToken(symbol as TokenSymbol);
  return token ? token.decimals : 18;
}

/** Signed amount display — positive = user sold/added, negative = user received. */
function formatSignedAmount(value: bigint, decimals: number): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : "+"}${formatTokenAmountFixed(abs, decimals)}`;
}

interface PositionFetcherProps {
  pair: SymbolPair;
  onUpdate: (key: string, isLoading: boolean, hasPosition: boolean) => void;
}

/**
 * Per-pair position loader (T063). Resolves the pair address through the
 * factory via usePair (single RPC batch per pair — keeps the page interactive
 * well under SC-004's 3s), computes a TWAP/spot price label via useTwapPrice,
 * and renders a PositionCard when the wallet holds LP. Returns null otherwise.
 */
function PositionFetcher({ pair, onUpdate }: PositionFetcherProps) {
  const { chainId } = useWeb3Context();
  const [symbolA, symbolB] = pair;
  const key = `${symbolA}-${symbolB}`;
  const addressA = getTokenAddress(symbolA, chainId ?? 0);
  const addressB = getTokenAddress(symbolB, chainId ?? 0);
  const pairResult = usePair(addressA, addressB);
  const isLoading = pairResult.lpBalance === null;
  const hasPosition = pairResult.lpBalance !== null && pairResult.lpBalance > 0n;

  useEffect(() => {
    onUpdate(key, isLoading, hasPosition);
  }, [key, isLoading, hasPosition, onUpdate]);

  const twap = useTwapPrice({
    pool: pairResult.pairAddress,
    price0Cumulative: pairResult.price0CumulativeLast,
    price1Cumulative: pairResult.price1CumulativeLast,
    blockTimestampLast: pairResult.reserves?.blockTimestampLast ?? null,
    reserve0: pairResult.reserves?.reserve0 ?? null,
    reserve1: pairResult.reserves?.reserve1 ?? null,
  });

  const earnedFees = useEarnedFees({
    pairAddress: pairResult.pairAddress,
    lpBalance: pairResult.lpBalance,
    reserve0: pairResult.reserves?.reserve0 ?? null,
    reserve1: pairResult.reserves?.reserve1 ?? null,
    totalSupply: pairResult.liquidity,
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-2 w-full rounded bg-muted" />
        <div className="h-4 w-36 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-8 w-full rounded bg-muted" />
      </div>
    );
  }

  const { pairAddress, reserves, liquidity, token0, token1, lpBalance } = pairResult;
  if (lpBalance === null || lpBalance <= 0n) return null;
  if (!pairAddress || !reserves || !token0 || !token1 || liquidity === null || liquidity <= 0n) {
    return null;
  }

  // Pair contracts order token0 < token1 (CREATE2 sorting). Cards are labelled
  // in KNOWN_PAIRS order (matching ActivePositions / RemoveLiquidity), so when
  // the on-chain order differs we swap which reserve belongs to symbolA.
  const tokenAIsToken0 = token0.toLowerCase() === addressA?.toLowerCase();
  const reserveA = tokenAIsToken0 ? reserves.reserve0 : reserves.reserve1;
  const reserveB = tokenAIsToken0 ? reserves.reserve1 : reserves.reserve0;

  // Fees arrive in token0/token1 order — remap to symbolA/symbolB like reserves.
  const feesEarned0 = tokenAIsToken0 ? earnedFees.feesEarned0 : earnedFees.feesEarned1;
  const feesEarned1 = tokenAIsToken0 ? earnedFees.feesEarned1 : earnedFees.feesEarned0;

  // price0 = token1-per-token0 (Q112.112) → pick the direction that prices
  // symbolA in terms of symbolB.
  const priceAB = tokenAIsToken0 ? twap.price0 : twap.price1;
  const priceLabel =
    priceAB !== null && priceAB > 0n
      ? `1 ${symbolA} ≈ ${formatQ112Price(priceAB, tokenDecimals(symbolA), tokenDecimals(symbolB))} ${symbolB}`
      : null;
  const sourceLabel =
    twap.source === "twap" ? `TWAP · ${twap.windowSeconds}s window` : "Spot (fallback)";

  return (
    <div className="flex flex-col gap-1.5">
      <PositionCard
        pairAddress={pairAddress}
        token0Symbol={symbolA}
        token1Symbol={symbolB}
        token0Decimals={tokenDecimals(symbolA)}
        token1Decimals={tokenDecimals(symbolB)}
        reserve0={reserveA}
        reserve1={reserveB}
        totalSupply={liquidity}
        lpBalance={lpBalance}
        feesEarned0={feesEarned0}
        feesEarned1={feesEarned1}
      />
      <p className="px-1 text-xs text-muted-foreground">
        Price source: {sourceLabel}
        {priceLabel ? ` · ${priceLabel}` : ""}
      </p>
    </div>
  );
}

function HistoryRow({ entry, chainId }: { entry: HistoryEntry; chainId: number }) {
  const TypeIcon = entry.type === "swap" ? ArrowLeftRight : entry.type === "mint" ? Plus : Minus;
  const typeLabel = entry.type === "swap" ? "Swap" : entry.type === "mint" ? "Mint" : "Burn";
  const explorerUrl = getBlockExplorerTxUrl(chainId, entry.txHash);
  const timestamp = new Date(entry.timestamp * 1000);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <TypeIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{typeLabel}</span>
        <span className="text-muted-foreground">{entry.pairLabel}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        <span>
          {formatSignedAmount(entry.amount0, tokenDecimals(entry.token0Symbol))} {entry.token0Symbol}
        </span>
        <span aria-hidden="true"> / </span>
        <span>
          {formatSignedAmount(entry.amount1, tokenDecimals(entry.token1Symbol))} {entry.token1Symbol}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <time dateTime={timestamp.toISOString()}>{timestamp.toLocaleString()}</time>
        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-primary hover:underline"
          >
            {truncateAddress(entry.txHash)}
          </a>
        ) : (
          <span className="font-mono">{truncateAddress(entry.txHash)}</span>
        )}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { status, chainId, connect } = useWeb3Context();
  const [rowState, setRowState] = useState<
    Record<string, { isLoading: boolean; hasPosition: boolean }>
  >({});
  const portfolio = usePortfolio();

  const handleRowUpdate = useCallback(
    (key: string, isLoading: boolean, hasPosition: boolean) => {
      setRowState((prev) => {
        const current = prev[key];
        if (
          current !== undefined &&
          current.isLoading === isLoading &&
          current.hasPosition === hasPosition
        ) {
          return prev;
        }
        return { ...prev, [key]: { isLoading, hasPosition } };
      });
    },
    [],
  );

  const deployment = useMemo(
    () => (chainId !== null ? getDeployment(chainId) : null),
    [chainId],
  );

  // Empty only when EVERY pair has resolved and none holds LP (no premature
  // empty-state flash while rows are still loading).
  const isEmpty = useMemo(() => {
    const entries = Object.values(rowState);
    if (entries.length === 0) return false;
    return entries.every((row) => !row.isLoading && !row.hasPosition);
  }, [rowState]);

  if (status !== "ready") {
    return (
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground">
            Connect your wallet to view positions and transaction history.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={status === "connecting"}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {status === "connecting" ? "Connecting…" : "Connect wallet"}
          </button>
        </div>
      </div>
    );
  }

  if (
    chainId === null ||
    !isSupportedChain(chainId) ||
    !isDeploymentConfigured(deployment)
  ) {
    return (
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
        {chainId !== null && !isSupportedChain(chainId) ? (
          <div className="mt-4 max-w-md">
            <WrongNetworkBanner />
          </div>
        ) : (
          <p className="mt-4 text-muted-foreground">
            No contract deployment configured for this network.
          </p>
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(portfolio.totalCount / portfolio.pageSize));

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Positions</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {(KNOWN_PAIRS as readonly SymbolPair[]).map((pair) => {
          const [symbolA, symbolB] = pair;
          const addressA = getTokenAddress(symbolA, chainId);
          const addressB = getTokenAddress(symbolB, chainId);
          if (!addressA || !addressB) return null;
          return (
            <PositionFetcher
              key={`${symbolA}-${symbolB}`}
              pair={pair}
              onUpdate={handleRowUpdate}
            />
          );
        })}
      </div>
      {isEmpty && (
        <div className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No active positions — try swapping or adding liquidity
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold tracking-tight">Transaction History</h2>
      <div className="mt-3 space-y-3">
        {portfolio.isLoading && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="mt-2 h-4 w-2/3 rounded bg-muted" />
              </div>
            ))}
          </>
        )}
        {!portfolio.isLoading && portfolio.error && (
          <p className="text-sm text-destructive">{portfolio.error}</p>
        )}
        {!portfolio.isLoading && !portfolio.error && portfolio.totalCount === 0 && (
          <p className="text-sm text-muted-foreground">No transactions yet</p>
        )}
        {!portfolio.isLoading && portfolio.history.length > 0 && (
          <>
            {portfolio.history.map((entry) => (
              <HistoryRow
                key={`${entry.type}-${entry.pairAddress}-${entry.txHash}`}
                entry={entry}
                chainId={chainId}
              />
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={portfolio.page <= 1}
                  onClick={() => portfolio.setPage(portfolio.page - 1)}
                  className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {portfolio.page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={portfolio.page >= totalPages}
                  onClick={() => portfolio.setPage(portfolio.page + 1)}
                  className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
