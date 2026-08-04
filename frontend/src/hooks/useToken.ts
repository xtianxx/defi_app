"use client";

import { useCallback, useEffect, useState } from "react";
import { Contract, type TransactionReceipt } from "ethers";
import { IERC20_ABI } from "@/lib/contracts/abis";
import { getDeployment } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Context";
import { decodeError, type ErrorEntry } from "@/lib/errors";
import { waitForReceipt } from "@/lib/tx";

export interface UseTokenResult {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  balance: bigint | null;
  allowance: bigint | null;
  refresh: (opts?: { allowanceAtLeast?: bigint }) => Promise<void>;
  approve: (spender: `0x${string}`, amount: bigint) => Promise<{ ok: true; receipt: TransactionReceipt } | { ok: false; error: ErrorEntry }>;
}

/**
 * Read ERC-20 metadata + balance + allowance for the connected account.
 * Spec: contracts/frontend-module-api.md §2.
 */
export function useToken(address: `0x${string}` | null | undefined): UseTokenResult {
  const { provider, signer, account, chainId } = useWeb3Context();
  const [symbol, setSymbol] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);

  /**
   * Re-read token metadata, balance and allowance.
   *
   * Pass `{ allowanceAtLeast }` when the caller knows the on-chain allowance
   * should be at least that value (e.g. right after an approve). Wallet
   * providers can serve a stale pre-tx read right after a mined tx (esp. on
   * local chains), so the allowance leg retries briefly; if it still reads
   * below the hint, the stale value is NOT written over the fresher state.
   */
  const refresh = useCallback(
    async (opts?: { allowanceAtLeast?: bigint }) => {
      if (!address || !provider) return;
      const readProvider = signer ?? provider;
      const contract = new Contract(address, IERC20_ABI, readProvider);
      try {
        // Resolve the router address for allowance lookup (if on a supported chain).
        const deployment = chainId !== null ? getDeployment(chainId) : null;
        const routerAddr = deployment?.router ?? null;

        const [sym, nam, dec, bal] = await Promise.all([
          contract.symbol().catch(() => null),
          contract.name().catch(() => null),
          contract.decimals().catch(() => null),
          account ? contract.balanceOf(account).catch(() => null) : Promise.resolve(null),
        ]);
        setSymbol(sym as string | null);
        setName(nam as string | null);
        setDecimals(typeof dec === "number" || typeof dec === "bigint" ? Number(dec) : null);
        setBalance(bal !== null && bal !== undefined ? (bal as bigint) : null);

        if (account && routerAddr) {
          let allow: unknown = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              allow = await contract.allowance(account, routerAddr);
              const ok =
                opts?.allowanceAtLeast === undefined ||
                (allow as bigint) >= opts.allowanceAtLeast;
              if (ok) break;
            } catch (readErr) {
              console.warn("[useToken.refresh] allowance read failed:", readErr);
            }
            if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 400));
          }
          const finalAllow = allow as bigint | null;
          const staleBelowHint =
            opts?.allowanceAtLeast !== undefined &&
            finalAllow !== null &&
            finalAllow < opts.allowanceAtLeast;
          if (finalAllow !== null && !staleBelowHint) {
            setAllowance(finalAllow);
          }
        }
      } catch {
        // ignore — leave prior values in place
      }
    },
    [address, provider, signer, account, chainId],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const approve = useCallback(
    async (spender: `0x${string}`, amount: bigint) => {
      if (!address || !signer) {
        return { ok: false as const, error: { code: "wallet-missing" as const, message: "Wallet not connected" } };
      }
      const contract = new Contract(address, IERC20_ABI, signer);
      try {
        const tx = await contract.approve(spender, amount);
        // wait() can throw even though the tx was mined (MetaMask provider
        // flakiness right after the popup closes, esp. on local chains) — the
        // receipt read by hash is the source of truth, not wait() itself.
        const receipt = await waitForReceipt(tx, signer.provider);
        console.log("[useToken.approve] tx hash:", tx.hash);
        console.log("[useToken.approve] receipt status:", receipt?.status);
        if (!receipt || receipt.status !== 1) {
          console.error("[useToken.approve] receipt failed or absent:", receipt);
          return {
            ok: false as const,
            error: receipt
              ? { code: "internal" as const, message: "Approve transaction reverted on-chain" }
              : {
                  code: "rpc" as const,
                  message: `Approval submitted but its status could not be confirmed (${tx.hash}). Verify it on the explorer before retrying.`,
                },
          };
        }
        // Tx mined with status 1 — the approve is authoritative on-chain; a
        // successful approve() writes the allowance by definition. Re-read the
        // allowance to refresh UI state, but wallet providers can serve a stale
        // read right after the tx (esp. on local chains), so retry briefly and
        // NEVER treat a stale read as an approve failure.
        let confirmedAllowance: bigint | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const readContract = new Contract(address, IERC20_ABI, provider);
            confirmedAllowance = (await readContract.allowance(account!, spender)) as bigint;
            if (confirmedAllowance >= amount) break;
          } catch (readErr) {
            console.warn("[useToken.approve] allowance read failed:", readErr);
          }
          if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 400));
        }
        console.log(
          "[useToken.approve] confirmed on-chain allowance:",
          confirmedAllowance?.toString() ?? "unreadable",
        );
        if (confirmedAllowance !== null && confirmedAllowance >= amount) {
          setAllowance(confirmedAllowance);
        } else {
          // Read is stale or failed — trust the mined receipt instead of
          // wrongly reporting the approve as failed.
          console.warn("[useToken.approve] allowance read did not reflect the mined approve — trusting receipt");
          setAllowance(amount);
        }
        return { ok: true as const, receipt };
      } catch (err) {
        console.error("[useToken.approve] error:", err);
        return { ok: false as const, error: decodeError(err) };
      }
    },
    [address, signer, provider, account],
  );

  return { symbol, name, decimals, balance, allowance, refresh, approve };
}
