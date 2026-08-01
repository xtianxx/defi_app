import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// --- Hoisted mocks ---
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

import { useLiquidity, estimateOptimal } from "@/hooks/useLiquidity";

// --- Fixed test fixtures ---
const TOKEN_A = "0x610178da211fef7d417bc0e6fed39f05609ad788" as `0x${string}`;
const TOKEN_B = "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e" as `0x${string}`;
const ROUTER = "0xrouter0000000000000000000000000000000000000a" as `0x${string}`;
const ACCOUNT = "0xaccount000000000000000000000000000000000000a" as `0x${string}`;
const CHAIN_ID = 31337;
const TX_HASH = "0xliq00000000000000000000000000000000000000000000000000000000000a" as `0x${string}`;

const AMOUNT_A = 100n * 10n ** 18n;
const AMOUNT_B = 200n * 10n ** 6n;

interface MockTx {
  hash: string;
  wait: () => Promise<{ status: number } | null>;
}

interface MockTokenContract {
  allowance: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
}

interface MockRouterContract {
  addLiquidity: ReturnType<typeof vi.fn>;
  addLiquidityETH: ReturnType<typeof vi.fn>;
}

function makeReceipt(status: number) {
  return { status } as unknown as { status: number };
}

function makeTx(hash: string, waitImpl: () => Promise<{ status: number } | null>): MockTx {
  return { hash, wait: () => waitImpl() };
}

function setupContracts(opts: {
  allowanceA?: bigint;
  allowanceB?: bigint;
  approveThrowA?: unknown;
  approveThrowB?: unknown;
  approveTxA?: MockTx;
  approveTxB?: MockTx;
  liqTx?: MockTx;
  liqThrow?: unknown;
} = {}) {
  const tokenAContract: MockTokenContract = {
    allowance: vi.fn(async () => opts.allowanceA ?? 0n),
    approve: opts.approveThrowA
      ? vi.fn(async () => { throw opts.approveThrowA; })
      : vi.fn(async () => opts.approveTxA ?? makeTx("0xapproveA", async () => makeReceipt(1))),
  };
  const tokenBContract: MockTokenContract = {
    allowance: vi.fn(async () => opts.allowanceB ?? 0n),
    approve: opts.approveThrowB
      ? vi.fn(async () => { throw opts.approveThrowB; })
      : vi.fn(async () => opts.approveTxB ?? makeTx("0xapproveB", async () => makeReceipt(1))),
  };
  const routerContract: MockRouterContract = {
    addLiquidity: opts.liqThrow
      ? vi.fn(async () => { throw opts.liqThrow; })
      : vi.fn(async () => opts.liqTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
    addLiquidityETH: opts.liqThrow
      ? vi.fn(async () => { throw opts.liqThrow; })
      : vi.fn(async () => opts.liqTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
  };
  ContractMock.mockImplementation((address: string) => {
    if (address === TOKEN_A) return tokenAContract;
    if (address === TOKEN_B) return tokenBContract;
    if (address === ROUTER) return routerContract;
    return {};
  });
  return { tokenAContract, tokenBContract, routerContract };
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
    weth: TOKEN_A,
    tokens: { WETH: TOKEN_A, USDC: TOKEN_B, DAI: TOKEN_A, WBTC: TOKEN_A },
  });
}

