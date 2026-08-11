"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits } from "ethers";
import { useFaucet } from "@/hooks/useFaucet";
import { useWeb3Context } from "@/providers/Web3Context";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { getBlockExplorerTxUrl, isSupportedChain } from "@/lib/chains";
import { DEMO_ACCOUNTS } from "@/lib/demoAccounts";
import type { Deployment } from "@/lib/contracts/addresses";

interface FaucetWidgetProps {
  deployment: Deployment | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

function formatGrantAmount(amount: string, decimals: number): string {
  try {
    const value = BigInt(amount);
    const full = formatUnits(value, decimals);
    return full.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  } catch {
    return amount;
  }
}

function formatCountdown(nextEligibleTime: bigint, nowSeconds: number): string {
  const remaining = Math.max(0, Number(nextEligibleTime - BigInt(nowSeconds)));
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  return `下次可领取: ${hours}h ${minutes}m 后`;
}

export function FaucetWidget({ deployment }: FaucetWidgetProps) {
  const { account, chainId } = useWeb3Context();
  const faucet = useFaucet();
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const faucetAddress = deployment?.faucet ?? null;
  const isDeployed = deployment !== null && faucetAddress !== ZERO_ADDRESS;
  const supported = isSupportedChain(chainId);

  const eligible =
    faucet.nextEligibleTime === null ||
    faucet.nextEligibleTime <= BigInt(nowSeconds);

  const busy = faucet.phase === "claiming" || faucet.phase === "mining";

  const explorerUrl = useMemo(
    () =>
      chainId !== null && faucet.txHash
        ? getBlockExplorerTxUrl(chainId, faucet.txHash)
        : null,
    [chainId, faucet.txHash],
  );

  const handleClaim = useCallback(async () => {
    if (busy || !eligible) return;
    await faucet.claim();
  }, [busy, eligible, faucet]);

  const buttonLabel = useMemo(() => {
    switch (faucet.phase) {
      case "claiming":
        return "Claiming…";
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
        return "Claim";
    }
  }, [faucet.phase]);

  const claimDisabled = !eligible || busy || faucet.phase === "confirmed";

  return (
    <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Faucet</h2>
        <p className="text-sm text-muted-foreground">
          Request demo tokens once every 24 hours.
        </p>
      </div>

      {!account && (
        <div className="min-w-0 space-y-3 rounded-xl border border-border bg-secondary/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Connect your wallet to request demo tokens.
          </p>
          <ConnectButton />
        </div>
      )}

      {account && !supported && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="break-words font-medium">
            请切换到支持的网络 (Sepolia 11155111 或本地 Anvil 31337)
          </p>
          <p className="mt-1 break-words text-destructive/80">
            Use your wallet&apos;s network switcher to select Sepolia or Anvil
            (local).
          </p>
        </div>
      )}

      {account && supported && !isDeployed && (
        <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Faucet not deployed for this chain.
        </div>
      )}

      {account && supported && isDeployed && (
        <>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="min-w-0 px-3 py-2 text-left font-medium text-muted-foreground">
                    Token
                  </th>
                  <th className="min-w-0 px-3 py-2 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {faucet.grantAmounts.map(
                  (grant: { symbol: string; amount: string; decimals: number }) => (
                    <tr key={grant.symbol}>
                      <td className="min-w-0 px-3 py-2 font-medium">{grant.symbol}</td>
                      <td className="min-w-0 break-words px-3 py-2 text-right tabular-nums">
                        {formatGrantAmount(grant.amount, grant.decimals)}{" "}
                        {grant.symbol}
                      </td>
                    </tr>
                  ),
                )}
                {faucet.grantAmounts.length === 0 && (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-3 py-3 text-center text-muted-foreground"
                    >
                      No grants configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!eligible && faucet.nextEligibleTime !== null && (
            <p className="mt-3 text-center text-sm font-medium text-muted-foreground">
              {formatCountdown(faucet.nextEligibleTime, nowSeconds)}
            </p>
          )}

          {faucet.phase === "rejected" && (
            <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
              您已取消签名
            </div>
          )}

          {(faucet.phase === "reverted" || faucet.phase === "error") &&
            faucet.error && (
              <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <p className="font-medium">{faucet.error.message}</p>
                {faucet.error.code === "insufficient-funds" ? (
                  <div className="mt-2 space-y-3">
                    <p className="text-destructive/80">
                      水龙头只发放代币，不发 ETH。请导入下方演示账户（已含 gas ETH）继续演示：
                    </p>
                    {DEMO_ACCOUNTS.map((acc) => (
                      <div
                        key={acc.label}
                        className="rounded-md border border-destructive/20 bg-background/60 p-2.5 text-xs"
                      >
                        <p className="font-semibold text-destructive">{acc.label}</p>
                        <p className="mt-1 break-all text-destructive/80">
                          <span className="font-medium">地址: </span>
                          {acc.address}
                        </p>
                        <p className="mt-0.5 break-all text-destructive/80">
                          <span className="font-medium">私钥: </span>
                          {acc.privateKey}
                        </p>
                      </div>
                    ))}
                    <p className="text-xs text-destructive/70">
                      MetaMask: 添加账户 → 导入账户 → 粘贴私钥。测试网私钥无真实价值。
                    </p>
                  </div>
                ) : (
                  (faucet.error as { hint?: string } | null)?.hint && (
                    <p className="mt-1 text-destructive/80">
                      {(faucet.error as { hint?: string } | null)?.hint}
                    </p>
                  )
                )}
              </div>
            )}

          {faucet.phase === "confirmed" && faucet.txHash && (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              <p className="font-medium">Tokens claimed ✓</p>
              <p className="mt-0.5 text-xs text-green-600 dark:text-green-500">
                Your demo tokens should arrive within a few seconds.
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
                <p className="mt-1 break-all">{faucet.txHash}</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleClaim}
            disabled={claimDisabled}
            className="mt-3 w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {buttonLabel}
          </button>
        </>
      )}
    </div>
  );
}
