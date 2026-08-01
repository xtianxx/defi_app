"use client";

import { useCallback, useMemo, useState } from "react";
import { Contract, type TransactionReceipt } from "ethers";
import { IERC20_ABI, IUniswapV2Router02_ABI } from "@/lib/contracts/abis";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Provider";
import { decodeError, type ErrorCode } from "@/lib/errors";
import { waitForReceipt } from "@/lib/tx";

export type LiquidityPhase =
  | "idle"
  | "approving"
  | "submitting"
  | "mining"
  | "confirmed"
  | "reverted"
  | "rejected"
  | "error";

export interface AddLiquidityArgs {
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadlineSeconds: bigint;
}

export interface AddLiquidityETHArgs {
  token: `0x${string}`;
  amountTokenDesired: bigint;
  amountTokenMin: bigint;
  amountETHMin: bigint;
  deadlineSeconds: bigint;
  msgValue: bigint;
}

export interface UseLiquidityResult {
  phase: LiquidityPhase;
  txHash: `0x${string}` | null;
  receipt: TransactionReceipt | null;
  error: { code: ErrorCode; message: string } | null;
  addLiquidity: (args: AddLiquidityArgs) => Promise<void>;
  addLiquidityETH: (args: AddLiquidityETHArgs) => Promise<void>;
  reset: () => void;
}

/**
 * Estimate the optimal amount of tokenB given tokenA desired and pool reserves.
 * When reserves are zero (first liquidity), returns amountBDesired unchanged.
 */
export function estimateOptimal(
  amountADesired: bigint,
  reserveA: bigint,
  reserveB: bigint,
  amountBDesired: bigint,
): { amountA: bigint; amountB: bigint } {
  if (amountADesired <= 0n) return { amountA: 0n, amountB: 0n };
  if (reserveA <= 0n || reserveB <= 0n) {
    return { amountA: amountADesired, amountB: amountBDesired };
  }
  const amountBOptimal = (amountADesired * reserveB) / reserveA;
  if (amountBOptimal <= amountBDesired) {
    return { amountA: amountADesired, amountB: amountBOptimal };
  }
  const amountAOptimal = (amountBDesired * reserveA) / reserveB;
  return { amountA: amountAOptimal, amountB: amountBDesired };
}

/**
 * Add liquidity write flow for a direct token pair via the Router.
 *
 * Phase state machine:
 *   idle → approving? → submitting → mining → confirmed | reverted
 *   any → rejected (user declined signature) | error (revert / gas / rpc)
 */
