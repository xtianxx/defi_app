"use client";

// Phase 1 scaffold — full implementation in Phase 2 (T027).
// See specs/001-uniswap-v2-resume/research.md R0.6 for the ethers v6 + 'use client' pattern.
/**
 * Connect button placeholder.
 * Real wiring: `eth_requestAccounts` → `BrowserProvider.getSigner()` (async in v6),
 * `accountsChanged`/`chainChanged` listeners, network switch banner on wrong chain.
 */
export function ConnectButton() {
  return (
    <button
      type="button"
      className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
      disabled
    >
      Connect Wallet
    </button>
  );
}
