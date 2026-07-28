"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner, type Eip1193Provider } from "ethers";
import { CHAINS, isSupportedChain, type ChainConfig } from "@/lib/chains";
import { decodeError } from "@/lib/errors";

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
  disconnect: () => void;
}

const noop = () => {};
const Web3Context = createContext<Web3ContextValue | null>(null);

interface EthereumRequestArgs {
  method: string;
  params?: unknown[];
}

type EthereumProvider = Eip1193Provider & {
  request: (args: EthereumRequestArgs) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getInjectedEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { ethereum?: EthereumProvider };
  return w.ethereum ?? null;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Web3Status>("idle");
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const handlersRef = useRef<{
    accountsChanged?: (accounts: string[]) => void;
    chainChanged?: (chainHex: string) => void;
    disconnect?: (err: unknown) => void;
  }>({});

  const chain = useMemo(() => (chainId !== null ? CHAINS[chainId] ?? null : null), [chainId]);

  // Wire EIP-1193 event listeners exactly once per injected provider.
  useEffect(() => {
    const ethereum = getInjectedEthereum();
    if (!ethereum || !ethereum.on) return;

    const onAccountsChanged = async (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (list.length === 0) {
        // Disconnected
        setAccount(null);
        setSigner(null);
        setProvider(null);
        setStatus("idle");
        return;
      }
      // Account switched — rebuild provider + signer for the new account.
      // Without this, provider/signer stay stale and all hooks read null state.
      const newAccount = list[0] as `0x${string}`;
      const ethereum = getInjectedEthereum();
      if (!ethereum) {
        setAccount(newAccount);
        return;
      }
      try {
        const browserProvider = new BrowserProvider(ethereum as never, "any");
        const newSigner = await browserProvider.getSigner();
        const net = await browserProvider.getNetwork();
        setProvider(browserProvider);
        setSigner(newSigner);
        setAccount(newAccount);
        setChainId(Number(net.chainId));
        setStatus("ready");
      } catch (err) {
        const entry = decodeError(err);
        setError({ code: entry.code, message: entry.message });
        setStatus("error");
      }
    };
    const onChainChanged = (chainHex: unknown) => {
      if (typeof chainHex === "string") {
        const parsed = Number.parseInt(chainHex, 16);
        if (Number.isFinite(parsed)) setChainId(parsed);
      }
      if (typeof window !== "undefined") window.location.reload();
    };
    const onDisconnect = (_err: unknown) => {
      setAccount(null);
      setSigner(null);
      setProvider(null);
      setStatus("idle");
    };
    handlersRef.current = { accountsChanged: onAccountsChanged, chainChanged: onChainChanged, disconnect: onDisconnect };

    ethereum.on("accountsChanged", onAccountsChanged as never);
    ethereum.on("chainChanged", onChainChanged as never);
    ethereum.on("disconnect", onDisconnect as never);

    return () => {
      if (!ethereum.removeListener) return;
      ethereum.removeListener("accountsChanged", onAccountsChanged as never);
      ethereum.removeListener("chainChanged", onChainChanged as never);
      ethereum.removeListener("disconnect", onDisconnect as never);
    };
  }, []);

  const connect = async () => {
    const ethereum = getInjectedEthereum();
    if (!ethereum) {
      setError({ code: "wallet-missing", message: "No wallet detected" });
      setStatus("error");
      return;
    }
    setStatus("connecting");
    setError(null);
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from wallet");
      }
      const browserProvider = new BrowserProvider(ethereum as never, "any");
      setProvider(browserProvider);
      const newSigner = await browserProvider.getSigner();
      setSigner(newSigner);
      setAccount(accounts[0] as `0x${string}`);
      const net = await browserProvider.getNetwork();
      setChainId(Number(net.chainId));
      setStatus("ready");
    } catch (err) {
      const entry = decodeError(err);
      setError({ code: entry.code, message: entry.message });
      setStatus("error");
    }
  };

  const switchChain = async (targetChainId: number) => {
    const ethereum = getInjectedEthereum();
    if (!ethereum) {
      const entry = decodeError(new Error("No wallet detected"));
      setError({ code: entry.code, message: entry.message });
      return;
    }
    const target = CHAINS[targetChainId];
    if (!target) {
      setError({ code: "invalid", message: `Unsupported chainId ${targetChainId}` });
      return;
    }
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target.hex }],
      });
    } catch (err) {
      // 4902: chain not added; try wallet_addEthereumChain.
      const entry = decodeError(err);
      if (entry.code === "wrong-network") {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: target.hex,
                chainName: target.name,
                rpcUrls: [target.rpcUrl],
                nativeCurrency: target.nativeCurrency,
                blockExplorerUrls: target.explorerUrl ? [target.explorerUrl] : undefined,
              },
            ],
          });
          return;
        } catch (err2) {
          const e2 = decodeError(err2);
          setError({ code: e2.code, message: e2.message });
          return;
        }
      }
      setError({ code: entry.code, message: entry.message });
    }
  };

  const disconnect = () => {
    setAccount(null);
    setSigner(null);
    setStatus("idle");
    setError(null);
  };

  const value: Web3ContextValue = useMemo(
    () => ({
      status,
      account,
      chainId,
      chain,
      provider,
      signer,
      error,
      connect,
      switchChain,
      disconnect,
    }),
    [status, account, chainId, chain, provider, signer, error],
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

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
      disconnect: () => noop(),
    };
  }
  return ctx;
}

export function useIsSupportedChain(): boolean {
  const { chainId } = useWeb3Context();
  return isSupportedChain(chainId);
}
