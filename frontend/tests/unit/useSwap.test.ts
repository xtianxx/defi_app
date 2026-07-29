import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Hoisted mocks (vi.mock factories are hoisted above imports) ---
const { useWeb3ContextMock, usePairMock, ContractMock, getDeploymentMock } = vi.hoisted(() => ({
  useWeb3ContextMock: vi.fn(),
  usePairMock: vi.fn(),
  ContractMock: vi.fn(),
  getDeploymentMock: vi.fn(),
}));

vi.mock("@/providers/Web3Provider", () => ({
  useWeb3Context: () => useWeb3ContextMock(),
}));

vi.mock("@/hooks/usePair", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/usePair")>();
  return { ...actual, usePair: (...args: unknown[]) => usePairMock(...args) };
});

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return { ...actual, Contract: ContractMock };
});

vi.mock("@/lib/contracts/addresses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/contracts/addresses")>();
  return { ...actual, getDeployment: getDeploymentMock };
});

import { useSwap } from "@/hooks/useSwap";
import { getAmountOut } from "@/hooks/usePair";

// --- Fixed test fixtures ---
const TOKEN_IN = "0x610178da211fef7d417bc0e6fed39f05609ad788" as `0x${string}`; // WETH
const TOKEN_OUT = "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e" as `0x${string}`; // USDC
const ROUTER = "0xrouter0000000000000000000000000000000000000a" as `0x${string}`;
const ACCOUNT = "0xaccount000000000000000000000000000000000000a" as `0x${string}`;
const CHAIN_ID = 31337;
const SWAP_HASH = "0xswap00000000000000000000000000000000000000000000000000000000000a" as `0x${string}`;

const RESERVE_IN = 1000n * 10n ** 18n;
const RESERVE_OUT = 1000n * 10n ** 18n;

interface MockTx {
  hash: string;
  wait: () => Promise<{ status: number } | null>;
}

interface MockTokenContract {
  allowance: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
}

interface MockRouterContract {
  swapExactTokensForTokens: ReturnType<typeof vi.fn>;
}

function makeReceipt(status: number) {
  return { status } as unknown as { status: number };
}

function makeTx(hash: string, waitImpl: () => Promise<{ status: number } | null>): MockTx {
  return { hash, wait: () => waitImpl() };
}

/**
 * Build a fresh pair of mock contracts (token + router) for one test.
 * Overrides let each test customize allowance/approve/swap behavior.
 */
function setupContracts(opts: {
  allowance?: bigint;
  approveTx?: MockTx;
  approveThrow?: unknown;
  swapTx?: MockTx;
  swapThrow?: unknown;
} = {}) {
  const tokenContract: MockTokenContract = {
    allowance: vi.fn(async () => opts.allowance ?? 0n),
    approve: opts.approveThrow
      ? vi.fn(async () => {
          throw opts.approveThrow;
        })
      : vi.fn(async () => opts.approveTx ?? makeTx("0xapprove", async () => makeReceipt(1))),
  };
  const routerContract: MockRouterContract = {
    swapExactTokensForTokens: opts.swapThrow
      ? vi.fn(async () => {
          throw opts.swapThrow;
        })
      : vi.fn(async () => opts.swapTx ?? makeTx(SWAP_HASH, async () => makeReceipt(1))),
  };
  ContractMock.mockImplementation((address: string) => {
    if (address === TOKEN_IN) return tokenContract;
    if (address === ROUTER) return routerContract;
    return {};
  });
  return { tokenContract, routerContract };
}

function setupPairReserves(token0: `0x${string}` = TOKEN_IN) {
  usePairMock.mockReturnValue({
    pairAddress: "0xpair000000000000000000000000000000000000000a",
    token0,
    token1: token0 === TOKEN_IN ? TOKEN_OUT : TOKEN_IN,
    reserves: { reserve0: RESERVE_IN, reserve1: RESERVE_OUT, blockTimestampLast: 0 },
    price0CumulativeLast: 0n,
    price1CumulativeLast: 0n,
    liquidity: 0n,
    lpBalance: 0n,
    refresh: vi.fn(),
  });
}

function setupWeb3(overrides: Partial<{ signer: unknown; account: string | null; chainId: number | null; provider: unknown }> = {}) {
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
    factory: "0xfactory0000000000000000000000000000000000000a",
    router: ROUTER,
    weth: TOKEN_IN,
    tokens: { WETH: TOKEN_IN, USDC: TOKEN_OUT, DAI: TOKEN_IN, WBTC: TOKEN_IN },
  });
}