describe("useLiquidity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupWeb3();
    setupDeployment();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts in idle state with no tx state and no error", () => {
    const { result } = renderHook(() => useLiquidity());
    expect(result.current.phase).toBe("idle");
    expect(result.current.txHash).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("addLiquidity flows approving → submitting → mining → confirmed", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const { tokenAContract, tokenBContract, routerContract } = setupContracts({
      allowanceA: 0n,
      allowanceB: 0n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        amountADesired: AMOUNT_A,
        amountBDesired: AMOUNT_B,
        amountAMin: AMOUNT_A,
        amountBMin: AMOUNT_B,
        deadlineSeconds: 1000n,
      });
    });

    // Both tokens were checked for allowance
    expect(tokenAContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    expect(tokenBContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    // Both tokens were approved
    expect(tokenAContract.approve).toHaveBeenCalledWith(ROUTER, AMOUNT_A);
    expect(tokenBContract.approve).toHaveBeenCalledWith(ROUTER, AMOUNT_B);
    // Router.addLiquidity called with correct args
    expect(routerContract.addLiquidity).toHaveBeenCalledWith(
      TOKEN_A,
      TOKEN_B,
      AMOUNT_A,
      AMOUNT_B,
      AMOUNT_A,
      AMOUNT_B,
      ACCOUNT,
      1700001000n,
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);
    expect(result.current.receipt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("addLiquidityETH flows submitting → confirmed with msg.value", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const ETH_VALUE = 10n * 10n ** 18n;
    const { tokenBContract, routerContract } = setupContracts({
      allowanceB: 0n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidityETH({
        token: TOKEN_B,
        amountTokenDesired: AMOUNT_B,
        amountTokenMin: AMOUNT_B,
        amountETHMin: 0n,
        deadlineSeconds: 1000n,
        msgValue: ETH_VALUE,
      });
    });

    // Only the ERC20 token was approved (token = TOKEN_B → tokenBContract)
    expect(tokenBContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    expect(tokenBContract.approve).toHaveBeenCalledWith(ROUTER, AMOUNT_B);
    // Router.addLiquidityETH called with correct args and msg.value
    expect(routerContract.addLiquidityETH).toHaveBeenCalledWith(
      TOKEN_B,
      AMOUNT_B,
      AMOUNT_B,
      0n,
      ACCOUNT,
      1700001000n,
      { value: ETH_VALUE },
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);
  });

  it("addLiquidity surfaces error on failed approval", async () => {
    setupContracts({
      allowanceA: 0n,
      approveThrowA: new Error("User rejected approval"),
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        amountADesired: AMOUNT_A,
        amountBDesired: AMOUNT_B,
        amountAMin: AMOUNT_A,
        amountBMin: AMOUNT_B,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).not.toBeNull();
  });

  it("addLiquidity surfaces error on reverted tx", async () => {
    setupContracts({
      allowanceA: AMOUNT_A + 1n, // sufficient allowance, skip approve
      allowanceB: AMOUNT_B + 1n,
      liqTx: makeTx(TX_HASH, async () => makeReceipt(0)), // status 0 = reverted
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        amountADesired: AMOUNT_A,
        amountBDesired: AMOUNT_B,
        amountAMin: AMOUNT_A,
        amountBMin: AMOUNT_B,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("reverted");
    expect(result.current.receipt).not.toBeNull();
  });

  it("addLiquidity surfaces user-rejection", async () => {
    setupContracts({
      allowanceA: AMOUNT_A + 1n,
      allowanceB: AMOUNT_B + 1n,
      liqThrow: { code: 4001, message: "User rejected" },
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        amountADesired: AMOUNT_A,
        amountBDesired: AMOUNT_B,
        amountAMin: AMOUNT_A,
        amountBMin: AMOUNT_B,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("rejected");
    expect(result.current.error).toBeNull();
  });

  it("reset clears all state back to idle", async () => {
    setupContracts({
      allowanceA: 0n,
      allowanceB: 0n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        amountADesired: AMOUNT_A,
        amountBDesired: AMOUNT_B,
        amountAMin: AMOUNT_A,
        amountBMin: AMOUNT_B,
        deadlineSeconds: 1000n,
      });
    });
    expect(result.current.phase).toBe("confirmed");

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe("idle");
    expect(result.current.txHash).toBeNull();
    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("surfaces wallet-missing error when signer is absent", async () => {
    setupWeb3({ signer: null, account: null });
    setupContracts();
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.addLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        amountADesired: AMOUNT_A,
        amountBDesired: AMOUNT_B,
        amountAMin: AMOUNT_A,
        amountBMin: AMOUNT_B,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("wallet-missing");
  });
});

describe("estimateOptimal", () => {
  it("computes correct optimal B amount given reserves", () => {
    // amountADesired=100, reserveA=1000, reserveB=2000 → optimalB = 100 * 2000 / 1000 = 200
    const result = estimateOptimal(100n, 1000n, 2000n, 1000n);
    expect(result.amountA).toBe(100n);
    expect(result.amountB).toBe(200n);
  });

  it("returns amountBDesired for first liquidity (reserves zero)", () => {
    const result = estimateOptimal(100n, 0n, 0n, 500n);
    expect(result.amountA).toBe(100n);
    expect(result.amountB).toBe(500n);
  });

  it("returns zeroes when amountADesired is zero", () => {
    const result = estimateOptimal(0n, 1000n, 2000n, 500n);
    expect(result.amountA).toBe(0n);
    expect(result.amountB).toBe(0n);
  });

  it("adjusts amountA downward when optimal A exceeds amountBDesired", () => {
    // amountADesired=100, reserveA=100, reserveB=500, amountBDesired=200
    // optimalB = 100 * 500 / 100 = 500, which > 200 (amountBDesired)
    // So amountAOptimal = 200 * 100 / 500 = 40
    const result = estimateOptimal(100n, 100n, 500n, 200n);
    expect(result.amountA).toBe(40n);
    expect(result.amountB).toBe(200n);
  });

  it("handles large numbers without overflow", () => {
    const amountADesired = 100n * 10n ** 18n;
    const reserveA = 1000n * 10n ** 18n;
    const reserveB = 2000n * 10n ** 18n;
    const result = estimateOptimal(amountADesired, reserveA, reserveB, 10n ** 30n);
    // optimalB = 100e18 * 2000e18 / 1000e18 = 200e18
    expect(result.amountA).toBe(amountADesired);
    expect(result.amountB).toBe(200n * 10n ** 18n);
  });
});
