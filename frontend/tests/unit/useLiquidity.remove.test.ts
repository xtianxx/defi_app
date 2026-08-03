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

import { useLiquidity, estimateRemoval } from "@/hooks/useLiquidity";

// --- Fixed test fixtures ---
const TOKEN_A = "0x610178da211fef7d417bc0e6fed39f05609ad788" as `0x${string}`;
const TOKEN_B = "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e" as `0x${string}`;
const ROUTER = "0xrouter0000000000000000000000000000000000000a" as `0x${string}`;
const ACCOUNT = "0xaccount000000000000000000000000000000000000a" as `0x${string}`;
const CHAIN_ID = 31337;
const TX_HASH = "0xliq00000000000000000000000000000000000000000000000000000000000a" as `0x${string}`;
const FACTORY = "0xfactory0000000000000000000000000000000000000a" as `0x${string}`;
const PAIR_ADDR = "0xpair00000000000000000000000000000000000000a" as `0x${string}`;

const LIQUIDITY = 50n * 10n ** 18n;
const AMOUNT_A_MIN = 40n * 10n ** 18n;
const AMOUNT_B_MIN = 25n * 10n ** 6n;

const SIG_R = "0x" + "1".repeat(64);
const SIG_S = "0x" + "2".repeat(64);

interface MockTx {
  hash: string;
  wait: () => Promise<{ status: number } | null>;
}

interface MockFactoryContract {
  getPair: ReturnType<typeof vi.fn>;
}

interface MockPairContract {
  allowance: ReturnType<typeof vi.fn>;
  approve: ReturnType<typeof vi.fn>;
  nonces: ReturnType<typeof vi.fn>;
}

interface MockRouterContract {
  removeLiquidity: ReturnType<typeof vi.fn>;
  removeLiquidityETH: ReturnType<typeof vi.fn>;
  removeLiquidityWithPermit: ReturnType<typeof vi.fn>;
  removeLiquidityETHWithPermit: ReturnType<typeof vi.fn>;
}

function makeReceipt(status: number) {
  return { status } as unknown as { status: number };
}

function makeTx(hash: string, waitImpl: () => Promise<{ status: number } | null>): MockTx {
  return { hash, wait: () => waitImpl() };
}

