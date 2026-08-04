"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Contract, type TransactionReceipt } from "ethers";
import { IERC20_ABI, IUniswapV2Router02_ABI } from "@/lib/contracts/abis";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Context";
import { decodeError, type ErrorCode } from "@/lib/errors";
import { waitForReceipt } from "@/lib/tx";
import { usePair, getAmountOut } from "@/hooks/usePair";

export type SwapPhase =
  | "idle"
  | "approving"
  | "submitting"
  | "mining"
  | "confirmed"
  | "reverted"
  | "rejected"
  | "error";

export interface UseSwapResult {
  tokenIn: `0x${string}` | null;
  tokenOut: `0x${string}` | null;
  amountIn: bigint | null;
  amountOutEstimated: bigint | null;
  priceImpactPctBp: number | null;
  feePctBp: number;
  phase: SwapPhase;
  txHash: `0x${string}` | null;
  receipt: TransactionReceipt | null;
  error: { code: ErrorCode; message: string } | null;
  setParams: (
    tokenIn: `0x${string}` | null,
    tokenOut: `0x${string}` | null,
    amountIn: bigint | null,
  ) => void;
  execute: (amountIn: bigint, amountOutMin: bigint, deadlineSeconds: bigint) => Promise<void>;
  reset: () => void;
}

/** Uniswap V2 swap fee in basis points (0.30%). */
const FEE_PCT_BP = 30;

/**
 * Swap write flow for a direct (single-hop) token pair.
 * Spec: contracts/frontend-module-api.md §4.
 *
 * Phase state machine:
 *   idle → approving? → submitting → mining → confirmed | reverted
 *   any → rejected (user declined signature) | error (revert / gas / rpc)
 */
