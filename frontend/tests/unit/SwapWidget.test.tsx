import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SwapWidget } from "@/components/swap/SwapWidget";
import { getTokenAddress } from "@/lib/contracts/tokens";
import type { Deployment } from "@/lib/contracts/addresses";

const mockSetParams = vi.hoisted(() => vi.fn());
const mockExecute = vi.hoisted(() => vi.fn());
const mockReset = vi.hoisted(() => vi.fn());
const mockUseSwap = vi.hoisted(() =>
  vi.fn(() => ({
    tokenIn: null,
    tokenOut: null,
    amountIn: null,
    amountOutEstimated: null,
    priceImpactPctBp: null,
    feePctBp: 30,
    phase: "idle" as const,
    txHash: null,
    receipt: null,
    error: null,
    setParams: mockSetParams,
    execute: mockExecute,
    reset: mockReset,
  })),
);

const mockUseWeb3Context = vi.hoisted(() => vi.fn());
const mockUsePair = vi.hoisted(() => vi.fn());
const mockApprove = vi.hoisted(() => vi.fn());
const mockRefresh = vi.hoisted(() => vi.fn());
const mockUseToken = vi.hoisted(() =>
  vi.fn(() => ({
    symbol: "WETH" as const,
    name: "Wrapped Ether",
    decimals: 18,
    balance: 10000000000000000000n,
    allowance: 10000000000000000000n,
    refresh: mockRefresh,
    approve: mockApprove,
  })),
);

const mockGetDeployment = vi.hoisted(() => vi.fn());
const mockIsDeploymentConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/hooks/useSwap", () => ({ useSwap: mockUseSwap }));
vi.mock("@/hooks/usePair", () => ({ usePair: mockUsePair, getAmountOut: vi.fn() }));
vi.mock("@/hooks/useToken", () => ({ useToken: mockUseToken }));
vi.mock("@/providers/Web3Context", () => ({ useWeb3Context: mockUseWeb3Context }));
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

