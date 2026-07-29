"use client";

import { useCallback, useEffect, useState } from "react";
import { Contract, type ContractTransactionReceipt } from "ethers";
import { IERC20_ABI } from "@/lib/contracts/abis";
import { getDeployment } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Provider";
import { decodeError, type ErrorEntry } from "@/lib/errors";

export interface UseTokenResult {
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  balance: bigint | null;
  allowance: bigint | null;
  refresh: () => Promise<void>;
  approve: (spender: `0x${string}`, amount: bigint) => Promise<{ ok: true; receipt: ContractTransactionReceipt } | { ok: false; error: ErrorEntry }>;
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

  const refresh = useCallback(async () => {
    if (!address || !provider) return;
    const readProvider = signer ?? provider;
    const contract = new Contract(address, IERC20_ABI, readProvider);
    try {
      // Resolve the router address for allowance lookup (if on a supported chain).
      const deployment = chainId !== null ? getDeployment(chainId) : null;
      const routerAddr = deployment?.router ?? null;

      const [sym, nam, dec, bal, allow] = await Promise.all([
        contract.symbol().catch(() => null),
        contract.name().catch(() => null),
        contract.decimals().catch(() => null),
        account ? contract.balanceOf(account).catch(() => null) : Promise.resolve(null),
        account && routerAddr
          ? contract.allowance(account, routerAddr).catch(() => null)
          : Promise.resolve(null),
      ]);
      setSymbol(sym as string | null);
      setName(nam as string | null);
      setDecimals(typeof dec === "number" || typeof dec === "bigint" ? Number(dec) : null);
      setBalance(bal !== null && bal !== undefined ? (bal as bigint) : null);
      setAllowance(allow !== null && allow !== undefined ? (allow as bigint) : null);
    } catch {
      // ignore — leave prior values in place
    }
  }, [address, provider, signer, account, chainId]);

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
        const receipt = await tx.wait();
        console.log("[useToken.approve] tx hash:", tx.hash);
        console.log("[useToken.approve] receipt status:", receipt?.status);
        if (!receipt || receipt.status !== 1) {
          console.error("[useToken.approve] receipt failed or absent:", receipt);
          return {
            ok: false as const,
            error: { code: "internal" as const, message: "Approve transaction reverted on-chain" },
          };
        }
        // tx mined successfully — now re-read allowance from chain via fresh provider
        // to avoid stale-read issues with the signer-created Contract instance.
        try {
          const readContract = new Contract(address, IERC20_ABI, provider);
          const confirmedAllowance = await readContract.allowance(account!, spender) as bigint;
          console.log("[useToken.approve] confirmed on-chain allowance:", confirmedAllowance.toString());
          if (confirmedAllowance >= amount) {
            setAllowance(confirmedAllowance);
            return { ok: true as const, receipt };
          }
          // On-chain allowance still too low — the approve did not take effect.
          setAllowance(confirmedAllowance);
          return {
            ok: false as const,
            error: {
              code: "allowance" as const,
              message: `Approve mined but allowance still ${confirmedAllowance} — try again`,
            },
          };
        } catch (verifyErr) {
          console.warn("[useToken.approve] could not verify allowance post-approve:", verifyErr);
          // Last resort: call refresh() which reads from readProvider (signer ?? provider).
          setAllowance(amount);
          return { ok: true as const, receipt };
        }
      } catch (err) {
        console.error("[useToken.approve] error:", err);
        return { ok: false as const, error: decodeError(err) };
      }
    },
    [address, signer],
  );

  return { symbol, name, decimals, balance, allowance, refresh, approve };
}
