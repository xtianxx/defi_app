"use client";

import { useCallback, useMemo, useState } from "react";
import { Contract, type ContractTransactionReceipt } from "ethers";
import { IERC20_ABI, IUniswapV2Router02_ABI } from "@/lib/contracts/abis";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Provider";
import { decodeError, type ErrorCode } from "@/lib/errors";
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
  receipt: ContractTransactionReceipt | null;
  error: { code: ErrorCode; message: string } | null;
  setParams: (
    tokenIn: `0x${string}` | null,
    tokenOut: `0x${string}` | null,
    amountIn: bigint | null,
  ) => void;
  execute: (amountOutMin: bigint, deadlineSeconds: bigint) => Promise<void>;
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
  const [receipt, setReceipt] = useState<ContractTransactionReceipt | null>(null);
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);

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
      setTokenIn(tin);
      setTokenOut(tout);
      setAmountIn(amtIn);
      // New params invalidate any prior tx state.
      setPhase("idle");
      setTxHash(null);
      setReceipt(null);
      setError(null);
    },
    [],
  );

  const reset = useCallback(() => {
    setTokenIn(null);
    setTokenOut(null);
    setAmountIn(null);
    setPhase("idle");
    setTxHash(null);
    setReceipt(null);
    setError(null);
  }, []);

  const execute = useCallback(
    async (amountOutMin: bigint, deadlineSeconds: bigint) => {
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
      } catch (_netErr) {
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
          const approveReceipt = await approveTx.wait();
          if (!approveReceipt || approveReceipt.status !== 1) {
            setReceipt(approveReceipt ?? null);
            setPhase("reverted");
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

        // 4. Wait for receipt and classify outcome.
        const swapReceipt = (await swapTx.wait()) as ContractTransactionReceipt | null;
        setReceipt(swapReceipt ?? null);
        if (swapReceipt && swapReceipt.status === 1) {
          setPhase("confirmed");
          try { await pair.refresh(); } catch { /* non-fatal */ }
        } else {
          setPhase("reverted");
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
    [signer, account, chainId, tokenIn, tokenOut, amountIn],
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