"use client";

import { createContext, useContext } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import { isSupportedChain, type ChainConfig } from "@/lib/chains";

export type Web3Status = "idle" | "connecting" | "ready" | "error";

export interface Web3ContextValue {
  status: Web3Status;
  account: `0x${string}` | null;
  chainId: number | null;
  chain: ChainConfig | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  error: { code: string; message: string } | null;
  connect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const noop = () => {};

export const Web3Context = createContext<Web3ContextValue | null>(null);

export function useWeb3Context(): Web3ContextValue {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    // Return a no-op default so SSR doesn't crash; components that need the
    // real context should be wrapped in Web3Provider.
    return {
      status: "idle",
      account: null,
      chainId: null,
      chain: null,
      provider: null,
      signer: null,
      error: null,
      connect: async () => noop(),
      switchChain: async () => noop(),
      disconnect: async () => noop(),
    };
  }
  return ctx;
}

export function useIsSupportedChain(): boolean {
  const { chainId } = useWeb3Context();
  return isSupportedChain(chainId);
}