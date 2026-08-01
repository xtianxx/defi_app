"use client";

import { useWeb3Context } from "@/providers/Web3Provider";

/**
 * Thin hook over the Web3Context. Components should use this rather than
 * importing the context directly. See frontend-module-api.md §1.
 */
export function useWeb3() {
  return useWeb3Context();
}
