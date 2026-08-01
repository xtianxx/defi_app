// RPC provider factories. Server-side reads use JsonRpcProvider (no signer),
// client-side writes use BrowserProvider wrapping window.ethereum.
// Spec: frontend-module-api.md §1, research.md R0.5.

import { BrowserProvider, JsonRpcProvider, FallbackProvider } from "ethers";
import { CHAINS } from "./chains";

export function createServerProvider(chainId: number): JsonRpcProvider {
  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chainId ${chainId} for server provider`);
  }
  return new JsonRpcProvider(chain.rpcUrl, chainId, { staticNetwork: true });
}

export function createClientProvider(): BrowserProvider | null {
  if (typeof window === "undefined") return null;
  const ethereum = (window as unknown as { ethereum?: { request: (...args: unknown[]) => Promise<unknown> } })
    .ethereum;
  if (!ethereum) return null;
  return new BrowserProvider(ethereum.request.bind(ethereum) as never, "any");
}

export function createFallbackProvider(rpcUrls: string[], chainId: number): FallbackProvider {
  if (rpcUrls.length === 0) {
    throw new Error("createFallbackProvider requires at least one RPC URL");
  }
  const providers = rpcUrls.map(
    (url) => new JsonRpcProvider(url, chainId, { staticNetwork: true }),
  );
  return new FallbackProvider(providers, chainId);
}