export function useLiquidity(): UseLiquidityResult {
  const { signer, account, chainId } = useWeb3Context();

  const [phase, setPhase] = useState<LiquidityPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setTxHash(null);
    setReceipt(null);
    setError(null);
  }, []);

  const addLiquidity = useCallback(
    async (args: AddLiquidityArgs) => {
      const { tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, deadlineSeconds } = args;

      // 1. Preconditions.
      if (!signer || !account || chainId === null) {
        setError({ code: "wallet-missing", message: "Wallet not connected" });
        setPhase("error");
        return;
      }
      if (amountADesired <= 0n || amountBDesired <= 0n) {
        setError({ code: "invalid", message: "Invalid liquidity parameters" });
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

      // 2. Validate signer network.
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

      // Clear prior tx state.
      setTxHash(null);
      setReceipt(null);
      setError(null);

      const deadline = BigInt(Math.floor(Date.now() / 1000)) + deadlineSeconds;

      try {
        // 3. Allowance check + approve for tokenA if needed.
        const tokenAContract = new Contract(tokenA, IERC20_ABI, signer);
        const allowanceA = (await tokenAContract.allowance(account, routerAddr)) as bigint;
        if (allowanceA < amountADesired) {
          setPhase("approving");
          const approveTxA = await tokenAContract.approve(routerAddr, amountADesired);
          const approveReceiptA = await waitForReceipt(approveTxA, signer.provider);
          if (!approveReceiptA || approveReceiptA.status !== 1) {
            setReceipt(approveReceiptA ?? null);
            if (approveReceiptA) {
              setPhase("reverted");
            } else {
              setPhase("error");
              setError({
                code: "rpc",
                message: `Approval submitted but its status could not be confirmed (${approveTxA.hash}). Verify it on the explorer before retrying.`,
              });
            }
            return;
          }
        }

        // 4. Allowance check + approve for tokenB if needed.
        const tokenBContract = new Contract(tokenB, IERC20_ABI, signer);
        const allowanceB = (await tokenBContract.allowance(account, routerAddr)) as bigint;
        if (allowanceB < amountBDesired) {
          setPhase("approving");
          const approveTxB = await tokenBContract.approve(routerAddr, amountBDesired);
          const approveReceiptB = await waitForReceipt(approveTxB, signer.provider);
          if (!approveReceiptB || approveReceiptB.status !== 1) {
            setReceipt(approveReceiptB ?? null);
            if (approveReceiptB) {
              setPhase("reverted");
            } else {
              setPhase("error");
              setError({
                code: "rpc",
                message: `Approval submitted but its status could not be confirmed (${approveTxB.hash}). Verify it on the explorer before retrying.`,
              });
            }
            return;
          }
        }

        // 5. Submit addLiquidity.
        setPhase("submitting");
        const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
        const tx = await router.addLiquidity(
          tokenA,
          tokenB,
          amountADesired,
          amountBDesired,
          amountAMin,
          amountBMin,
          account,
          deadline,
        );
        setPhase("mining");
        setTxHash((tx as { hash: string }).hash as `0x${string}`);

        // 6. Wait for receipt and classify outcome by on-chain state only.
        const liqReceipt = await waitForReceipt(tx, signer.provider);
        setReceipt(liqReceipt ?? null);
        if (liqReceipt && liqReceipt.status === 1) {
          setPhase("confirmed");
        } else if (liqReceipt) {
          // Mined but reverted on-chain — genuine failure.
          setPhase("reverted");
        } else {
          // Not confirmed at all (pending/dropped/RPC unreachable) — never
          // claim failure; the tx may still land. Let the user verify.
          setPhase("error");
          setError({
            code: "rpc",
            message: `Transaction submitted but its status could not be confirmed (${tx.hash}). It may still be pending — check the explorer before retrying.`,
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
    [signer, account, chainId],
  );

  const addLiquidityETH = useCallback(
    async (args: AddLiquidityETHArgs) => {
      const { token, amountTokenDesired, amountTokenMin, amountETHMin, deadlineSeconds, msgValue } = args;

      // 1. Preconditions.
      if (!signer || !account || chainId === null) {
        setError({ code: "wallet-missing", message: "Wallet not connected" });
        setPhase("error");
        return;
      }
      if (amountTokenDesired <= 0n || msgValue <= 0n) {
        setError({ code: "invalid", message: "Invalid liquidity parameters" });
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

      // 2. Validate signer network.
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
        // Non-fatal.
      }

      // Clear prior tx state.
      setTxHash(null);
      setReceipt(null);
      setError(null);

      const deadline = BigInt(Math.floor(Date.now() / 1000)) + deadlineSeconds;

      try {
        // 3. Allowance check + approve for the ERC20 token.
        const tokenContract = new Contract(token, IERC20_ABI, signer);
        const allowance = (await tokenContract.allowance(account, routerAddr)) as bigint;
        if (allowance < amountTokenDesired) {
          setPhase("approving");
          const approveTx = await tokenContract.approve(routerAddr, amountTokenDesired);
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

        // 4. Submit addLiquidityETH with msg.value.
        setPhase("submitting");
        const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
        const tx = await router.addLiquidityETH(
          token,
          amountTokenDesired,
          amountTokenMin,
          amountETHMin,
          account,
          deadline,
          { value: msgValue },
        );
        setPhase("mining");
        setTxHash((tx as { hash: string }).hash as `0x${string}`);

        // 5. Wait for receipt and classify outcome by on-chain state only.
        const liqReceipt = await waitForReceipt(tx, signer.provider);
        setReceipt(liqReceipt ?? null);
        if (liqReceipt && liqReceipt.status === 1) {
          setPhase("confirmed");
        } else if (liqReceipt) {
          // Mined but reverted on-chain — genuine failure.
          setPhase("reverted");
        } else {
          // Not confirmed at all (pending/dropped/RPC unreachable) — never
          // claim failure; the tx may still land. Let the user verify.
          setPhase("error");
          setError({
            code: "rpc",
            message: `Transaction submitted but its status could not be confirmed (${tx.hash}). It may still be pending — check the explorer before retrying.`,
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
    [signer, account, chainId],
  );

  return useMemo(
    () => ({ phase, txHash, receipt, error, addLiquidity, addLiquidityETH, reset }),
    [phase, txHash, receipt, error, addLiquidity, addLiquidityETH, reset],
  );
}
