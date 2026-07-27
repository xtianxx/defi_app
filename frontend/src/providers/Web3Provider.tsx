"use client";

// Phase 1 scaffold — full implementation in Phase 2 (T025).
// See specs/001-uniswap-v2-resume/plan.md and research.md R0.6.
import type { ReactNode } from "react";

/**
 * Placeholder Web3Provider for Phase 1.
 * Phase 2 (T025) will replace this body with a real Context that wraps
 * `useWeb3` (BrowserProvider + signer + EIP-1193 event listeners).
 *
 * The `'use client'` directive is required up-front: the moment T025 adds
 * `createContext` + `useState` + EIP-1193 listeners, the file becomes a
 * client component by contract. Setting the directive now prevents a
 * Phase 2 build break and makes the client boundary explicit.
 */
export function Web3Provider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
