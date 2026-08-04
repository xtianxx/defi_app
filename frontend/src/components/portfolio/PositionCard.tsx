"use client";

import Link from "next/link";
import { formatTokenAmount, formatTokenAmountFixed } from "@/lib/format";

export interface PositionCardProps {
  pairAddress: `0x${string}`;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  lpBalance: bigint;
  feesEarned0?: bigint | null;
  feesEarned1?: bigint | null;
  isLoading?: boolean;
}

/**
 * Presentational card for a single LP position (T062). All math is bigint:
 * share = lpBalance * 10000 / totalSupply (basis points),
 * deposited = reserve * lpBalance / totalSupply.
 */
export function PositionCard({
  pairAddress,
  token0Symbol,
  token1Symbol,
  token0Decimals,
  token1Decimals,
  reserve0,
  reserve1,
  totalSupply,
  lpBalance,
  feesEarned0,
  feesEarned1,
  isLoading = false,
}: PositionCardProps) {
  if (isLoading) {
    return (
      <div
        aria-label="Loading position"
        className="animate-pulse space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
      >
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-2 w-full rounded bg-muted" />
        <div className="h-4 w-36 rounded bg-muted" />
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="h-8 w-full rounded bg-muted" />
      </div>
    );
  }

  if (lpBalance <= 0n) return null;

  const sharePctBp = (lpBalance * 10000n) / totalSupply;
  const sharePct = Number(sharePctBp) / 100;
  const depositedAmount0 = (reserve0 * lpBalance) / totalSupply;
  const depositedAmount1 = (reserve1 * lpBalance) / totalSupply;
  const hasFees0 = feesEarned0 != null;
  const hasFees1 = feesEarned1 != null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">
          {token0Symbol} / {token1Symbol}
        </h3>
        <span className="text-sm text-muted-foreground">
          {formatTokenAmount(lpBalance, 18)} LP
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Pool share</span>
          <span>{sharePct.toFixed(2)}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(Math.max(sharePct, 0), 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Deposited</span>
          <span className="text-right">
            <span>
              {formatTokenAmountFixed(depositedAmount0, token0Decimals)} {token0Symbol}
            </span>
            <span aria-hidden="true"> / </span>
            <span>
              {formatTokenAmountFixed(depositedAmount1, token1Decimals)} {token1Symbol}
            </span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Fees earned</span>
          <span className="text-right">
            <span>
              {hasFees0
                ? `${formatTokenAmountFixed(feesEarned0, token0Decimals)} ${token0Symbol}`
                : "—"}
            </span>
            <span aria-hidden="true"> / </span>
            <span>
              {hasFees1
                ? `${formatTokenAmountFixed(feesEarned1, token1Decimals)} ${token1Symbol}`
                : "—"}
            </span>
          </span>
        </div>
      </div>

      {(!hasFees0 || !hasFees1) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Fees tracked via event history
        </p>
      )}

      <div className="mt-4">
        <Link
          href={`/liquidity?pair=${pairAddress}`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/80"
        >
          Manage liquidity
        </Link>
      </div>
    </div>
  );
}
