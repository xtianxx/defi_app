// RPC provider factories. Server-side reads use JsonRpcProvider (no signer),
// client-side writes use BrowserProvider wrapping window.ethereum.
// Spec: frontend-module-api.md §1, research.md R0.5.

import { BrowserProvider, JsonRpcProvider, FallbackProvider } from "ethers";
import { ANVIL_CHAIN_ID, CHAINS, SEPOLIA_CHAIN_ID } from "./chains";

export function createServerProvider(chainId: number = ANVIL_CHAIN_ID): JsonRpcProvider {
  const chain = CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chainId ${chainId} for server provider`);
  }
  // Sepolia's static rpcUrl is empty (R0.2) — resolve the URL from the env var
  // INSIDE the function body: server-only, never at module top level, never in
  // client-imported code (frontend-module-api.md §2).
  const rpcUrl = chainId === SEPOLIA_CHAIN_ID ? process.env.SEPOLIA_RPC_URL : chain.rpcUrl;
  if (!rpcUrl) {
    throw new Error("SEPOLIA_RPC_URL not configured");
  }
  return new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
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