export function useSwap(): UseSwapResult {
  const { signer, account, chainId } = useWeb3Context();

  const [tokenIn, setTokenIn] = useState<`0x${string}` | null>(null);
  const [tokenOut, setTokenOut] = useState<`0x${string}` | null>(null);
  const [amountIn, setAmountIn] = useState<bigint | null>(null);
  const [phase, setPhase] = useState<SwapPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);

  // Tracks the last params passed to setParams. Used to reset prior tx state
  // ONLY when the trade actually changed — NOT on every call (the widget's
  // effect re-fires whenever the `swap` object identity changes, e.g. on every
  // phase transition, and that must not wipe an in-flight or terminal tx).
  const paramsRef = useRef<{
    tin: `0x${string}` | null;
    tout: `0x${string}` | null;
    amtIn: bigint | null;
  } | null>(null);

  // Pull reserves for the chosen pair via usePair; the preview math is pure
  // (getAmountOut) so we don't need a round-trip per keystroke.
  const pair = usePair(tokenIn, tokenOut);

  const { amountOutEstimated, priceImpactPctBp } = useMemo(() => {
    if (!amountIn || amountIn <= 0n || !pair.reserves || !pair.token0 || !tokenIn || !tokenOut) {
      return { amountOutEstimated: null as bigint | null, priceImpactPctBp: null as number | null };
    }
    const tokenInIsToken0 = tokenIn.toLowerCase() === pair.token0.toLowerCase();
    const reserveIn = tokenInIsToken0 ? pair.reserves.reserve0 : pair.reserves.reserve1;
    const reserveOut = tokenInIsToken0 ? pair.reserves.reserve1 : pair.reserves.reserve0;
    const out = getAmountOut(amountIn, reserveIn, reserveOut);
    // Price impact ≈ share of the pool the trade represents, in basis points.
    const total = reserveIn + amountIn;
    const impactBp = total > 0n ? Number((amountIn * 10000n) / total) : 0;
    return { amountOutEstimated: out, priceImpactPctBp: impactBp };
  }, [amountIn, pair.reserves, pair.token0, tokenIn, tokenOut]);

  const setParams = useCallback(
    (tin: `0x${string}` | null, tout: `0x${string}` | null, amtIn: bigint | null) => {
      const prev = paramsRef.current;
      const changed =
        prev === null || prev.tin !== tin || prev.tout !== tout || prev.amtIn !== amtIn;
      paramsRef.current = { tin, tout, amtIn };
      setTokenIn(tin);
      setTokenOut(tout);
      setAmountIn(amtIn);
      if (changed) {
        // A real param change invalidates any prior tx state. (Same-value
        // calls — e.g. the widget effect re-firing on phase transitions —
        // must NOT reset an in-flight or terminal transaction.)
        setPhase("idle");
        setTxHash(null);
        setReceipt(null);
        setError(null);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    paramsRef.current = null;
    setTokenIn(null);
    setTokenOut(null);
    setAmountIn(null);
    setPhase("idle");
    setTxHash(null);
    setReceipt(null);
    setError(null);
  }, []);

  /**
   * Submit the swap for the amount passed by the caller.
   *
   * `amountIn` is a parameter — NOT the hook's internal state — because the
   * hook state is synced from the UI via an effect and can lag the user's
   * current input by a render cycle. Submitting the hook's value risks
   * executing a STALE amount (e.g. the previously typed value).
   */
  const execute = useCallback(
    async (amountIn: bigint, amountOutMin: bigint, deadlineSeconds: bigint) => {
      // 1. Preconditions.
      if (!signer || !account || chainId === null) {
        setError({ code: "wallet-missing", message: "Wallet not connected" });
        setPhase("error");
        return;
      }
      if (!tokenIn || !tokenOut || !amountIn || amountIn <= 0n) {
        setError({ code: "invalid", message: "Invalid swap parameters" });
        setPhase("error");
        return;
      }
      const deployment = getDeployment(chainId);
      if (!isDeploymentConfigured(deployment)) {
        setError({ code: "wrong-network", message: "No deployment for this chain" });
        setPhase("error");
        return;
      }
      const routerAddr = deployment.router;

      // Validate the signer is actually on the expected chain (catches stale
      // chainId or a wallet that silently switched networks since the UI check).
      try {
        const net = await signer.provider.getNetwork();
        if (Number(net.chainId) !== chainId) {
          setError({
            code: "wrong-network",
            message: `Wallet is on chain ${Number(net.chainId)}, expected ${chainId}`,
          });
          setPhase("error");
          return;
        }
      } catch {
        // Network read non-fatal — proceed with optimistic chainId.
      }

      // Clear prior tx state, keep params.
      setTxHash(null);
      setReceipt(null);
      setError(null);

      try {
        // 2. Allowance check + approve if needed.
        const tokenContract = new Contract(tokenIn, IERC20_ABI, signer);
        const allowance = (await tokenContract.allowance(account, routerAddr)) as bigint;
        if (allowance < amountIn) {
          setPhase("approving");
          const approveTx = await tokenContract.approve(routerAddr, amountIn);
          // wait() may throw while the tx was already mined (MetaMask provider
          // flakiness right after the popup closes, esp. on local chains) —
          // the by-hash receipt read is the source of truth.
          const approveReceipt = await waitForReceipt(approveTx, signer.provider);
          if (!approveReceipt || approveReceipt.status !== 1) {
            setReceipt(approveReceipt ?? null);
            if (approveReceipt) {
              setPhase("reverted");
            } else {
              setPhase("error");
              setError({
                code: "rpc",
                message: `Approval submitted but its status could not be confirmed (${approveTx.hash}). Verify it on the explorer before retrying.`,
              });
            }
            return;
          }
        }

        // 3. Submit swap (direct pair — path length 2).
        setPhase("submitting");
        const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
        const swapTx = await router.swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          [tokenIn, tokenOut],
          account,
          BigInt(Math.floor(Date.now() / 1000)) + deadlineSeconds,
        );
        setPhase("mining");
        setTxHash((swapTx as { hash: string }).hash as `0x${string}`);

        // 4. Wait for receipt and classify outcome by on-chain state only.
        const swapReceipt = await waitForReceipt(swapTx, signer.provider);
        setReceipt(swapReceipt ?? null);
        if (swapReceipt && swapReceipt.status === 1) {
          setPhase("confirmed");
          try { await pair.refresh(); } catch { /* non-fatal */ }
        } else if (swapReceipt) {
          // Mined but reverted on-chain — genuine failure.
          setPhase("reverted");
        } else {
          // Not confirmed at all (pending/dropped/RPC unreachable) — never
          // claim failure; the tx may still land. Let the user verify.
          setPhase("error");
          setError({
            code: "rpc",
            message: `Swap submitted but its status could not be confirmed (${swapTx.hash}). It may still be pending — check the explorer before retrying.`,
          });
        }
      } catch (err) {
        const entry = decodeError(err);
        if (entry.code === "user-rejection") {
          setPhase("rejected");
          setError(null);
        } else {
          setPhase("error");
          setError({ code: entry.code, message: entry.message });
        }
      }
    },
    [signer, account, chainId, tokenIn, tokenOut, pair],
  );

  return useMemo(
    () => ({
      tokenIn,
      tokenOut,
      amountIn,
      amountOutEstimated,
      priceImpactPctBp,
      feePctBp: FEE_PCT_BP,
      phase,
      txHash,
      receipt,
      error,
      setParams,
      execute,
      reset,
    }),
    [
      tokenIn,
      tokenOut,
      amountIn,
      amountOutEstimated,
      priceImpactPctBp,
      phase,
      txHash,
      receipt,
      error,
      setParams,
      execute,
      reset,
    ],
  );
}