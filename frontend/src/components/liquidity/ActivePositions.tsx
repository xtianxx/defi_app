"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePair } from "@/hooks/usePair";
import { useWeb3Context } from "@/providers/Web3Context";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { KNOWN_PAIRS, getTokenAddress } from "@/lib/contracts/tokens";
import { formatTokenAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

type SymbolPair = readonly [TokenSymbol, TokenSymbol];
type TokenSymbol = (typeof KNOWN_PAIRS)[number][0];

interface PositionRowProps {
  pair: SymbolPair;
  addressA: `0x${string}`;
  addressB: `0x${string}`;
  onUpdate: (key: string, isLoading: boolean, hasPosition: boolean) => void;
}

function PositionRow({ pair, addressA, addressB, onUpdate }: PositionRowProps) {
  const [symbolA, symbolB] = pair;
  const pairResult = usePair(addressA, addressB);
  const key = `${symbolA}-${symbolB}`;
  const isLoading = pairResult.lpBalance === null;
  const hasPosition = pairResult.lpBalance !== null && pairResult.lpBalance > 0n;

  useEffect(() => {
    onUpdate(key, isLoading, hasPosition);
  }, [key, isLoading, hasPosition, onUpdate]);

  if (isLoading) {
    return (
      <div className="flex animate-pulse items-center justify-between rounded-lg border border-border bg-secondary/50 p-3">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-4 w-16 rounded bg-muted" />
      </div>
    );
  }

  const lpBalance = pairResult.lpBalance;
  if (lpBalance === null || lpBalance <= 0n) return null;

  const poolShare =
    pairResult.liquidity !== null && pairResult.liquidity > 0n
      ? (lpBalance * 10000n) / pairResult.liquidity
      : null;
  const poolSharePct = poolShare !== null ? Number(poolShare) / 100 : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700",
        "dark:border-green-900 dark:bg-green-950 dark:text-green-400",
        "sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <span className="font-medium">
        {symbolA} / {symbolB}
      </span>
      <div className="flex flex-col items-start gap-0.5 sm:items-end">
        <span>{formatTokenAmount(lpBalance, 18)} LP</span>
        <span className="text-xs text-green-600 dark:text-green-500">
          {poolSharePct?.toFixed(2) ?? "—"}% of pool
        </span>
      </div>
    </div>
  );
}

export function ActivePositions() {
  const { status, chainId } = useWeb3Context();
  const [rowState, setRowState] = useState<
    Record<string, { isLoading: boolean; hasPosition: boolean }>
  >({});

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

  const isVisible = useMemo(() => {
    if (status !== "ready" || chainId === null) return false;
    const deployment = getDeployment(chainId);
    return isDeploymentConfigured(deployment);
  }, [status, chainId]);

  const isEmpty = useMemo(() => {
    const entries = Object.values(rowState);
    if (entries.length === 0) return false;
    return entries.every((row) => !row.isLoading && !row.hasPosition);
  }, [rowState]);

  if (!isVisible) return null;

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">Active Positions</h2>
      <div className="mt-3 space-y-2">
        {(KNOWN_PAIRS as readonly SymbolPair[]).map((pair) => {
          const [symbolA, symbolB] = pair;
          const addressA = getTokenAddress(symbolA, chainId ?? 0);
          const addressB = getTokenAddress(symbolB, chainId ?? 0);
          if (!addressA || !addressB) return null;
          return (
            <PositionRow
              key={`${symbolA}-${symbolB}`}
              pair={pair}
              addressA={addressA}
              addressB={addressB}
              onUpdate={handleRowUpdate}
            />
          );
        })}
      </div>
      {isEmpty && (
        <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No active positions — try adding liquidity.
        </div>
      )}
    </div>
  );
}