describe("useSwap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWeb3();
    setupDeployment();
    setupPairReserves();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in idle state with no params and no error", () => {
    const { result } = renderHook(() => useSwap());
    expect(result.current.phase).toBe("idle");
    expect(result.current.tokenIn).toBeNull();
    expect(result.current.tokenOut).toBeNull();
    expect(result.current.amountIn).toBeNull();
    expect(result.current.amountOutEstimated).toBeNull();
    expect(result.current.priceImpactPctBp).toBeNull();
    expect(result.current.feePctBp).toBe(30);
    expect(result.current.txHash).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("setParams computes amountOutEstimated via getAmountOut and price impact in bp", () => {
    const amountIn = 100n * 10n ** 18n;
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, amountIn);
    });

    // tokenIn === token0, so reserveIn = reserve0, reserveOut = reserve1.
    const expectedOut = getAmountOut(amountIn, RESERVE_IN, RESERVE_OUT);
    expect(result.current.amountOutEstimated).toBe(expectedOut);

    // price impact = amountIn / (reserveIn + amountIn) * 10000 (integer bp)
    const expectedImpact = Number((amountIn * 10000n) / (RESERVE_IN + amountIn));
    expect(result.current.priceImpactPctBp).toBe(expectedImpact);
    expect(result.current.feePctBp).toBe(30);
  });

  it("execute flows approving → submitting → mining → confirmed when allowance is 0", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const { tokenContract, routerContract } = setupContracts({ allowance: 0n });
    const amountIn = 10n * 10n ** 18n;
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, amountIn);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    // Allowance was insufficient → approve called, then swap called.
    expect(tokenContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    expect(tokenContract.approve).toHaveBeenCalledWith(ROUTER, amountIn);
    // Deadline is converted to absolute Unix timestamp: floor(now/1000) + 1000.
    expect(routerContract.swapExactTokensForTokens).toHaveBeenCalledWith(
      amountIn,
      0n,
      [TOKEN_IN, TOKEN_OUT],
      ACCOUNT,
      1700001000n,
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(SWAP_HASH);
    expect(result.current.receipt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("execute skips approve when allowance is already sufficient", async () => {
    const { tokenContract, routerContract } = setupContracts({ allowance: 1_000_000n * 10n ** 18n });
    const amountIn = 10n * 10n ** 18n;
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, amountIn);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(tokenContract.approve).not.toHaveBeenCalled();
    expect(routerContract.swapExactTokensForTokens).toHaveBeenCalled();
    expect(result.current.phase).toBe("confirmed");
  });

  it("execute sets phase=rejected with no error when user rejects (code 4001)", async () => {
    setupContracts({ allowance: 0n, approveThrow: { code: 4001, message: "User rejected" } });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(result.current.phase).toBe("rejected");
    expect(result.current.error).toBeNull();
  });

  it("execute sets phase=error with decoded code on contract revert (CALL_EXCEPTION)", async () => {
    setupContracts({
      allowance: 1_000_000n * 10n ** 18n,
      swapThrow: Object.assign(new Error("execution reverted: UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT"), {
        code: "CALL_EXCEPTION",
        reason: "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT",
      }),
    });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("slippage");
  });

  it("execute sets phase=error with gas-estimation code on gas estimation failure", async () => {
    setupContracts({
      allowance: 1_000_000n * 10n ** 18n,
      swapThrow: new Error("gas required exceeds allowance"),
    });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("gas-estimation");
  });

  it("execute sets phase=reverted when receipt.status === 0", async () => {
    setupContracts({
      allowance: 1_000_000n * 10n ** 18n,
      swapTx: makeTx(SWAP_HASH, async () => makeReceipt(0)),
    });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(result.current.phase).toBe("reverted");
    expect(result.current.receipt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("reset clears all state back to idle", async () => {
    setupContracts({ allowance: 0n });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });
    await act(async () => {
      await result.current.execute(0n, 1000n);
    });
    expect(result.current.phase).toBe("confirmed");

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.tokenIn).toBeNull();
    expect(result.current.tokenOut).toBeNull();
    expect(result.current.amountIn).toBeNull();
    expect(result.current.amountOutEstimated).toBeNull();
    expect(result.current.txHash).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("execute surfaces wallet-missing error when signer is absent", async () => {
    setupWeb3({ signer: null, account: null });
    setupContracts({ allowance: 0n });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("wallet-missing");
  });

  it("execute surfaces wrong-network error when deployment is not configured", async () => {
    getDeploymentMock.mockReturnValue(null);
    setupContracts({ allowance: 0n });
    const { result } = renderHook(() => useSwap());

    act(() => {
      result.current.setParams(TOKEN_IN, TOKEN_OUT, 10n * 10n ** 18n);
    });

    await act(async () => {
      await result.current.execute(0n, 1000n);
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("wrong-network");
  });
});
