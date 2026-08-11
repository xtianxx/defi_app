"use client";

import { useWeb3Context } from "@/providers/Web3Context";
import { isSupportedChain } from "@/lib/chains";

/**
 * Wrong-network banner for connected wallets on unsupported chains.
 *
 * Spec: specs/002-sepolia-vercel-deploy/contracts/frontend-module-api.md §6
 * (FR-003 / US1-4). Mirrors the banner in FaucetWidget.
 */
export function WrongNetworkBanner() {
  const { account, chainId } = useWeb3Context();

  // Let ConnectButton / widget connect prompts handle the disconnected state.
  if (!account || isSupportedChain(chainId)) {
    return null;
  }

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <p className="font-medium">请切换到 Sepolia 测试网</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-destructive/80">
        <li>网络名称 (Network name): Sepolia</li>
        <li>链 ID (Chain ID): 11155111</li>
        <li className="break-all">RPC URL: https://ethereum-sepolia-rpc.publicnode.com</li>
        <li className="break-all">浏览器 (Explorer): https://sepolia.etherscan.io</li>
      </ul>
      <p className="mt-2 text-xs text-destructive/70">
        Use MetaMask&apos;s network switcher or add a custom network with the
        settings above.
      </p>
    </div>
  );
}
