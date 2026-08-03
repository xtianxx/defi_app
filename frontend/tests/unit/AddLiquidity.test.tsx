import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddLiquidity } from "@/components/liquidity/AddLiquidity";
import { getTokenAddress } from "@/lib/contracts/tokens";
import type { Deployment } from "@/lib/contracts/addresses";

const mockAddLiquidity = vi.hoisted(() => vi.fn());
const mockAddLiquidityETH = vi.hoisted(() => vi.fn());
const mockReset = vi.hoisted(() => vi.fn());
const mockUseLiquidity = vi.hoisted(() =>
  vi.fn(() => ({
    phase: "idle" as const,
    txHash: null,
    receipt: null,
    error: null,
    addLiquidity: mockAddLiquidity,
    addLiquidityETH: mockAddLiquidityETH,
    reset: mockReset,
  })),
);

const mockUseWeb3Context = vi.hoisted(() => vi.fn());
const mockUsePair = vi.hoisted(() => vi.fn());
const mockApproveA = vi.hoisted(() => vi.fn());
const mockRefreshA = vi.hoisted(() => vi.fn());
const mockApproveB = vi.hoisted(() => vi.fn());
const mockRefreshB = vi.hoisted(() => vi.fn());
const mockUseToken = vi.hoisted(() => vi.fn());

const mockGetDeployment = vi.hoisted(() => vi.fn());
const mockIsDeploymentConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/hooks/useLiquidity", () => ({ useLiquidity: mockUseLiquidity, estimateOptimal: vi.fn() }));
vi.mock("@/hooks/usePair", () => ({ usePair: mockUsePair, getAmountOut: vi.fn() }));
vi.mock("@/hooks/useToken", () => ({ useToken: mockUseToken }));
vi.mock("@/providers/Web3Provider", () => ({ useWeb3Context: mockUseWeb3Context }));
vi.mock("@/lib/contracts/addresses", () => ({
  getDeployment: mockGetDeployment,
  isDeploymentConfigured: mockIsDeploymentConfigured,
}));

const testDeployment: Deployment = {
  factory: "0x0000000000000000000000000000000000000001",
  router: "0x0000000000000000000000000000000000000002",
  weth: "0x610178da211fef7d417bc0e6fed39f05609ad788",
  tokens: {
    WETH: "0x610178da211fef7d417bc0e6fed39f05609ad788",
    USDC: "0xb7f8bc63bbcad18155201308c8f3540b07f84f5e",
    DAI: "0x0000000000000000000000000000000000000003",
    WBTC: "0x0000000000000000000000000000000000000004",
  },
};

function mockWeb3Context(overrides = {}) {
  mockUseWeb3Context.mockReturnValue({
    status: "ready",
    account: "0x1234567890123456789012345678901234567890",
    chainId: 31337,
    chain: { name: "Anvil" },
    provider: null,
    signer: null,
    error: null,
    connect: vi.fn(),
    switchChain: vi.fn(),
    disconnect: vi.fn(),
    ...overrides,
  });
}

function mockLiquidityState(overrides = {}) {
  mockUseLiquidity.mockReturnValue({
    phase: "idle" as const,
    txHash: null,
    receipt: null,
    error: null,
    addLiquidity: mockAddLiquidity,
    addLiquidityETH: mockAddLiquidityETH,
    reset: mockReset,
    ...overrides,
  });
}

function mockPairState(overrides = {}) {
  mockUsePair.mockReturnValue({
    pairAddress: "0x00000000000000000000000000000000000000AA" as `0x${string}`,
    token0: null,
    token1: null,
    reserves: null,
    price0CumulativeLast: null,
    price1CumulativeLast: null,
    liquidity: null,
    lpBalance: null,
    refresh: vi.fn(),
    ...overrides,
  });
}

function mockTokenStateA(overrides = {}) {
  // Use a more flexible mock that returns the right value per token address
  mockUseToken.mockImplementation((address: string | null | undefined) => {
    if (address === getTokenAddress("WETH", 31337)) {
      return {
        symbol: "WETH" as const,
        name: "Wrapped Ether",
        decimals: 18,
        balance: 10000000000000000000n,
        allowance: 10000000000000000000n,
        refresh: mockRefreshA,
        approve: mockApproveA,
        ...overrides,
      };
    }
    if (address === getTokenAddress("USDC", 31337)) {
      return {
        symbol: "USDC" as const,
        name: "USD Coin",
        decimals: 6,
        balance: 100000000000n,
        allowance: 100000000000n,
        refresh: mockRefreshB,
        approve: mockApproveB,
        ...overrides,
      };
    }
    return {
      symbol: null,
      name: null,
      decimals: 18,
      balance: null,
      allowance: null,
      refresh: vi.fn(),
      approve: vi.fn(),
      ...overrides,
    };
  });
}