function mockSwapState(overrides = {}) {
  mockUseSwap.mockReturnValue({
    tokenIn: null,
    tokenOut: null,
    amountIn: null,
    amountOutEstimated: null,
    priceImpactPctBp: null,
    feePctBp: 30,
    phase: "idle" as const,
    txHash: null,
    receipt: null,
    error: null,
    setParams: mockSetParams,
    execute: mockExecute,
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

function mockTokenState(overrides = {}) {
  mockUseToken.mockReturnValue({
    symbol: "WETH" as const,
    name: "Wrapped Ether",
    decimals: 18,
    balance: 10000000000000000000n,
    allowance: 10000000000000000000n,
    refresh: mockRefresh,
    approve: mockApprove,
    ...overrides,
  });
}

describe("SwapWidget", () => {
  beforeEach(() => {
    mockWeb3Context();
    mockPairState();
    mockTokenState();
    mockSwapState();
    mockGetDeployment.mockReturnValue(testDeployment);
    mockIsDeploymentConfigured.mockReturnValue(true);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders token pickers limited to 4 demo tokens", () => {
    render(<SwapWidget />);
    expect(screen.getAllByRole("option")).toHaveLength(8);
    for (const symbol of ["WETH", "USDC", "DAI", "WBTC"]) {
      expect(
        screen.getAllByRole("option", { name: new RegExp(symbol) }),
      ).toHaveLength(2);
    }
  });

  it("parses amountIn input with token decimals and calls setParams", async () => {
    const user = userEvent.setup();
    render(<SwapWidget />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "1");

    const weth = getTokenAddress("WETH", 31337);
    const usdc = getTokenAddress("USDC", 31337);
    expect(weth).not.toBeNull();
    expect(usdc).not.toBeNull();

    expect(mockSetParams).toHaveBeenLastCalledWith(
      weth,
      usdc,
      1000000000000000000n,
    );
  });

  it("displays the estimated output formatted to 6 decimals", () => {
    mockSwapState({ amountOutEstimated: 2000000n });
    render(<SwapWidget />);
    expect(screen.getByDisplayValue("2.000000")).toBeInTheDocument();
  });

  it("shows price impact and 0.30% fee when amount is entered", async () => {
    const user = userEvent.setup();
    mockSwapState({ amountOutEstimated: 1000000n, priceImpactPctBp: 50 });
    render(<SwapWidget />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "1");

    expect(screen.getByText("+0.50%")).toBeInTheDocument();
    expect(screen.getByText("+0.50%")).toHaveClass("text-green-600");
    expect(screen.getByText("0.30%")).toBeInTheDocument();
  });

  it("shows an Approve button when token allowance is below amountIn", async () => {
    const user = userEvent.setup();
    mockTokenState({ allowance: 0n });
    mockPairState({
      reserves: {
        reserve0: 1000n * 10n ** 18n,
        reserve1: 1000n * 10n ** 6n,
        blockTimestampLast: 0,
      },
    });
    mockSwapState({ amountOutEstimated: 1000000n });
    render(<SwapWidget />);
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "1");

    expect(screen.getByRole("button", { name: /^Approve$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Approve first$/ })).toBeDisabled();
  });

  it("enables Swap only when connected, amount entered, and pool exists", async () => {
    const user = userEvent.setup();
    mockPairState({
      token0: getTokenAddress("WETH", 31337),
      token1: getTokenAddress("USDC", 31337),
      reserves: {
        reserve0: 1000n * 10n ** 18n,
        reserve1: 1000n * 10n ** 6n,
        blockTimestampLast: 0,
      },
    });
    mockSwapState({ amountOutEstimated: 1000000n });

    // Disconnected
    mockWeb3Context({ status: "idle", account: null, chainId: null, chain: null });
    const { unmount } = render(<SwapWidget />);
    expect(screen.getByRole("button", { name: /^Connect wallet$/ })).toBeDisabled();
    unmount();

    // Connected but no amount
    mockWeb3Context();
    render(<SwapWidget />);
    expect(screen.getByRole("button", { name: /^Enter amount$/ })).toBeDisabled();

    // Amount entered and pool exists
    const inputs = screen.getAllByRole("textbox");
    await user.type(inputs[0], "1");
    expect(screen.getByRole("button", { name: /^Swap$/ })).toBeEnabled();
  });

  it("shows insufficient-liquidity guidance and disables Swap for a zero quote", async () => {
    const user = userEvent.setup();
    mockTokenState({ allowance: 0n });
    mockPairState({
      token0: getTokenAddress("WETH", 31337),
      token1: getTokenAddress("USDC", 31337),
      reserves: {
        reserve0: 1n,
        reserve1: 1n,
        blockTimestampLast: 0,
      },
    });
    mockSwapState({ amountOutEstimated: 0n });

    render(<SwapWidget />);
    await user.type(screen.getAllByRole("textbox")[0], "2");

    expect(
      screen.getByText("Insufficient liquidity for this swap amount."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add Liquidity/i })).toHaveAttribute(
      "href",
      "/liquidity",
    );
    expect(
      screen.getByRole("button", { name: /^Insufficient liquidity$/ }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Approve first$/ })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("0.000000")).not.toBeInTheDocument();
  });

  it("shows no-usable-liquidity guidance and disables Swap for empty reserves", async () => {
    const user = userEvent.setup();
    mockPairState({
      token0: getTokenAddress("WETH", 31337),
      token1: getTokenAddress("USDC", 31337),
      reserves: {
        reserve0: 0n,
        reserve1: 0n,
        blockTimestampLast: 0,
      },
    });

    render(<SwapWidget />);
    await user.type(screen.getAllByRole("textbox")[0], "1");

    expect(screen.getByText("This pool has no liquidity available.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^No liquidity$/ })).toBeDisabled();
  });

  it("shows pool-empty message and Add Liquidity link when pair does not exist", () => {
    mockPairState({ pairAddress: null });
    render(<SwapWidget />);
    expect(
      screen.getByText("No liquidity pool for this pair yet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^No pool$/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Add Liquidity/i })).toHaveAttribute(
      "href",
      "/liquidity",
    );
  });

  it("renders an error banner for error codes but stays silent on rejection", () => {
    mockSwapState({
      error: {
        code: "slippage",
        message: "Slippage exceeded",
        hint: "Try a higher slippage tolerance or a smaller trade.",
      },
      phase: "error",
    });
    render(<SwapWidget />);
    expect(screen.getByText("Slippage exceeded")).toBeInTheDocument();
    expect(
      screen.getByText("Try a higher slippage tolerance or a smaller trade."),
    ).toBeInTheDocument();

    cleanup();

    mockSwapState({ error: null, phase: "rejected" });
    render(<SwapWidget />);
    expect(screen.queryByText("Slippage exceeded")).not.toBeInTheDocument();
  });
});
