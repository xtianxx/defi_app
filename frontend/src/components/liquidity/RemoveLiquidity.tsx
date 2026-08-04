"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useLiquidity, estimateRemoval } from "@/hooks/useLiquidity";
import { usePair } from "@/hooks/usePair";
import { KNOWN_PAIRS, getToken, getTokenAddress } from "@/lib/contracts/tokens";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { formatTokenAmount, formatTokenAmountFixed } from "@/lib/format";
import { getBlockExplorerTxUrl } from "@/lib/chains";
import { useWeb3Context } from "@/providers/Web3Context";
import { cn } from "@/lib/utils";

type SymbolPair = readonly [TokenSymbol, TokenSymbol];
type TokenSymbol = (typeof KNOWN_PAIRS)[number][0];

const SLIPPAGE_OPTIONS = [
  { label: "0.1%", bp: 10 },
  { label: "0.5%", bp: 50 },
  { label: "1.0%", bp: 100 },
  { label: "2.0%", bp: 200 },
  { label: "5.0%", bp: 500 },
];

const REMOVE_PERCENT_PRESETS = [25, 50, 75, 100];

interface PositionPickerRowProps {
  pair: SymbolPair;
  chainId: number | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onUpdate: (key: string, hasPosition: boolean) => void;
}

function PositionPickerRow({
  pair,
  chainId,
  selectedKey,
  onSelect,
  onUpdate,
}: PositionPickerRowProps) {
  const [symbolA, symbolB] = pair;
  const key = `${symbolA}-${symbolB}`;
  const addressA = useMemo(
    () => getTokenAddress(symbolA, chainId ?? 0),
    [symbolA, chainId],
  );
  const addressB = useMemo(
    () => getTokenAddress(symbolB, chainId ?? 0),
    [symbolB, chainId],
  );
  const pairResult = usePair(addressA, addressB);

  const isLoading = pairResult.lpBalance === null;
  const hasPosition = pairResult.lpBalance !== null && pairResult.lpBalance > 0n;

  useEffect(() => {
    onUpdate(key, hasPosition);
  }, [key, hasPosition, onUpdate]);

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
    <button
      type="button"
      onClick={() => onSelect(key)}
      aria-pressed={selectedKey === key}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border p-3 text-left text-sm transition-colors",
        "sm:flex-row sm:items-center sm:justify-between",
        selectedKey === key
          ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary"
          : "border-border bg-secondary/50 text-foreground hover:bg-accent",
      )}
    >
      <span className="font-medium">
        {symbolA} / {symbolB}
      </span>
      <div className="flex flex-col items-start gap-0.5 sm:items-end">
        <span>{formatTokenAmount(lpBalance, 18)} LP</span>
        <span className="text-xs text-muted-foreground">
          {poolSharePct?.toFixed(2) ?? "—"}% of pool
        </span>
      </div>
    </button>
  );
}

