// Unit tests for the chain configuration (T004, T005).
// Covers the 001 anvil entry (regression, unchanged) plus the new Sepolia
// entry from specs/002-sepolia-vercel-deploy/contracts/frontend-module-api.md
// §1 (rpcUrl deliberately empty — resolved server-side from env, R0.2).
import { describe, expect, it } from "vitest";

import {
  ANVIL_CHAIN_ID,
  CHAINS,
  SEPOLIA_CHAIN_ID,
  getBlockExplorerTxUrl,
  getChain,
  isSupportedChain,
} from "@/lib/chains";

const TX_HASH =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" as `0x${string}`;

describe("chains config", () => {
  describe("anvil (001 regression)", () => {
    it("is a supported chain with a chain entry", () => {
      expect(isSupportedChain(ANVIL_CHAIN_ID)).toBe(true);
      expect(getChain(ANVIL_CHAIN_ID)).toBe(CHAINS[ANVIL_CHAIN_ID]);
    });

    it("keeps the 001 static rpcUrl and explorerUrl unchanged", () => {
      expect(CHAINS[ANVIL_CHAIN_ID]).toMatchObject({
        chainId: ANVIL_CHAIN_ID,
        hex: "0x7a69",
        name: "Anvil (local)",
        rpcUrl: "http://127.0.0.1:8545",
        explorerUrl: "http://127.0.0.1:8545",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      });
    });

    it("builds block explorer tx URLs", () => {
      expect(getBlockExplorerTxUrl(ANVIL_CHAIN_ID, TX_HASH)).toBe(
        `http://127.0.0.1:8545/tx/${TX_HASH}`,
      );
    });
  });

  describe("sepolia (002)", () => {
    it("registers chainId 11155111 with an empty static rpcUrl", () => {
      expect(CHAINS[SEPOLIA_CHAIN_ID]).toEqual({
        chainId: 11155111,
        hex: "0xaa36a7",
        name: "Sepolia",
        rpcUrl: "",
        explorerUrl: "https://sepolia.etherscan.io",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      });
    });

    it("is a supported chain with a chain entry", () => {
      expect(isSupportedChain(SEPOLIA_CHAIN_ID)).toBe(true);
      expect(getChain(SEPOLIA_CHAIN_ID)).toBe(CHAINS[SEPOLIA_CHAIN_ID]);
    });

    it("builds block explorer tx URLs", () => {
      expect(getBlockExplorerTxUrl(SEPOLIA_CHAIN_ID, TX_HASH)).toBe(
        `https://sepolia.etherscan.io/tx/${TX_HASH}`,
      );
    });
  });

  it("rejects unsupported chains", () => {
    expect(isSupportedChain(1)).toBe(false);
    expect(isSupportedChain(null)).toBe(false);
    expect(getChain(1)).toBeNull();
    expect(getChain(null)).toBeNull();
    expect(getBlockExplorerTxUrl(1, TX_HASH)).toBeNull();
  });
});
