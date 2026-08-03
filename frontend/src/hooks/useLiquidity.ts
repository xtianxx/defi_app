"use client";

import { useCallback, useMemo, useState } from "react";
import { Contract, Signature, ZeroAddress, type TransactionReceipt, type TransactionResponse } from "ethers";
import { IERC20_ABI, IUniswapV2Factory_ABI, IUniswapV2Pair_ABI, IUniswapV2Router02_ABI } from "@/lib/contracts/abis";
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

export interface RemoveLiquidityArgs {
  tokenA: `0x${string}`;
  tokenB: `0x${string}`;
  liquidity: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadlineSeconds: bigint;
  /** Sign an EIP-2612 permit instead of sending an approve tx. */
  usePermit?: boolean;
}

export interface RemoveLiquidityETHArgs {
  token: `0x${string}`;
  liquidity: bigint;
  amountTokenMin: bigint;
  amountETHMin: bigint;
  deadlineSeconds: bigint;
  usePermit?: boolean;
}

export interface UseLiquidityResult {
  phase: LiquidityPhase;
  txHash: `0x${string}` | null;
  receipt: TransactionReceipt | null;
  error: { code: ErrorCode; message: string } | null;
  addLiquidity: (args: AddLiquidityArgs) => Promise<void>;
  addLiquidityETH: (args: AddLiquidityETHArgs) => Promise<void>;
  removeLiquidity: (args: RemoveLiquidityArgs) => Promise<void>;
  removeLiquidityETH: (args: RemoveLiquidityETHArgs) => Promise<void>;
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
 * Expected token returns for burning `liquidity` LP tokens.
 * amount = liquidity * reserve / totalSupply (floor). Returns 0n/0n when inputs invalid.
 * `token0`/`tokenA` determine ordering; if tokenA is token0, (amountA,amountB)=(r0,r1) else reversed.
 */
export function estimateRemoval(
  liquidity: bigint,
  totalSupply: bigint,
  reserve0: bigint,
  reserve1: bigint,
  token0: `0x${string}` | null,
  tokenA: `0x${string}` | null,
): { amountA: bigint; amountB: bigint } {
  if (liquidity <= 0n || totalSupply <= 0n) return { amountA: 0n, amountB: 0n };
  const amount0 = (liquidity * reserve0) / totalSupply;
  const amount1 = (liquidity * reserve1) / totalSupply;
  const tokenAIsToken0 = token0 !== null && tokenA !== null && token0.toLowerCase() === tokenA.toLowerCase();
  return tokenAIsToken0 ? { amountA: amount0, amountB: amount1 } : { amountA: amount1, amountB: amount0 };
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

  /**
   * Remove liquidity write flow for a direct token pair via the Router.
   *
   * Phase state machine:
   *   idle → approving? → submitting → mining → confirmed | reverted
   *   any → rejected (user declined signature) | error (revert / gas / rpc)
   *
   * `usePermit` skips the LP approve tx and instead signs an EIP-2612 permit
   * for the pair's LP token, so `removeLiquidityWithPermit` can pull liquidity
   * in a single tx (approveMax = false).
   */
  const removeLiquidity = useCallback(
    async (args: RemoveLiquidityArgs) => {
      const { tokenA, tokenB, liquidity, amountAMin, amountBMin, deadlineSeconds, usePermit } = args;

      // 1. Preconditions.
      if (!signer || !account || chainId === null) {
        setError({ code: "wallet-missing", message: "Wallet not connected" });
        setPhase("error");
        return;
      }
      if (liquidity <= 0n) {
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

      // Shared mining → confirmed | reverted | error tail (identical to addLiquidity).
      // `signer` is narrowed to non-null here (preconditions + network check above);
      // a const arrow keeps that narrowing inside the closure (a hoisted function
      // declaration would not).
      const settleTx = async (tx: TransactionResponse) => {
        setPhase("mining");
        setTxHash(tx.hash as `0x${string}`);

        // Wait for receipt and classify outcome by on-chain state only.
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
      };

      try {
        // 3. Resolve the pair via the factory.
        const factory = new Contract(deployment.factory, IUniswapV2Factory_ABI, signer.provider);
        const pairAddr = (await factory.getPair(tokenA, tokenB)) as `0x${string}`;
        if (pairAddr === ZeroAddress) {
          setError({ code: "pool-empty", message: "Liquidity pool not found for this pair" });
          setPhase("error");
          return;
        }
        const pairContract = new Contract(pairAddr, IUniswapV2Pair_ABI, signer);

        // 4a. Permit path — sign EIP-2612 instead of sending an approve tx.
        if (usePermit) {
          setPhase("approving");
          const nonce = (await pairContract.nonces(account)) as bigint;
          const domain = {
            name: "Uniswap V2",
            version: "1",
            chainId: Number(chainId),
            verifyingContract: pairAddr,
          };
          const types = {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          };
          const value = { owner: account, spender: routerAddr, value: liquidity, nonce, deadline };
          const sig = await signer.signTypedData(domain, types, value);
          const { v, r, s } = Signature.from(sig);

          // 5a. Submit removeLiquidityWithPermit (approveMax = false).
          setPhase("submitting");
          const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
          const tx = await router.removeLiquidityWithPermit(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            account,
            deadline,
            false,
            v,
            r,
            s,
          );
          await settleTx(tx);
        } else {
          // 4b. LP allowance check + approve if needed.
          const allowance = (await pairContract.allowance(account, routerAddr)) as bigint;
          if (allowance < liquidity) {
            setPhase("approving");
            const approveTx = await pairContract.approve(routerAddr, liquidity);
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

          // 5b. Submit removeLiquidity.
          setPhase("submitting");
          const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
          const tx = await router.removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            account,
            deadline,
          );
          await settleTx(tx);
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

  /**
   * Remove ETH liquidity via removeLiquidityETH / removeLiquidityETHWithPermit.
   * Pair is (token, weth); nothing is sent, so no ETH refund handling is needed.
   */
  const removeLiquidityETH = useCallback(
    async (args: RemoveLiquidityETHArgs) => {
      const { token, liquidity, amountTokenMin, amountETHMin, deadlineSeconds, usePermit } = args;

      // 1. Preconditions.
      if (!signer || !account || chainId === null) {
        setError({ code: "wallet-missing", message: "Wallet not connected" });
        setPhase("error");
        return;
      }
      if (liquidity <= 0n) {
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

      // Shared mining → confirmed | reverted | error tail (identical to addLiquidity).
      // Const arrow (not hoisted function declaration) so the `signer` narrowing
      // from the preconditions above is visible inside the closure.
      const settleTx = async (tx: TransactionResponse) => {
        setPhase("mining");
        setTxHash(tx.hash as `0x${string}`);

        // Wait for receipt and classify outcome by on-chain state only.
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
      };

      try {
        // 3. Resolve the (token, weth) pair via the factory.
        const factory = new Contract(deployment.factory, IUniswapV2Factory_ABI, signer.provider);
        const pairAddr = (await factory.getPair(token, deployment.weth)) as `0x${string}`;
        if (pairAddr === ZeroAddress) {
          setError({ code: "pool-empty", message: "Liquidity pool not found for this pair" });
          setPhase("error");
          return;
        }
        const pairContract = new Contract(pairAddr, IUniswapV2Pair_ABI, signer);

        // 4a. Permit path.
        if (usePermit) {
          setPhase("approving");
          const nonce = (await pairContract.nonces(account)) as bigint;
          const domain = {
            name: "Uniswap V2",
            version: "1",
            chainId: Number(chainId),
            verifyingContract: pairAddr,
          };
          const types = {
            Permit: [
              { name: "owner", type: "address" },
              { name: "spender", type: "address" },
              { name: "value", type: "uint256" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          };
          const value = { owner: account, spender: routerAddr, value: liquidity, nonce, deadline };
          const sig = await signer.signTypedData(domain, types, value);
          const { v, r, s } = Signature.from(sig);

          // 5a. Submit removeLiquidityETHWithPermit (approveMax = false).
          setPhase("submitting");
          const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
          const tx = await router.removeLiquidityETHWithPermit(
            token,
            liquidity,
            amountTokenMin,
            amountETHMin,
            account,
            deadline,
            false,
            v,
            r,
            s,
          );
          await settleTx(tx);
        } else {
          // 4b. LP allowance check + approve if needed.
          const allowance = (await pairContract.allowance(account, routerAddr)) as bigint;
          if (allowance < liquidity) {
            setPhase("approving");
            const approveTx = await pairContract.approve(routerAddr, liquidity);
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

          // 5b. Submit removeLiquidityETH.
          setPhase("submitting");
          const router = new Contract(routerAddr, IUniswapV2Router02_ABI, signer);
          const tx = await router.removeLiquidityETH(
            token,
            liquidity,
            amountTokenMin,
            amountETHMin,
            account,
            deadline,
          );
          await settleTx(tx);
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
    () => ({ phase, txHash, receipt, error, addLiquidity, addLiquidityETH, removeLiquidity, removeLiquidityETH, reset }),
    [phase, txHash, receipt, error, addLiquidity, addLiquidityETH, removeLiquidity, removeLiquidityETH, reset],
  );
}
