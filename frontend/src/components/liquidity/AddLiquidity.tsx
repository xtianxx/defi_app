"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useLiquidity, estimateOptimal } from "@/hooks/useLiquidity";
import { usePair } from "@/hooks/usePair";
import { useToken } from "@/hooks/useToken";
import { TOKEN_LIST, getToken, getTokenAddress } from "@/lib/contracts/tokens";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import {
  formatBasisPoints,
  formatTokenAmount,
  formatTokenAmountFixed,
  parseTokenAmount,
} from "@/lib/format";
import { getBlockExplorerTxUrl } from "@/lib/chains";
import { useWeb3Context } from "@/providers/Web3Provider";
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

export function AddLiquidity() {
  const liq = useLiquidity();
  const { status, account, chainId, chain, provider } = useWeb3Context();

  const [tokenASymbol, setTokenASymbol] = useState<TokenSymbol>("WETH");
  const [tokenBSymbol, setTokenBSymbol] = useState<TokenSymbol>("USDC");
  const [amountAStr, setAmountAStr] = useState("");
  const [amountBStr, setAmountBStr] = useState("");
  const [slippageBp, setSlippageBp] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [approvingA, setApprovingA] = useState(false);
  const [approvingB, setApprovingB] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint | null>(null);

  const tokenA = getToken(tokenASymbol);
  const tokenB = getToken(tokenBSymbol);

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

  const isWETHA = tokenASymbol === "WETH";
  const isWETHB = tokenBSymbol === "WETH";
  const isWETHPair = isWETHA || isWETHB;

  // Fetch native ETH balance when a WETH side is selected and a wallet is connected.
  useEffect(() => {
    if (!isWETHPair || !account || !provider) {
      setEthBalance(null);
      return;
    }
    let cancelled = false;
    provider
      .getBalance(account)
      .then((b) => { if (!cancelled) setEthBalance(b as bigint); })
      .catch(() => { if (!cancelled) setEthBalance(null); });
    return () => { cancelled = true; };
  }, [isWETHPair, account, provider, chainId]);

  const tokenAAddr = useMemo(
    () => getTokenAddress(tokenASymbol, chainId ?? 0),
    [tokenASymbol, chainId],
  );
  const tokenBAddr = useMemo(
    () => getTokenAddress(tokenBSymbol, chainId ?? 0),
    [tokenBSymbol, chainId],
  );

  const amountA = useMemo(
    () => parseTokenAmount(amountAStr, tokenA.decimals),
    [amountAStr, tokenA.decimals],
  );
  const amountB = useMemo(
    () => parseTokenAmount(amountBStr, tokenB.decimals),
    [amountBStr, tokenB.decimals],
  );
  const hasAmountA = amountAStr.trim() !== "" && amountA > 0n;
  const hasAmountB = amountBStr.trim() !== "" && amountB > 0n;

  const tokenAMeta = useToken(tokenAAddr);
  const tokenBMeta = useToken(tokenBAddr);
  const pair = usePair(tokenAAddr, tokenBAddr);

  const isFirstProvider = pair.pairAddress === null && tokenAAddr !== null && tokenBAddr !== null;

  // Compute optimal amounts from the pool reserves
  const optimal = useMemo(() => {
    if (!hasAmountA || !pair.reserves || !pair.token0) return null;
    const tokenAIsToken0 = tokenAAddr?.toLowerCase() === pair.token0.toLowerCase();
    const reserveA = tokenAIsToken0 ? pair.reserves.reserve0 : pair.reserves.reserve1;
    const reserveB = tokenAIsToken0 ? pair.reserves.reserve1 : pair.reserves.reserve0;
    const amountBValue = hasAmountB ? amountB : 0n;
    return estimateOptimal(amountA, reserveA, reserveB, amountBValue);
  }, [hasAmountA, hasAmountB, amountA, amountB, pair.reserves, pair.token0, tokenAAddr]);

  // Deviation between user's amountB and optimal amountB (in basis points)
  const deviationBp = useMemo(() => {
    if (!optimal || !hasAmountB) return null;
    if (optimal.amountB <= 0n) return null;
    const diff = amountB > optimal.amountB ? amountB - optimal.amountB : optimal.amountB - amountB;
    if (diff <= 0n) return 0;
    return Number((diff * 10000n) / optimal.amountB);
  }, [optimal, hasAmountB, amountB]);

  const needsApproveA = useMemo(
    () => hasAmountA && !isWETHA && (tokenAMeta.allowance === null || tokenAMeta.allowance < amountA),
    [hasAmountA, isWETHA, tokenAMeta.allowance, amountA],
  );
  const needsApproveB = useMemo(
    () => hasAmountB && !isWETHB && (tokenBMeta.allowance === null || tokenBMeta.allowance < amountB),
    [hasAmountB, isWETHB, tokenBMeta.allowance, amountB],
  );

  const insufficientA = useMemo(
    () =>
      hasAmountA &&
      (isWETHA
        ? ethBalance !== null && amountA > ethBalance
        : tokenAMeta.balance !== null && amountA > tokenAMeta.balance),
    [hasAmountA, isWETHA, ethBalance, amountA, tokenAMeta.balance],
  );
  const insufficientB = useMemo(
    () =>
      hasAmountB &&
      (isWETHB
        ? ethBalance !== null && amountB > ethBalance
        : tokenBMeta.balance !== null && amountB > tokenBMeta.balance),
    [hasAmountB, isWETHB, ethBalance, amountB, tokenBMeta.balance],
  );

  // Slippage-adjusted minimum amounts
  const amountAMin = useMemo(() => {
    if (!hasAmountA) return 0n;
    return (amountA * (10000n - BigInt(slippageBp))) / 10000n;
  }, [hasAmountA, amountA, slippageBp]);

  const amountBMin = useMemo(() => {
    if (!hasAmountB) return 0n;
    return (amountB * (10000n - BigInt(slippageBp))) / 10000n;
  }, [hasAmountB, amountB, slippageBp]);

  // Pool share in basis points
  const poolShareBp = useMemo(() => {
    if (!pair.lpBalance || !pair.liquidity || pair.liquidity <= 0n) return null;
    return Number((pair.lpBalance * 10000n) / pair.liquidity);
  }, [pair.lpBalance, pair.liquidity]);

  const handleTokenAChange = useCallback(
    (symbol: TokenSymbol) => {
      if (symbol === tokenBSymbol) {
        setTokenBSymbol(tokenASymbol);
      }
      setTokenASymbol(symbol);
      setAmountAStr("");
      setAmountBStr("");
    },
    [tokenASymbol, tokenBSymbol],
  );

  const handleTokenBChange = useCallback(
    (symbol: TokenSymbol) => {
      if (symbol === tokenASymbol) {
        setTokenASymbol(tokenBSymbol);
      }
      setTokenBSymbol(symbol);
      setAmountAStr("");
      setAmountBStr("");
    },
    [tokenASymbol, tokenBSymbol],
  );

  const handleApproveA = useCallback(async () => {
    if (approvingA || !routerAddr || amountA <= 0n) return;
    setApprovingA(true);
    try {
      const result = await tokenAMeta.approve(routerAddr, amountA);
      if (result.ok) {
        await tokenAMeta.refresh();
      } else {
        console.error("[AddLiquidity] approve tokenA failed:", result.error);
      }
    } catch (err) {
      console.error("[AddLiquidity] approve tokenA exception:", err);
    } finally {
      setApprovingA(false);
    }
  }, [approvingA, routerAddr, amountA, tokenAMeta]);

  const handleApproveB = useCallback(async () => {
    if (approvingB || !routerAddr || amountB <= 0n) return;
    setApprovingB(true);
    try {
      const result = await tokenBMeta.approve(routerAddr, amountB);
      if (result.ok) {
        await tokenBMeta.refresh();
      } else {
        console.error("[AddLiquidity] approve tokenB failed:", result.error);
      }
    } catch (err) {
      console.error("[AddLiquidity] approve tokenB exception:", err);
    } finally {
      setApprovingB(false);
    }
  }, [approvingB, routerAddr, amountB, tokenBMeta]);

  const handleAddLiquidity = useCallback(async () => {
    if (
      !networkReady ||
      !hasAmountA ||
      !hasAmountB ||
      !tokenAAddr ||
      !tokenBAddr ||
      !chainId
    ) {
      return;
    }

    if (isWETHPair) {
      const tokenAddr = isWETHA ? tokenBAddr : tokenAAddr;
      const amountTokenDesired = isWETHA ? amountB : amountA;
      const amountTokenMin = isWETHA ? amountBMin : amountAMin;
      const amountETH = isWETHA ? amountA : amountB;
      const amountETHMin = isWETHA ? amountAMin : amountBMin;
      await liq.addLiquidityETH({
        token: tokenAddr,
        amountTokenDesired,
        amountTokenMin,
        amountETHMin,
        deadlineSeconds: 1200n,
        msgValue: amountETH,
      });
    } else {
      await liq.addLiquidity({
        tokenA: tokenAAddr,
        tokenB: tokenBAddr,
        amountADesired: amountA,
        amountBDesired: amountB,
        amountAMin,
        amountBMin,
        deadlineSeconds: 1200n,
      });
    }
  }, [
    networkReady,
    hasAmountA,
    hasAmountB,
    tokenAAddr,
    tokenBAddr,
    chainId,
    isWETHA,
    isWETHPair,
    amountA,
    amountB,
    amountAMin,
    amountBMin,
    liq,
  ]);

  const handleReset = useCallback(() => {
    liq.reset();
    setAmountAStr("");
    setAmountBStr("");
  }, [liq]);

  // Clear amounts after confirmed
  useEffect(() => {
    if (liq.phase === "confirmed") {
      setAmountAStr("");
      setAmountBStr("");
    }
  }, [liq.phase]);

  const explorerUrl = useMemo(
    () =>
      chainId !== null && liq.txHash ? getBlockExplorerTxUrl(chainId, liq.txHash) : null,
    [chainId, liq.txHash],
  );

  // Determine what the main action button should show
  const buttonLabel = useMemo(() => {
    if (approvingA || approvingB) return "Approving…";
    const phase = liq.phase;
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
        if (!hasAmountA || !hasAmountB) return "Enter amounts";
        if (isFirstProvider && (!hasAmountA || !hasAmountB)) return "Enter amounts";
        if (insufficientA) return `Insufficient ${isWETHA ? "ETH" : tokenASymbol}`;
        if (insufficientB) return `Insufficient ${isWETHB ? "ETH" : tokenBSymbol}`;
        if (needsApproveA) return `Approve ${tokenASymbol}`;
        if (needsApproveB) return `Approve ${tokenBSymbol}`;
        return "Add Liquidity";
    }
  }, [
    approvingA,
    approvingB,
    liq.phase,
    networkReady,
    hasAmountA,
    hasAmountB,
    isFirstProvider,
    insufficientA,
    insufficientB,
    isWETHA,
    isWETHB,
    needsApproveA,
    needsApproveB,
    tokenASymbol,
    tokenBSymbol,
  ]);

  const buttonDisabled = useMemo(() => {
    if (approvingA || approvingB) return true;
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
    if (!hasAmountA || !hasAmountB) return true;
    if (insufficientA || insufficientB) return true;
    // NOTE: do NOT disable when needsApproveA/B — the button becomes the
    // "Approve {symbol}" action in that state and must remain clickable.
    if (!tokenAAddr || !tokenBAddr) return true;
    return false;
  }, [
    approvingA,
    approvingB,
    liq.phase,
    networkReady,
    hasAmountA,
    hasAmountB,
    insufficientA,
    insufficientB,
    needsApproveA,
    needsApproveB,
    tokenAAddr,
    tokenBAddr,
  ]);

  const handleAction = useCallback(() => {
    if (needsApproveA) {
      handleApproveA();
    } else if (needsApproveB) {
      handleApproveB();
    } else {
      handleAddLiquidity();
    }
  }, [needsApproveA, needsApproveB, handleApproveA, handleApproveB, handleAddLiquidity]);

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Add Liquidity</h2>
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

      {/* Token A input */}
      <div className="space-y-1 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{isWETHA ? "ETH" : tokenASymbol}</span>
          {!isWETHA && (
            <span>
              Balance: {formatTokenAmount(tokenAMeta.balance, tokenA.decimals)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TokenSelect
            value={tokenASymbol}
            onChange={handleTokenAChange}
            disabledOption={tokenBSymbol}
            chainId={chainId}
          />
          <input
            type="text"
            inputMode="decimal"
            pattern="^[0-9]*[.,]?[0-9]*$"
            placeholder="0.0"
            value={amountAStr}
            onChange={(e) => setAmountAStr(e.target.value)}
            className="flex-1 bg-transparent py-2 text-right text-2xl font-medium outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="flex justify-center py-1">
        <span className="text-xs text-muted-foreground">+</span>
      </div>

      {/* Token B input */}
      <div className="space-y-1 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{isWETHB ? "ETH" : tokenBSymbol}</span>
          {!isWETHB && (
            <span>
              Balance: {formatTokenAmount(tokenBMeta.balance, tokenB.decimals)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TokenSelect
            value={tokenBSymbol}
            onChange={handleTokenBChange}
            disabledOption={tokenASymbol}
            chainId={chainId}
          />
          <input
            type="text"
            inputMode="decimal"
            pattern="^[0-9]*[.,]?[0-9]*$"
            placeholder="0.0"
            value={amountBStr}
            onChange={(e) => setAmountBStr(e.target.value)}
            className="flex-1 bg-transparent py-2 text-right text-2xl font-medium outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* First liquidity provider message */}
      {isFirstProvider && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400">
          First liquidity provider — sets the initial price ratio.
        </div>
      )}

      {/* Optimal ratio guidance */}
      {!isFirstProvider && optimal && hasAmountA && (
        <div className="mt-3 rounded-lg border border-border bg-background/50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Optimal ratio</span>
            <span className="font-medium text-foreground">
              {formatTokenAmountFixed(optimal.amountB, tokenB.decimals, 6)} {tokenBSymbol} per {formatTokenAmountFixed(optimal.amountA, tokenA.decimals, 4)} {tokenASymbol}
            </span>
          </div>
          {deviationBp !== null && deviationBp > slippageBp && (
            <p className="mt-1 text-yellow-600 dark:text-yellow-500">
              {deviationBp > 500 ? "⚠" : "ℹ"} Price deviation: {formatBasisPoints(deviationBp, 2)} — your position may be subject to significant impermanent loss.
            </p>
          )}
        </div>
      )}

      {/* Fee info */}
      {hasAmountA && hasAmountB && (
        <div className="mt-3 flex flex-col gap-1 rounded-lg border border-border bg-background/50 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Fee tier</span>
            <span className="font-medium text-foreground">0.30%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Minimum amounts</span>
            <span className="font-medium text-foreground">
              {formatTokenAmountFixed(amountAMin, tokenA.decimals, 4)} {tokenASymbol} / {formatTokenAmountFixed(amountBMin, tokenB.decimals, 4)} {tokenBSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Active position info */}
      {poolShareBp !== null && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
          <p className="font-medium">Your position: {(poolShareBp / 100).toFixed(2)}% of pool</p>
          <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
            LP tokens: {formatTokenAmount(pair.lpBalance, 18)}
          </p>
        </div>
      )}

      {/* Transaction feedback - error */}
      {liq.error && liq.phase !== "rejected" && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">{liq.error.message}</p>
        </div>
      )}

      {/* Transaction feedback - success */}
      {liq.phase === "confirmed" && liq.txHash && (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
          <p className="font-medium">Liquidity added ✓</p>
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
            Add another position
          </button>
        </div>
      )}

      {/* Main action button */}
      <button
        type="button"
        onClick={handleAction}
        disabled={buttonDisabled}
        className="mt-3 w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