export function RemoveLiquidity() {
  const liq = useLiquidity();
  const { status, account, chainId, chain } = useWeb3Context();

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [percent, setPercent] = useState(25);
  const [customPercentStr, setCustomPercentStr] = useState("");
  const [slippageBp, setSlippageBp] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [usePermit, setUsePermit] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [rowState, setRowState] = useState<Record<string, boolean>>({});

  const handleRowUpdate = useCallback(
    (key: string, hasPosition: boolean) => {
      setRowState((prev) => {
        const current = prev[key];
        if (current !== undefined && current === hasPosition) return prev;
        return { ...prev, [key]: hasPosition };
      });
    },
    [],
  );

  const deployment = useMemo(
    () => (chainId !== null ? getDeployment(chainId) : null),
    [chainId],
  );
  const networkReady = useMemo(
    () =>
      status === "ready" &&
      account !== null &&
      chainId !== null &&
      chain !== null &&
      isDeploymentConfigured(deployment),
    [status, account, chainId, chain, deployment],
  );
  const isVisible = useMemo(() => {
    if (status !== "ready" || chainId === null) return false;
    return isDeploymentConfigured(deployment);
  }, [status, chainId, deployment]);

  const selectedPair = useMemo<SymbolPair | null>(() => {
    if (!selectedKey) return null;
    const found = (KNOWN_PAIRS as readonly SymbolPair[]).find(
      ([a, b]) => `${a}-${b}` === selectedKey,
    );
    return found ?? null;
  }, [selectedKey]);

  const [symbolA, symbolB] = selectedPair ?? [null, null];
  const addressA = useMemo(
    () => (symbolA ? getTokenAddress(symbolA, chainId ?? 0) : null),
    [symbolA, chainId],
  );
  const addressB = useMemo(
    () => (symbolB ? getTokenAddress(symbolB, chainId ?? 0) : null),
    [symbolB, chainId],
  );
  const selectedPairResult = usePair(addressA, addressB);

  const tokenA = useMemo(
    () => (symbolA ? getToken(symbolA) : null),
    [symbolA],
  );
  const tokenB = useMemo(
    () => (symbolB ? getToken(symbolB) : null),
    [symbolB],
  );

  const isWETHA = symbolA === "WETH";
  const isWETHB = symbolB === "WETH";
  const isWETHPair = isWETHA || isWETHB;
  const returnLabelA = isWETHA ? "ETH (WETH unwrap)" : symbolA;
  const returnLabelB = isWETHB ? "ETH (WETH unwrap)" : symbolB;

  const lpBalance = selectedPairResult.lpBalance;
  const lpToBurn = useMemo(() => {
    if (lpBalance === null || lpBalance <= 0n) return 0n;
    return (lpBalance * BigInt(percent)) / 100n;
  }, [lpBalance, percent]);

  const estimated = useMemo(() => {
    if (
      lpToBurn <= 0n ||
      !selectedPairResult.reserves ||
      !selectedPairResult.token0 ||
      !addressA ||
      !selectedPairResult.liquidity ||
      selectedPairResult.liquidity <= 0n
    ) {
      return null;
    }
    return estimateRemoval(
      lpToBurn,
      selectedPairResult.liquidity,
      selectedPairResult.reserves.reserve0,
      selectedPairResult.reserves.reserve1,
      selectedPairResult.token0,
      addressA,
    );
  }, [lpToBurn, selectedPairResult, addressA]);

  const amountA = estimated?.amountA ?? 0n;
  const amountB = estimated?.amountB ?? 0n;

  const amountAMin = useMemo(() => {
    if (amountA <= 0n) return 0n;
    return (amountA * (10000n - BigInt(slippageBp))) / 10000n;
  }, [amountA, slippageBp]);
  const amountBMin = useMemo(() => {
    if (amountB <= 0n) return 0n;
    return (amountB * (10000n - BigInt(slippageBp))) / 10000n;
  }, [amountB, slippageBp]);

  const handlePreset = useCallback(
    (p: number) => {
      setPercent(p);
      setCustomPercentStr(String(p));
    },
    [],
  );

  const handleCustomChange = useCallback((value: string) => {
    setCustomPercentStr(value);
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      setPercent(Math.max(0, Math.min(100, Math.round(parsed))));
    }
  }, []);

  const handleRemoveLiquidity = useCallback(async () => {
    if (
      !networkReady ||
      !selectedPair ||
      !addressA ||
      !addressB ||
      !tokenA ||
      !tokenB
    ) {
      return;
    }
    if (lpToBurn <= 0n) return;
    if (percent === 100 && !confirmClose) return;

    if (isWETHPair) {
      const token = isWETHA ? addressB : addressA;
      const amountTokenMin = isWETHA ? amountBMin : amountAMin;
      const amountETHMin = isWETHA ? amountAMin : amountBMin;
      await liq.removeLiquidityETH({
        token,
        liquidity: lpToBurn,
        amountTokenMin,
        amountETHMin,
        deadlineSeconds: 1200n,
        usePermit,
      });
    } else {
      await liq.removeLiquidity({
        tokenA: addressA,
        tokenB: addressB,
        liquidity: lpToBurn,
        amountAMin,
        amountBMin,
        deadlineSeconds: 1200n,
        usePermit,
      });
    }
  }, [
    networkReady,
    selectedPair,
    addressA,
    addressB,
    tokenA,
    tokenB,
    lpToBurn,
    percent,
    confirmClose,
    isWETHPair,
    isWETHA,
    amountAMin,
    amountBMin,
    usePermit,
    liq,
  ]);

  const handleReset = useCallback(() => {
    liq.reset();
    setSelectedKey(null);
    setPercent(25);
    setCustomPercentStr("");
    setConfirmClose(false);
    setUsePermit(false);
  }, [liq]);

  useEffect(() => {
    if (liq.phase === "confirmed") {
      setConfirmClose(false);
    }
  }, [liq.phase]);

  const explorerUrl = useMemo(
    () =>
      chainId !== null && liq.txHash ? getBlockExplorerTxUrl(chainId, liq.txHash) : null,
    [chainId, liq.txHash],
  );

  const isEmpty = useMemo(() => {
    const entries = Object.values(rowState);
    if (entries.length === 0) return false;
    return entries.every((row) => !row);
  }, [rowState]);

  const buttonLabel = useMemo(() => {
    const phase = liq.phase;
    switch (phase) {
      case "approving":
        return "Approving…";
      case "submitting":
        return "Submitting…";
      case "mining":
        return "Mining…";
      case "confirmed":
        return "Removed ✓";
      case "reverted":
        return "Reverted";
      case "rejected":
      case "error":
        return "Try again";
      default:
        if (!networkReady) return "Connect wallet";
        if (!selectedPair) return "Select a position";
        if (lpToBurn <= 0n) return "Enter an amount";
        if (percent === 100 && !confirmClose) return "Confirm closing position";
        return "Remove Liquidity";
    }
  }, [
    liq.phase,
    networkReady,
    selectedPair,
    lpToBurn,
    percent,
    confirmClose,
  ]);

  const buttonDisabled = useMemo(() => {
    const phase = liq.phase;
    if (
      phase === "approving" ||
      phase === "submitting" ||
      phase === "mining" ||
      phase === "confirmed"
    ) {
      return true;
    }
    if (!networkReady) return true;
    if (!selectedPair) return true;
    if (lpToBurn <= 0n) return true;
    if (percent === 100 && !confirmClose) return true;
    return false;
  }, [liq.phase, networkReady, selectedPair, lpToBurn, percent, confirmClose]);

  if (!isVisible) return null;

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Remove Liquidity</h2>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Settings"
            aria-expanded={showSettings}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-md border border-border bg-popover p-2 shadow-sm">
              <p className="mb-2 text-xs font-medium text-popover-foreground">
                Slippage tolerance
              </p>
              <div className="grid grid-cols-3 gap-1">
                {SLIPPAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.bp}
                    type="button"
                    onClick={() => {
                      setSlippageBp(opt.bp);
                      setShowSettings(false);
                    }}
                    className={cn(
                      "rounded-md border px-1.5 py-1 text-xs font-medium transition-colors",
                      slippageBp === opt.bp
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {(KNOWN_PAIRS as readonly SymbolPair[]).map((pair) => {
          const [symbolA, symbolB] = pair;
          return (
            <PositionPickerRow
              key={`${symbolA}-${symbolB}`}
              pair={pair}
              chainId={chainId}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onUpdate={handleRowUpdate}
            />
          );
        })}
      </div>

      {isEmpty && (
        <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No active positions — add liquidity first.
        </div>
      )}

      {!isEmpty && !selectedKey && (
        <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Select a position to remove liquidity.
        </div>
      )}

      {selectedPair && tokenA && tokenB && addressA && addressB && (
        <div className="mt-4 space-y-3">
          <h3 className="text-base font-medium tracking-tight">
            {symbolA} / {symbolB}
          </h3>

          {/* Percentage controls */}
          <div className="space-y-2 rounded-xl border border-border bg-secondary/50 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Amount to remove</span>
              <span>{formatTokenAmount(lpBalance, 18)} LP available</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {REMOVE_PERCENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    "rounded-md border px-1.5 py-1.5 text-xs font-medium transition-colors",
                    percent === preset && customPercentStr === String(preset)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {preset}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Custom</span>
              <input
                type="number"
                min={0}
                max={100}
                value={customPercentStr}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="h-8 w-20 rounded-md border border-border bg-background px-2 py-1 text-right text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          {/* Estimated returns */}
          <div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-muted-foreground">You receive</span>
              {!selectedPairResult.liquidity || selectedPairResult.liquidity <= 0n ? (
                <span className="text-muted-foreground">—</span>
              ) : null}
            </div>
            {estimated ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{returnLabelA}</span>
                  <span className="font-medium text-foreground">
                    {formatTokenAmountFixed(amountA, tokenA.decimals, 6)} {returnLabelA}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{returnLabelB}</span>
                  <span className="font-medium text-foreground">
                    {formatTokenAmountFixed(amountB, tokenB.decimals, 6)} {returnLabelB}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {isWETHPair && (
              <p className="mt-2 text-muted-foreground">
                WETH will be unwrapped to ETH before it reaches your wallet.
              </p>
            )}
          </div>

          {/* 100% warning */}
          {percent === 100 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
              <p className="font-medium">100% removal closes your position entirely.</p>
              <label className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confirmClose}
                  onChange={(e) => setConfirmClose(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-300"
                />
                <span>I understand — close my position</span>
              </label>
            </div>
          )}

          {/* Permit toggle */}
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/50 p-3 text-sm">
            <input
              type="checkbox"
              checked={usePermit}
              onChange={(e) => setUsePermit(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <div className="flex flex-col">
              <span className="font-medium text-foreground">Use permit instead of approve</span>
              <span className="text-xs text-muted-foreground">
                Sign one signature instead of an approval transaction.
              </span>
            </div>
          </label>

          {/* Transaction feedback - error */}
          {liq.error && liq.phase !== "rejected" && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="font-medium">{liq.error.message}</p>
            </div>
          )}

          {/* Transaction feedback - success */}
          {liq.phase === "confirmed" && liq.txHash && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              <p className="font-medium">Liquidity removed ✓</p>
              <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                Note: MetaMask may show this transaction as "Failed" on local chains even though it succeeded — a known MetaMask display bug. The on-chain status shown here is authoritative.
              </p>
              {explorerUrl ? (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block break-all underline underline-offset-2 hover:opacity-80"
                >
                  View on explorer
                </a>
              ) : (
                <p className="mt-1 break-all">{liq.txHash}</p>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 w-full rounded-md border border-green-200 bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-green-100 dark:border-green-900 dark:hover:bg-green-900"
              >
                Remove another position
              </button>
            </div>
          )}

          {/* Main action button */}
          <button
            type="button"
            onClick={handleRemoveLiquidity}
            disabled={buttonDisabled}
            className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {buttonLabel}
          </button>
        </div>
      )}
    </div>
  );
}