function setupContracts(opts: {
  pairAllowance?: bigint;
  pairApproveThrow?: unknown;
  approveTx?: MockTx;
  removeTx?: MockTx;
  removeThrow?: unknown;
  getPairResult?: `0x${string}`;
} = {}) {
  const factoryContract: MockFactoryContract = {
    getPair: vi.fn(async () => opts.getPairResult ?? PAIR_ADDR),
  };
  const pairContract: MockPairContract = {
    allowance: vi.fn(async () => opts.pairAllowance ?? 0n),
    approve: opts.pairApproveThrow
      ? vi.fn(async () => { throw opts.pairApproveThrow; })
      : vi.fn(async () => opts.approveTx ?? makeTx("0xapprove", async () => makeReceipt(1))),
    nonces: vi.fn(async () => 3n),
  };
  const routerContract: MockRouterContract = {
    removeLiquidity: opts.removeThrow
      ? vi.fn(async () => { throw opts.removeThrow; })
      : vi.fn(async () => opts.removeTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
    removeLiquidityETH: opts.removeThrow
      ? vi.fn(async () => { throw opts.removeThrow; })
      : vi.fn(async () => opts.removeTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
    removeLiquidityWithPermit: opts.removeThrow
      ? vi.fn(async () => { throw opts.removeThrow; })
      : vi.fn(async () => opts.removeTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
    removeLiquidityETHWithPermit: opts.removeThrow
      ? vi.fn(async () => { throw opts.removeThrow; })
      : vi.fn(async () => opts.removeTx ?? makeTx(TX_HASH, async () => makeReceipt(1))),
  };
  ContractMock.mockImplementation((address: string) => {
    if (address === FACTORY) return factoryContract;
    if (address === PAIR_ADDR) return pairContract;
    if (address === ROUTER) return routerContract;
    return {};
  });
  return { factoryContract, pairContract, routerContract };
}

function setupWeb3(overrides: Partial<{ signer: unknown; account: string | null; chainId: number | null; provider: unknown }> = {}) {
  const signerMock = {
    provider: {
      getNetwork: async () => ({ chainId: 31337n }),
    },
    signTypedData: vi.fn(async () => ({ v: 27, r: SIG_R, s: SIG_S, from: ACCOUNT })),
  };
  useWeb3ContextMock.mockReturnValue({
    status: "ready",
    account: ACCOUNT,
    chainId: CHAIN_ID,
    chain: null,
    provider: {},
    signer: signerMock,
    error: null,
    connect: vi.fn(),
    switchChain: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  });
  return signerMock;
}

function setupDeployment() {
  getDeploymentMock.mockReturnValue({
    factory: FACTORY,
    router: ROUTER,
    weth: TOKEN_A,
    tokens: { WETH: TOKEN_A, USDC: TOKEN_B, DAI: TOKEN_A, WBTC: TOKEN_A },
  });
}

describe("useLiquidity remove", () => {
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

  it("removeLiquidity flows approving → submitting → mining → confirmed", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const { factoryContract, pairContract, routerContract } = setupContracts({
      pairAllowance: 0n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
      });
    });

    // Pair resolved through the factory
    expect(factoryContract.getPair).toHaveBeenCalledWith(TOKEN_A, TOKEN_B);
    // LP allowance checked, insufficient → approve sent
    expect(pairContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    expect(pairContract.approve).toHaveBeenCalledWith(ROUTER, LIQUIDITY);
    // Router.removeLiquidity called with exact args
    expect(routerContract.removeLiquidity).toHaveBeenCalledWith(
      TOKEN_A,
      TOKEN_B,
      LIQUIDITY,
      AMOUNT_A_MIN,
      AMOUNT_B_MIN,
      ACCOUNT,
      1700001000n,
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);
    expect(result.current.receipt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("removeLiquidity skips approve when LP allowance is sufficient", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const { pairContract, routerContract } = setupContracts({
      pairAllowance: LIQUIDITY + 1n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
      });
    });

    expect(pairContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    expect(pairContract.approve).not.toHaveBeenCalled();
    expect(routerContract.removeLiquidity).toHaveBeenCalledWith(
      TOKEN_A,
      TOKEN_B,
      LIQUIDITY,
      AMOUNT_A_MIN,
      AMOUNT_B_MIN,
      ACCOUNT,
      1700001000n,
    );
    expect(result.current.phase).toBe("confirmed");
  });

  it("removeLiquidityETH flows approving → submitting → confirmed", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const { factoryContract, pairContract, routerContract } = setupContracts({
      pairAllowance: 0n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidityETH({
        token: TOKEN_B,
        liquidity: LIQUIDITY,
        amountTokenMin: AMOUNT_A_MIN,
        amountETHMin: 0n,
        deadlineSeconds: 1000n,
      });
    });

    // ETH pair is (token, weth) — weth = TOKEN_A in the deployment mock
    expect(factoryContract.getPair).toHaveBeenCalledWith(TOKEN_B, TOKEN_A);
    expect(pairContract.allowance).toHaveBeenCalledWith(ACCOUNT, ROUTER);
    expect(pairContract.approve).toHaveBeenCalledWith(ROUTER, LIQUIDITY);
    expect(routerContract.removeLiquidityETH).toHaveBeenCalledWith(
      TOKEN_B,
      LIQUIDITY,
      AMOUNT_A_MIN,
      0n,
      ACCOUNT,
      1700001000n,
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);
    expect(result.current.error).toBeNull();
  });

  it("removeLiquidity with permit signs EIP-712 and calls removeLiquidityWithPermit", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const signerMock = setupWeb3();
    const { factoryContract, pairContract, routerContract } = setupContracts({
      pairAllowance: 0n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
        usePermit: true,
      });
    });

    expect(factoryContract.getPair).toHaveBeenCalledWith(TOKEN_A, TOKEN_B);
    // Permit flow must NOT touch the allowance / approve path
    expect(pairContract.allowance).not.toHaveBeenCalled();
    expect(pairContract.approve).not.toHaveBeenCalled();
    // Nonce read for the EIP-2612 signature
    expect(pairContract.nonces).toHaveBeenCalledWith(ACCOUNT);
    expect(signerMock.signTypedData).toHaveBeenCalledWith(
      { name: "Uniswap V2", version: "1", chainId: 31337, verifyingContract: PAIR_ADDR },
      {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { owner: ACCOUNT, spender: ROUTER, value: LIQUIDITY, nonce: 3n, deadline: 1700001000n },
    );
    expect(routerContract.removeLiquidityWithPermit).toHaveBeenCalledWith(
      TOKEN_A,
      TOKEN_B,
      LIQUIDITY,
      AMOUNT_A_MIN,
      AMOUNT_B_MIN,
      ACCOUNT,
      1700001000n,
      false,
      27,
      SIG_R,
      SIG_S,
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.txHash).toBe(TX_HASH);
    expect(result.current.error).toBeNull();
  });

  it("removeLiquidityETH with permit calls removeLiquidityETHWithPermit", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const signerMock = setupWeb3();
    const { factoryContract, pairContract, routerContract } = setupContracts();
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidityETH({
        token: TOKEN_B,
        liquidity: LIQUIDITY,
        amountTokenMin: AMOUNT_A_MIN,
        amountETHMin: 0n,
        deadlineSeconds: 1000n,
        usePermit: true,
      });
    });

    expect(factoryContract.getPair).toHaveBeenCalledWith(TOKEN_B, TOKEN_A);
    expect(pairContract.allowance).not.toHaveBeenCalled();
    expect(pairContract.approve).not.toHaveBeenCalled();
    expect(pairContract.nonces).toHaveBeenCalledWith(ACCOUNT);
    expect(signerMock.signTypedData).toHaveBeenCalledWith(
      { name: "Uniswap V2", version: "1", chainId: 31337, verifyingContract: PAIR_ADDR },
      { Permit: expect.any(Array) },
      { owner: ACCOUNT, spender: ROUTER, value: LIQUIDITY, nonce: 3n, deadline: 1700001000n },
    );
    expect(routerContract.removeLiquidityETHWithPermit).toHaveBeenCalledWith(
      TOKEN_B,
      LIQUIDITY,
      AMOUNT_A_MIN,
      0n,
      ACCOUNT,
      1700001000n,
      false,
      27,
      SIG_R,
      SIG_S,
    );
    expect(result.current.phase).toBe("confirmed");
    expect(result.current.error).toBeNull();
  });

  it("passes the full LP balance through unchanged when closing 100% of a position", async () => {
    const FIXED_NOW = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    const LP_BALANCE = 42n * 10n ** 18n;
    const { routerContract } = setupContracts({
      pairAllowance: LP_BALANCE + 1n,
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LP_BALANCE,
        amountAMin: 0n,
        amountBMin: 0n,
        deadlineSeconds: 1000n,
      });
    });

    expect(routerContract.removeLiquidity).toHaveBeenCalledWith(
      TOKEN_A,
      TOKEN_B,
      LP_BALANCE,
      0n,
      0n,
      ACCOUNT,
      1700001000n,
    );
    expect(result.current.phase).toBe("confirmed");
  });

  it("surfaces reverted state when the removal tx is reverted on-chain", async () => {
    setupContracts({
      pairAllowance: LIQUIDITY + 1n,
      removeTx: makeTx(TX_HASH, async () => makeReceipt(0)),
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("reverted");
    expect(result.current.receipt).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("surfaces user-rejection when the wallet throws code 4001", async () => {
    setupContracts({
      pairAllowance: LIQUIDITY + 1n,
      removeThrow: { code: 4001, message: "User rejected" },
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("rejected");
    expect(result.current.error).toBeNull();
  });

  it("surfaces error when the LP approval fails", async () => {
    setupContracts({
      pairAllowance: 0n,
      pairApproveThrow: new Error("User rejected approval"),
    });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error).not.toBeNull();
    expect(result.current.txHash).toBeNull();
  });

  it("surfaces wallet-missing error when signer is absent", async () => {
    setupWeb3({ signer: null, account: null });
    setupContracts();
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
        deadlineSeconds: 1000n,
      });
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.error?.code).toBe("wallet-missing");
  });

  it("reset clears all state back to idle", async () => {
    setupContracts({ pairAllowance: LIQUIDITY + 1n });
    const { result } = renderHook(() => useLiquidity());

    await act(async () => {
      await result.current.removeLiquidity({
        tokenA: TOKEN_A,
        tokenB: TOKEN_B,
        liquidity: LIQUIDITY,
        amountAMin: AMOUNT_A_MIN,
        amountBMin: AMOUNT_B_MIN,
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
});

describe("estimateRemoval", () => {
  it("computes expected token amounts when tokenA is token0", () => {
    // liquidity=100, totalSupply=1000, reserve0=2000, reserve1=4000
    // amountA = 100*2000/1000 = 200, amountB = 100*4000/1000 = 400
    const result = estimateRemoval(100n, 1000n, 2000n, 4000n, TOKEN_A, TOKEN_A);
    expect(result.amountA).toBe(200n);
    expect(result.amountB).toBe(400n);
  });

  it("swaps the returned amounts when tokenA is not token0 (reversed pair)", () => {
    const result = estimateRemoval(100n, 1000n, 2000n, 4000n, TOKEN_A, TOKEN_B);
    expect(result.amountA).toBe(400n);
    expect(result.amountB).toBe(200n);
  });

  it("returns zeroes when totalSupply is zero", () => {
    const result = estimateRemoval(100n, 0n, 2000n, 4000n, TOKEN_A, TOKEN_A);
    expect(result.amountA).toBe(0n);
    expect(result.amountB).toBe(0n);
  });

  it("returns zeroes when liquidity is zero", () => {
    const result = estimateRemoval(0n, 1000n, 2000n, 4000n, TOKEN_A, TOKEN_A);
    expect(result.amountA).toBe(0n);
    expect(result.amountB).toBe(0n);
  });

  it("floors the returned amounts (rounds down)", () => {
    // liquidity=1, totalSupply=1000 → amountA = 1*999/1000 = 0 (floor),
    // amountB = 1*2000/1000 = 2
    const result = estimateRemoval(1n, 1000n, 999n, 2000n, TOKEN_A, TOKEN_A);
    expect(result.amountA).toBe(0n);
    expect(result.amountB).toBe(2n);
  });
});
