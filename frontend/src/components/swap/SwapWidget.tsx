"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, ArrowUpDown, Settings2 } from "lucide-react";
import { useSwap } from "@/hooks/useSwap";
import { usePair } from "@/hooks/usePair";
import { useToken } from "@/hooks/useToken";
import { TOKEN_LIST, getToken, getTokenAddress } from "@/lib/contracts/tokens";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import {
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
  formatBasisPoints,
} from "@/lib/format";
import { getBlockExplorerTxUrl } from "@/lib/chains";
import { useWeb3Context } from "@/providers/Web3Context";
import { cn } from "@/lib/utils";

type TokenSymbol = (typeof TOKEN_LIST)[number]["symbol"];

interface TokenSelectProps {
  value: TokenSymbol;
  onChange: (symbol: TokenSymbol) => void;
  disabledOption: TokenSymbol;
  chainId: number | null;
}

function TokenSelect({ value, onChange, disabledOption, chainId }: TokenSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TokenSymbol)}
      className="h-10 cursor-pointer rounded-md border border-border bg-background px-2 py-1.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-ring"
    >
      {TOKEN_LIST.map((t) => {
        const unavailable = getTokenAddress(t.symbol, chainId ?? 0) === null;
        return (
          <option
            key={t.symbol}
            value={t.symbol}
            disabled={t.symbol === disabledOption || unavailable}
          >
            {t.symbol} — {t.name}
          </option>
        );
      })}
    </select>
  );
}

const SLIPPAGE_OPTIONS = [
  { label: "0.1%", bp: 10 },
  { label: "0.5%", bp: 50 },
  { label: "1.0%", bp: 100 },
  { label: "2.0%", bp: 200 },
  { label: "5.0%", bp: 500 },
];

