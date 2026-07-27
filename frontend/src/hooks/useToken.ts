"use client";

import { useCallback, useEffect, useState } from "react";
import { Contract, type ContractTransactionReceipt } from "ethers";
import { IERC20_ABI } from "@/lib/contracts/abis";
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
  const { provider, signer, account } = useWeb3Context();
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
    } catch {
      // ignore — leave prior values in place
    }
  }, [address, provider, signer, account]);

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
        if (receipt) setAllowance(amount);
        return { ok: true as const, receipt };
      } catch (err) {
        return { ok: false as const, error: decodeError(err) };
      }
    },
    [address, signer],
  );

  return { symbol, name, decimals, balance, allowance, refresh, approve };
}
