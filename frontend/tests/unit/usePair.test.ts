import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// --- Hoisted mocks (vi.mock factories are hoisted above imports) ---
const { useWeb3ContextMock, ContractMock, getDeploymentMock } = vi.hoisted(() => ({
  useWeb3ContextMock: vi.fn(),
  ContractMock: vi.fn(),
  getDeploymentMock: vi.fn(),
}));

vi.mock("@/providers/Web3Provider", () => ({
  useWeb3Context: () => useWeb3ContextMock(),
}));

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return { ...actual, Contract: ContractMock };
});

vi.mock("@/lib/contracts/addresses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/addresses")>();
  return { ...actual, getDeployment: getDeploymentMock };
});

vi.mock("@/lib/contracts/tokens", () => ({
  isValidAddress: () => true,
}));

import { usePair } from "@/hooks/usePair";
import { ZeroAddress } from "ethers";

const TOKEN_A = "0x610178da211fef7d417bc0e6fed39f05609ad788" as `0x${string}`;
const TOKEN_B = "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e" as `0x${string}`;
const ACCOUNT = "0xaccount000000000000000000000000000000000000a" as `0x${string}`;
const CHAIN_ID = 31337;
const FACTORY = "0xfactory0000000000000000000000000000000000000a" as `0x${string}`;
const PAIR = "0xpair00000000000000000000000000000000000000aa" as `0x${string}`;

function setupWeb3(overrides: Partial<{ provider: unknown; chainId: number | null; account: string | null }> = {}) {
  useWeb3ContextMock.mockReturnValue({
    status: "ready",
    account: ACCOUNT,
    chainId: CHAIN_ID,
    chain: null,
    provider: {},
    signer: {},
    error: null,
    connect: vi.fn(),
    switchChain: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  });
}

function setupDeployment() {
  getDeploymentMock.mockReturnValue({
    factory: FACTORY,
    router: "0xrouter0000000000000000000000000000000000000a",
    weth: TOKEN_A,
    tokens: { WETH: TOKEN_A, USDC: TOKEN_B, DAI: TOKEN_A, WBTC: TOKEN_A },
  });
}

function setupFactory(
  getPairImpl: (a: `0x${string}`, b: `0x${string}`) => Promise<`0x${string}`>,
  pairState: { balance?: bigint; supply?: bigint } = {},
) {
  ContractMock.mockImplementation((address: string) => {
    if (address === FACTORY) return { getPair: vi.fn(getPairImpl) };
    if (address === PAIR) {
      return {
        token0: vi.fn(async () => TOKEN_A),
        token1: vi.fn(async () => TOKEN_B),
        getReserves: vi.fn(async () => [1000n * 10n ** 18n, 1000n * 10n ** 18n, 0n]),
        price0CumulativeLast: vi.fn(async () => 0n),
        price1CumulativeLast: vi.fn(async () => 0n),
        totalSupply: vi.fn(async () => pairState.supply ?? 1000n),
        balanceOf: vi.fn(async () => pairState.balance ?? 0n),
      };
    }
    return {};
  });
}

describe("usePair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWeb3();
    setupDeployment();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks a non-existent pair with lpBalance 0n (not null) so no permanent skeleton renders", async () => {
    // Regression: ActivePositions treats lpBalance === null as "loading" and
    // renders a skeleton row. For pairs without a pool, usePair previously
    // reset lpBalance to null forever → permanent blank skeleton rows.
    setupFactory(async () => ZeroAddress);
    const { result } = renderHook(() => usePair(TOKEN_A, TOKEN_B));

    await waitFor(() => expect(result.current.lpBalance).toBe(0n));
    expect(result.current.pairAddress).toBeNull();
    expect(result.current.liquidity).toBe(0n);
  });

  it("reports lpBalance 0n for an existing pool the account has no LP in", async () => {
    setupFactory(async () => PAIR, { balance: 0n });
    const { result } = renderHook(() => usePair(TOKEN_A, TOKEN_B));

    await waitFor(() => expect(result.current.lpBalance).toBe(0n));
    expect(result.current.pairAddress).toBe(PAIR);
    expect(result.current.liquidity).toBe(1000n);
  });

  it("reports the account's LP balance for an existing position", async () => {
    setupFactory(async () => PAIR, { balance: 42n, supply: 1000n });
    const { result } = renderHook(() => usePair(TOKEN_A, TOKEN_B));

    await waitFor(() => expect(result.current.lpBalance).toBe(42n));
    expect(result.current.pairAddress).toBe(PAIR);
    expect(result.current.liquidity).toBe(1000n);
  });

  it("keeps lpBalance null while preconditions are missing (true loading state)", async () => {
    setupWeb3({ provider: null, chainId: null });
    setupFactory(async () => PAIR);
    const { result } = renderHook(() => usePair(TOKEN_A, TOKEN_B));

    await waitFor(() => expect(result.current.lpBalance).toBeNull());
    expect(result.current.pairAddress).toBeNull();
  });
});
