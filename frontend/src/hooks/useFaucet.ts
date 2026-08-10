"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Contract } from "ethers";
import { DemoFaucet_ABI } from "@/lib/contracts/abis";
import { getDeployment, isDeploymentConfigured } from "@/lib/contracts/addresses";
import { useWeb3Context } from "@/providers/Web3Context";
import { decodeError, type ErrorCode } from "@/lib/errors";
import { waitForReceipt } from "@/lib/tx";

export type FaucetPhase =
  | "idle"
  | "claiming"
  | "mining"
  | "confirmed"
  | "reverted"
  | "rejected"
  | "error";

export interface UseFaucetResult {
  phase: FaucetPhase;
  txHash: `0x${string}` | null;
  error: { code: ErrorCode; message: string } | null;
  nextEligibleTime: bigint | null; // contract view; null when never requested (view returns 0)
  grantAmounts: { symbol: string; amount: string; decimals: number }[]; // raw decimal strings from contract constants
  claim: () => Promise<void>;
  reset: () => void;
}

interface FaucetGrant {
  symbol: string;
  amount: string;
  decimals: number;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Deterministic fallback — matches the DemoFaucet constants (WETH 0.1e18, USDC
// 200e6, DAI 200e18, WBTC 1_000_000). Used until the on-chain views are read.
const GRANT_DEFAULTS: FaucetGrant[] = [
  { symbol: "WETH", amount: "100000000000000000", decimals: 18 },
  { symbol: "USDC", amount: "200000000", decimals: 6 },
  { symbol: "DAI", amount: "200000000000000000000", decimals: 18 },
  { symbol: "WBTC", amount: "1000000", decimals: 8 },
];

/** Human-readable local time ("YYYY-MM-DD HH:mm") for the rate-limit countdown message. */
function formatNextEligibleTime(ts: bigint | null): string {
  if (ts === null || ts <= 0n) return "—";
  const d = new Date(Number(ts) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Faucet claim flow for the /faucet page.
 * Spec: specs/002-sepolia-vercel-deploy/contracts/frontend-module-api.md §5.
 *
 * Phase state machine (mirrors useSwap):
 *   idle → claiming → mining → confirmed | reverted
 *   any → rejected (user declined signature) | error (revert / gas / rpc)
 */
export function useFaucet(): UseFaucetResult {
  const { signer, account, chainId, provider: contextProvider } = useWeb3Context();

  const [phase, setPhase] = useState<FaucetPhase>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const [nextEligibleTime, setNextEligibleTime] = useState<bigint | null>(null);
  const [grantAmounts, setGrantAmounts] = useState<FaucetGrant[]>(GRANT_DEFAULTS);

  /**
   * Read the wallet's eligibility timestamp. Non-fatal: any failure (or not
   * connected / faucet not deployed) → null ("never requested / eligible now").
   */
  const readNextEligibleTime = useCallback(async () => {
    const provider = signer?.provider ?? contextProvider;
    if (!provider || !account || chainId === null) {
      setNextEligibleTime(null);
      return;
    }
    const deployment = getDeployment(chainId);
    if (!deployment || deployment.faucet === ZERO_ADDRESS) {
      setNextEligibleTime(null);
      return;
    }
    try {
      const faucet = new Contract(deployment.faucet, DemoFaucet_ABI, provider);
      const ts = (await faucet.nextEligibleTime(account)) as bigint;
      // View returns 0 for never-requested wallets → eligible now.
      setNextEligibleTime(ts ? ts : null);
    } catch {
      setNextEligibleTime(null);
    }
  }, [signer, account, chainId, contextProvider]);

  // Re-read whenever the wallet/chain changes.
  useEffect(() => {
    void readNextEligibleTime();
  }, [readNextEligibleTime]);

  /**
   * Read the four grant constants for the grant table. Uses the signer's
   * provider (or the context BrowserProvider) so the table renders even when
   * the faucet is view-only; falls back to the static defaults on any failure.
   */
  useEffect(() => {
    const provider = signer?.provider ?? contextProvider;
    if (!provider || chainId === null) {
      setGrantAmounts(GRANT_DEFAULTS);
      return;
    }
    const deployment = getDeployment(chainId);
    if (!deployment || deployment.faucet === ZERO_ADDRESS) {
      setGrantAmounts(GRANT_DEFAULTS);
      return;
    }
    let cancelled = false;
    const faucet = new Contract(deployment.faucet, DemoFaucet_ABI, provider);
    void Promise.all([
      faucet.WETH_AMOUNT(),
      faucet.USDC_AMOUNT(),
      faucet.DAI_AMOUNT(),
      faucet.WBTC_AMOUNT(),
    ])
      .then(([wethAmt, usdcAmt, daiAmt, wbtcAmt]) => {
        if (cancelled) return;
        setGrantAmounts([
          { symbol: "WETH", amount: (wethAmt as bigint).toString(), decimals: 18 },
          { symbol: "USDC", amount: (usdcAmt as bigint).toString(), decimals: 6 },
          { symbol: "DAI", amount: (daiAmt as bigint).toString(), decimals: 18 },
          { symbol: "WBTC", amount: (wbtcAmt as bigint).toString(), decimals: 8 },
        ]);
      })
      .catch(() => {
        if (!cancelled) setGrantAmounts(GRANT_DEFAULTS);
      });
    return () => {
      cancelled = true;
    };
  }, [signer, chainId, contextProvider]);

  const claim = useCallback(async () => {
    // 1. Wallet preconditions.
    if (!signer || !account || chainId === null) {
      setError({ code: "wallet-missing", message: "Wallet not connected" });
      setPhase("error");
      return;
    }

    // 2. Deployment gate — the faucet must exist on this chain.
    const deployment = getDeployment(chainId);
    if (!deployment || !isDeploymentConfigured(deployment) || deployment.faucet === ZERO_ADDRESS) {
      setError({ code: "invalid", message: "Faucet not deployed for this chain" });
      setPhase("error");
      return;
    }

    // 3. Validate the signer is actually on the expected chain (catches stale
    //    chainId or a wallet that silently switched networks since the UI check).
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
    setError(null);

    try {
      const faucet = new Contract(deployment.faucet, DemoFaucet_ABI, signer);
      setPhase("claiming");
      const tx = await faucet.request();
      setPhase("mining");
      setTxHash((tx as { hash: string }).hash as `0x${string}`);

      // The on-chain receipt is the source of truth (mirrors useSwap).
      const receipt = await waitForReceipt(tx, signer.provider);
      if (receipt && receipt.status === 1) {
        setPhase("confirmed");
        void readNextEligibleTime();
      } else if (receipt) {
        // Mined but reverted on-chain — genuine failure.
        setPhase("reverted");
      } else {
        // Not confirmed at all (pending/dropped/RPC unreachable) — never claim
        // failure; the tx may still land.
        setPhase("error");
        setError({
          code: "rpc",
          message: `Claim submitted but its status could not be confirmed (${(tx as { hash: string }).hash}). It may still be pending — check the explorer before retrying.`,
        });
      }
    } catch (err) {
      const entry = decodeError(err);
      if (entry.code === "user-rejection") {
        setPhase("rejected");
        setError(null);
        return;
      }
      // DemoFaucet string reverts are not in STRING_REVERTS, so they surface as
      // code "internal" with the raw reason — map them to the user-facing text.
      let message = entry.message;
      if (message.includes("rate limited")) {
        message = `本钱包 24 小时内已领取过 — 下次可领取时间: ${formatNextEligibleTime(nextEligibleTime)}`;
      } else if (message.includes("weth reserve empty")) {
        message = "WETH 储备不足，请联系演示者补充";
      }
      setPhase("error");
      setError({ code: entry.code, message });
    }
  }, [signer, account, chainId, nextEligibleTime, readNextEligibleTime]);

  const reset = useCallback(() => {
    setPhase("idle");
    setTxHash(null);
    setError(null);
    // nextEligibleTime / grantAmounts are view-backed state — intentionally kept.
  }, []);

  return useMemo(
    () => ({
      phase,
      txHash,
      error,
      nextEligibleTime,
      grantAmounts,
      claim,
      reset,
    }),
    [phase, txHash, error, nextEligibleTime, grantAmounts, claim, reset],
  );
}