export function SwapWidget() {
  const swap = useSwap();
  const { status, account, chainId, chain } = useWeb3Context();

  const [tokenInSymbol, setTokenInSymbol] = useState<TokenSymbol>("WETH");
  const [tokenOutSymbol, setTokenOutSymbol] = useState<TokenSymbol>("USDC");
  const [amountInStr, setAmountInStr] = useState("");
  const [slippageBp, setSlippageBp] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const tokenIn = getToken(tokenInSymbol);
  const tokenOut = getToken(tokenOutSymbol);

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
  const routerAddr = deployment?.router ?? null;

  const tokenInAddr = useMemo(
    () => getTokenAddress(tokenInSymbol, chainId ?? 0),
    [tokenInSymbol, chainId],
  );
  const tokenOutAddr = useMemo(
    () => getTokenAddress(tokenOutSymbol, chainId ?? 0),
    [tokenOutSymbol, chainId],
  );

  const amountIn = useMemo(
    () => parseTokenAmount(amountInStr, tokenIn.decimals),
    [amountInStr, tokenIn.decimals],
  );
  const hasAmount = amountInStr.trim() !== "" && amountIn > 0n;

  const tokenInMeta = useToken(tokenInAddr);
  const pair = usePair(tokenInAddr, tokenOutAddr);

  useEffect(() => {
    swap.setParams(
      tokenInAddr,
      tokenOutAddr,
      hasAmount ? amountIn : null,
    );
  }, [tokenInAddr, tokenOutAddr, amountIn, hasAmount, swap]);

  const allowance = tokenInMeta.allowance;
  const needsApprove = useMemo(
    () => hasAmount && (allowance === null || allowance < amountIn),
    [hasAmount, allowance, amountIn],
  );
  const insufficient = useMemo(
    () =>
      hasAmount &&
      tokenInMeta.balance !== null &&
      amountIn > tokenInMeta.balance,
    [hasAmount, tokenInMeta.balance, amountIn],
  );

  // A pair can remain deployed after its user-owned liquidity is removed. In
  // that state it may still report tiny reserves, for which V2 integer math
  // returns a zero quote. Treat both that case and known-invalid reserve data
  // as unavailable liquidity instead of presenting an actionable swap form.
  const hasKnownEmptyReserves = useMemo(
    () =>
      pair.pairAddress !== null &&
      pair.reserves !== null &&
      (pair.reserves.reserve0 <= 0n || pair.reserves.reserve1 <= 0n),
    [pair.pairAddress, pair.reserves],
  );
  const hasZeroQuote = swap.amountOutEstimated === 0n;

  const amountOutMin = useMemo(() => {
    if (!swap.amountOutEstimated || swap.amountOutEstimated <= 0n) return null;
    return (swap.amountOutEstimated * (10000n - BigInt(slippageBp))) / 10000n;
  }, [swap.amountOutEstimated, slippageBp]);

  const impactColor = useMemo(() => {
    const impact = swap.priceImpactPctBp;
    if (impact === null) return "text-muted-foreground";
    if (impact < 100) return "text-green-600";
    if (impact < 500) return "text-yellow-600";
    return "text-red-600";
  }, [swap.priceImpactPctBp]);

  const handleTokenInChange = useCallback(
    (symbol: TokenSymbol) => {
      if (symbol === tokenOutSymbol) {
        setTokenOutSymbol(tokenInSymbol);
      }
      setTokenInSymbol(symbol);
    },
    [tokenInSymbol, tokenOutSymbol],
  );

  const handleTokenOutChange = useCallback(
    (symbol: TokenSymbol) => {
      if (symbol === tokenInSymbol) {
        setTokenInSymbol(tokenOutSymbol);
      }
      setTokenOutSymbol(symbol);
    },
    [tokenInSymbol, tokenOutSymbol],
  );

  const handleFlip = useCallback(() => {
    setTokenInSymbol(tokenOutSymbol);
    setTokenOutSymbol(tokenInSymbol);
    setAmountInStr("");
  }, [tokenInSymbol, tokenOutSymbol]);

  const handleApprove = useCallback(async () => {
    if (!routerAddr || amountIn <= 0n) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const result = await tokenInMeta.approve(routerAddr, amountIn);
      if (result.ok) {
        // Re-read with a hint: refresh() must not overwrite the freshly
        // approved allowance with a stale pre-tx read (it retries internally
        // and keeps the optimistic value if the provider stays stale).
        await tokenInMeta.refresh({ allowanceAtLeast: amountIn });
      } else {
        setApproveError(result.error.message);
        console.error("[SwapWidget] approve failed:", result.error);
      }
    } catch (err) {
      setApproveError("Approve failed — check console for details");
      console.error("[SwapWidget] approve exception:", err);
    } finally {
      setIsApproving(false);
    }
  }, [routerAddr, amountIn, tokenInMeta]);

  const handleSwap = useCallback(async () => {
    if (
      !networkReady ||
      !hasAmount ||
      amountIn <= 0n ||
      !swap.amountOutEstimated ||
      swap.amountOutEstimated <= 0n ||
      amountOutMin === null ||
      !chainId
    ) {
      console.warn("[Swap] handleSwap preconditions not met:", {
        networkReady,
        hasAmount,
        amountIn,
        hasEstimate: !!swap.amountOutEstimated,
        estimatePositive: swap.amountOutEstimated ? swap.amountOutEstimated > 0n : false,
        hasAmountOutMin: amountOutMin !== null,
        hasChainId: !!chainId,
      });
      return;
    }
    // Pass the CURRENT input amount explicitly — the hook's internal state is
    // synced via an effect and can lag the input, which would submit a stale
    // amount (e.g. the previously typed value).
    await swap.execute(amountIn, amountOutMin, 1200n);
  }, [networkReady, hasAmount, amountIn, swap, amountOutMin, chainId]);

  const handleReset = useCallback(() => {
    swap.reset();
    setAmountInStr("");
    setTokenInSymbol("WETH");
    setTokenOutSymbol("USDC");
  }, [swap]);

  // Keep the "confirmed" box (with txHash + explorer link) visible until the
  // user acts: editing the amount (→ setParams sees a real change → phase
  // resets) or clicking "Swap again" (→ handleReset). Clearing the input here
  // previously triggered setParams(null), which wiped the terminal tx state.
  const swapBusy =
    swap.phase === "approving" ||
    swap.phase === "submitting" ||
    swap.phase === "mining";

  // After a confirmed swap, reconcile the widget's token state: the swap may
  // have approved + swapped on-chain, and the balance/allowance shown must
  // reflect that. Use refs so this effect depends only on the phase.
  const tokenInMetaRef = useRef(tokenInMeta);
  tokenInMetaRef.current = tokenInMeta;
  const latestAmountInRef = useRef(amountIn);
  latestAmountInRef.current = amountIn;
  useEffect(() => {
    if (swap.phase === "confirmed") {
      const amt = latestAmountInRef.current;
      void tokenInMetaRef.current.refresh({ allowanceAtLeast: amt ?? 0n });
    }
  }, [swap.phase]);

  const buttonLabel = useMemo(() => {
    const phase = swap.phase;
    switch (phase) {
      case "approving":
        return "Approving…";
      case "submitting":
        return "Submitting…";
      case "mining":
        return "Mining…";
      case "confirmed":
        return "Confirmed ✓";
      case "reverted":
        return "Reverted";
      case "rejected":
      case "error":
        return "Try again";
      default:
        if (!networkReady) return "Connect wallet";
        if (pair.pairAddress === null) return "No pool";
        if (hasKnownEmptyReserves) return "No liquidity";
        if (!hasAmount) return "Enter amount";
        if (
          swap.amountOutEstimated === null ||
          swap.amountOutEstimated <= 0n
        ) {
          return "Insufficient liquidity";
        }
        if (insufficient) return "Insufficient balance";
        if (needsApprove) return "Approve first";
        return "Swap";
    }
  }, [
    swap.phase,
    networkReady,
    hasAmount,
    insufficient,
    pair.pairAddress,
    hasKnownEmptyReserves,
    swap.amountOutEstimated,
    needsApprove,
  ]);

  const swapDisabled = useMemo(
    () =>
      !networkReady ||
      !hasAmount ||
      insufficient ||
      pair.pairAddress === null ||
      hasKnownEmptyReserves ||
      (hasAmount &&
        (swap.amountOutEstimated === null || swap.amountOutEstimated <= 0n)) ||
      needsApprove ||
      swap.phase === "approving" ||
      swap.phase === "submitting" ||
      swap.phase === "mining" ||
      swap.phase === "confirmed",
    [
      networkReady,
      hasAmount,
      insufficient,
      pair.pairAddress,
      hasKnownEmptyReserves,
      swap.amountOutEstimated,
      needsApprove,
      swap.phase,
    ],
  );

  const showPoolEmpty =
    pair.pairAddress === null && tokenInAddr !== null && tokenOutAddr !== null;
  const showInsufficientLiquidity =
    pair.pairAddress !== null && (hasKnownEmptyReserves || hasZeroQuote);

  const explorerUrl = useMemo(
    () =>
      chainId !== null && swap.txHash ? getBlockExplorerTxUrl(chainId, swap.txHash) : null,
    [chainId, swap.txHash],
  );

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Swap</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFlip}
            aria-label="Flip direction"
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>

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
      </div>

      <div className="space-y-1 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>You pay</span>
          <span>
            Balance:{" "}
            {formatTokenAmount(tokenInMeta.balance, tokenIn.decimals)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TokenSelect
            value={tokenInSymbol}
            onChange={handleTokenInChange}
            disabledOption={tokenOutSymbol}
            chainId={chainId}
          />
          <input
            type="text"
            inputMode="decimal"
            pattern="^[0-9]*[.,]?[0-9]*$"
            placeholder="0.0"
            value={amountInStr}
            onChange={(e) => setAmountInStr(e.target.value)}
            className="flex-1 bg-transparent py-2 text-right text-2xl font-medium outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="relative -my-2 flex justify-center">
        <button
          type="button"
          onClick={handleFlip}
          aria-label="Swap tokens"
          className="z-10 rounded-full border border-border bg-background p-1.5 shadow-sm transition-colors hover:bg-accent"
        >
          <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-1 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>You receive</span>
          <span>{tokenOut.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <TokenSelect
            value={tokenOutSymbol}
            onChange={handleTokenOutChange}
            disabledOption={tokenInSymbol}
            chainId={chainId}
          />
          <input
            type="text"
            readOnly
            placeholder="0.0"
            value={
              swap.amountOutEstimated === 0n
                ? ""
                : formatTokenAmountFixed(swap.amountOutEstimated, tokenOut.decimals, 6)
            }
            className="flex-1 bg-transparent py-2 text-right text-2xl font-medium outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {hasAmount && pair.pairAddress && swap.amountOutEstimated && swap.amountOutEstimated > 0n && (
        <div className="mt-3 flex flex-col gap-1 rounded-lg border border-border bg-background/50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Price impact</span>
            <span className={cn("font-medium", impactColor)}>
              {formatBasisPoints(swap.priceImpactPctBp, 2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fee</span>
            <span className="font-medium text-foreground">0.30%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Minimum received</span>
            <span className="font-medium text-foreground">
              {formatTokenAmountFixed(amountOutMin, tokenOut.decimals, 6)}{" "}
              {tokenOut.symbol}
            </span>
          </div>
        </div>
      )}

      {showPoolEmpty && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">No liquidity pool for this pair yet.</p>
          <Link
            href="/liquidity"
            className="mt-1 inline-block font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Add Liquidity
          </Link>
        </div>
      )}

      {showInsufficientLiquidity && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">
            {hasZeroQuote
              ? "Insufficient liquidity for this swap amount."
              : "This pool has no liquidity available."}
          </p>
          <Link
            href="/liquidity"
            className="mt-1 inline-block font-semibold underline underline-offset-2 hover:opacity-80"
          >
            Add Liquidity
          </Link>
        </div>
      )}

      {approveError && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">Approve failed: {approveError}</p>
        </div>
      )}
      {swap.error && swap.phase !== "rejected" && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">{swap.error.message}</p>
          {(swap.error as { hint?: string } | null)?.hint && (
            <p className="mt-1 text-destructive/80">
              {(swap.error as { hint?: string } | null)?.hint}
            </p>
          )}
        </div>
      )}

      {swap.phase === "confirmed" && swap.txHash && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
          <p className="font-medium">Swap confirmed ✓</p>
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
            <p className="mt-1 break-all">{swap.txHash}</p>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="mt-2 w-full rounded-md border border-green-200 bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-green-100 dark:border-green-900 dark:hover:bg-green-900"
          >
            Swap again
          </button>
        </div>
      )}

      {needsApprove && !swapBusy && (
        <button
          type="button"
          onClick={handleApprove}
          disabled={isApproving || !networkReady}
          className="mt-3 w-full rounded-md bg-secondary px-3 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {isApproving ? "Approving…" : "Approve"}
        </button>
      )}

      <button
        type="button"
        onClick={handleSwap}
        disabled={swapDisabled}
        className="mt-3 w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