describe("AddLiquidity", () => {
  beforeEach(() => {
    mockWeb3Context();
    mockPairState();
    mockTokenStateA();
    mockLiquidityState();
    mockGetDeployment.mockReturnValue(testDeployment);
    mockIsDeploymentConfigured.mockReturnValue(true);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders token pickers and amount inputs", () => {
    render(<AddLiquidity />);
    // 4 tokens * 2 selects = 8 options
    expect(screen.getAllByRole("option")).toHaveLength(8);
    // Two text inputs (amountA and amountB)
    const inputs = screen.getAllByRole("textbox");
    expect(inputs).toHaveLength(2);
  });

  it("shows initial liquidity mode when pair does not exist", () => {
    mockPairState({ pairAddress: null });
    render(<AddLiquidity />);
    expect(
      screen.getByText("First liquidity provider — sets the initial price ratio."),
    ).toBeInTheDocument();
  });

  it("shows optimal ratio guidance and pool info when pool exists", async () => {
    const user = userEvent.setup();

    mockUseToken.mockImplementation((address: string | null | undefined) => {
      if (address === getTokenAddress("WETH", 31337)) {
        return {
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: 10000000000000000000n,
          allowance: 10000000000000000000n,
          refresh: mockRefreshA,
          approve: mockApproveA,
        };
      }
      if (address === getTokenAddress("USDC", 31337)) {
        return {
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          balance: 100000000000n,
          allowance: 100000000000n,
          refresh: mockRefreshB,
          approve: mockApproveB,
        };
      }
      return {
        symbol: null,
        name: null,
        decimals: 18,
        balance: null,
        allowance: null,
        refresh: vi.fn(),
        approve: vi.fn(),
      };
    });

    render(<AddLiquidity />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "1");
    await user.type(inputs[1], "100");

    // Should show fee tier info
    expect(screen.getByText("0.30%")).toBeInTheDocument();
  });

  it("shows a Connect wallet state when disconnected", () => {
    mockWeb3Context({ status: "idle", account: null, chainId: null, chain: null });
    render(<AddLiquidity />);
    expect(
      screen.getByRole("button", { name: /^Connect wallet$/ }),
    ).toBeDisabled();
  });

  it("shows Enter amounts when amounts are empty", () => {
    render(<AddLiquidity />);
    expect(
      screen.getByRole("button", { name: /^Enter amounts$/ }),
    ).toBeDisabled();
  });

  it("shows active position info when lpBalance > 0", () => {
    mockPairState({
      pairAddress: "0x00000000000000000000000000000000000000AA",
      lpBalance: 1000000000000000000n,
      liquidity: 10000000000000000000n,
    });
    render(<AddLiquidity />);
    // pool share = 1e18 / 1e19 * 10000 = 1000 bp = 10%
    expect(screen.getByText(/Your position/)).toBeInTheDocument();
    expect(screen.getByText(/10\.00%/)).toBeInTheDocument();
  });

  it("shows a WETH-pair hint that the user pays native ETH and the Router wraps it", () => {
    render(<AddLiquidity />);
    expect(
      screen.getByText(/You pay native ETH\. The Router will wrap it into WETH\./),
    ).toBeInTheDocument();
  });

  it("shows approve button when the non-ETH token allowance is insufficient", async () => {
    const user = userEvent.setup();

    mockUseToken.mockImplementation((address: string | null | undefined) => {
      if (address === getTokenAddress("WETH", 31337)) {
        return {
          symbol: "WETH",
          name: "Wrapped Ether",
          decimals: 18,
          balance: 10000000000000000000n,
          allowance: 0n, // WETH side uses native ETH, so allowance is ignored
          refresh: mockRefreshA,
          approve: mockApproveA,
        };
      }
      if (address === getTokenAddress("USDC", 31337)) {
        return {
          symbol: "USDC",
          name: "USD Coin",
          decimals: 6,
          balance: 100000000000n,
          allowance: 0n, // insufficient
          refresh: mockRefreshB,
          approve: mockApproveB,
        };
      }
      return {
        symbol: null,
        name: null,
        decimals: 18,
        balance: null,
        allowance: null,
        refresh: vi.fn(),
        approve: vi.fn(),
      };
    });

    render(<AddLiquidity />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "1");
    await user.type(inputs[1], "100");

    expect(
      screen.getByRole("button", { name: /^Approve USDC$/ }),
    ).toBeInTheDocument();
  });
});
