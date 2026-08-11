// Unit tests for server RPC resolution (T006, T007).
// createServerProvider resolves Sepolia's RPC from the SEPOLIA_RPC_URL env var
// INSIDE the function body (never at module top level, never in client-imported
// code); spec: specs/002-sepolia-vercel-deploy/contracts/frontend-module-api.md §2.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks (vi.mock factories are hoisted above imports) ---
const { JsonRpcProviderMock } = vi.hoisted(() => ({
  JsonRpcProviderMock: vi.fn(),
}));

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return { ...actual, JsonRpcProvider: JsonRpcProviderMock };
});

import { ANVIL_CHAIN_ID, SEPOLIA_CHAIN_ID } from "@/lib/chains";
import { createServerProvider } from "@/lib/rpc";

const ANVIL_RPC_URL = "http://127.0.0.1:8545";
const SEPOLIA_RPC_URL = "https://sepolia.example.com/rpc";

describe("createServerProvider", () => {
  beforeEach(() => {
    JsonRpcProviderMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the Sepolia RPC from SEPOLIA_RPC_URL at call time", () => {
    vi.stubEnv("SEPOLIA_RPC_URL", SEPOLIA_RPC_URL);

    createServerProvider(SEPOLIA_CHAIN_ID);

    expect(JsonRpcProviderMock).toHaveBeenCalledWith(
      SEPOLIA_RPC_URL,
      SEPOLIA_CHAIN_ID,
      { staticNetwork: true },
    );
  });

  it("throws a clear error when SEPOLIA_RPC_URL is not set", () => {
    vi.stubEnv("SEPOLIA_RPC_URL", undefined);

    expect(() => createServerProvider(SEPOLIA_CHAIN_ID)).toThrowError(
      "SEPOLIA_RPC_URL not configured",
    );
  });

  it("defaults to the anvil chain when no chainId is passed", () => {
    createServerProvider();

    expect(JsonRpcProviderMock).toHaveBeenCalledWith(
      ANVIL_RPC_URL,
      ANVIL_CHAIN_ID,
      { staticNetwork: true },
    );
  });

  it("uses the static anvil rpcUrl from CHAINS", () => {
    createServerProvider(ANVIL_CHAIN_ID);

    expect(JsonRpcProviderMock).toHaveBeenCalledWith(
      ANVIL_RPC_URL,
      ANVIL_CHAIN_ID,
      { staticNetwork: true },
    );
  });

  it("throws for unsupported chainIds", () => {
    expect(() => createServerProvider(999)).toThrowError(
      "Unsupported chainId 999 for server provider",
    );
  });
});
