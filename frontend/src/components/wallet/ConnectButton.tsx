"use client";

import { useMemo } from "react";
import { useWeb3Context } from "@/providers/Web3Context";
import { ANVIL_CHAIN_ID } from "@/lib/chains";
import { truncateAddress } from "@/lib/format";

/**
 * Connect / disconnect / chain-switch button. Renders MetaMask connect when
 * the user is idle; truncates the connected account; shows a wrong-network
 * banner with a switch action if the chain is unsupported.
 * Spec: contracts/frontend-module-api.md §1, research.md R0.6.
 */
export function ConnectButton() {
  const { status, account, chainId, chain, error, connect, switchChain, disconnect } = useWeb3Context();

  const wrongNetwork = useMemo(() => chainId !== null && !chain, [chainId, chain]);

  if (status === "error" && error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600">
        <span>{error.message}</span>
        <button
          type="button"
          onClick={() => {
            void connect();
          }}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <button
        type="button"
        disabled
        className="rounded-md border px-3 py-1.5 text-sm font-medium opacity-60"
      >
        Connecting…
      </button>
    );
  }

  if (account) {
    return (
      <div className="flex items-center gap-2">
        {wrongNetwork && (
          <button
            type="button"
            onClick={() => {
              void switchChain(ANVIL_CHAIN_ID);
            }}
            className="rounded-md border border-red-500 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Wrong network — switch
          </button>
        )}
        <span className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium">
          {truncateAddress(account)}
        </span>
        {chain && <span className="text-xs text-muted-foreground">{chain.name}</span>}
        <button
          type="button"
          onClick={disconnect}
          className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        void connect();
      }}
      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      Connect Wallet
    </button>
  );
}
