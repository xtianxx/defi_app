import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemoveLiquidity } from "@/components/liquidity/RemoveLiquidity";
import { getTokenAddress, KNOWN_PAIRS } from "@/lib/contracts/tokens";
import type { Deployment } from "@/lib/contracts/addresses";

const mockRemoveLiquidity = vi.hoisted(() => vi.fn());
const mockRemoveLiquidityETH = vi.hoisted(() => vi.fn());
const mockReset = vi.hoisted(() => vi.fn());
const mockUseLiquidity = vi.hoisted(() =>
  vi.fn(() => ({
    phase: "idle" as const,
    txHash: null,
    receipt: null,
    error: null,
    removeLiquidity: mockRemoveLiquidity,
    removeLiquidityETH: mockRemoveLiquidityETH,
    reset: mockReset,
  })),
);

const mockUseWeb3Context = vi.hoisted(() => vi.fn());
const mockUsePair = vi.hoisted(() => vi.fn());
const mockEstimateRemoval = vi.hoisted(() => vi.fn());

const mockGetDeployment = vi.hoisted(() => vi.fn());
const mockIsDeploymentConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/hooks/useLiquidity", () => ({
  useLiquidity: mockUseLiquidity,
  estimateRemoval: mockEstimateRemoval,
}));

vi.mock("@/hooks/usePair", () => ({
  usePair: mockUsePair,
  getAmountOut: vi.fn(),
}));

vi.mock("@/providers/Web3Provider", () => ({
  useWeb3Context: mockUseWeb3Context,
}));

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
    removeLiquidity: mockRemoveLiquidity,
    removeLiquidityETH: mockRemoveLiquidityETH,
    reset: mockReset,
    ...overrides,
  });
}

function defaultPairResult(overrides = {}) {
  return {
    pairAddress: null,
    token0: null,
    token1: null,
    reserves: null,
    price0CumulativeLast: null,
    price1CumulativeLast: null,
    liquidity: 0n,
    lpBalance: 0n,
    refresh: vi.fn(),
    ...overrides,
  };
}

function setupMockUsePair(activeKey: string | null = "USDC-DAI") {
  mockUsePair.mockImplementation((tokenA, tokenB) => {
    const usdc = getTokenAddress("USDC", 31337);
    const dai = getTokenAddress("DAI", 31337);
    const weth = getTokenAddress("WETH", 31337);
    const wbtc = getTokenAddress("WBTC", 31337);

    if (!usdc || !dai || !weth || !wbtc) return defaultPairResult();

    const key =
      tokenA === usdc && tokenB === dai
        ? "USDC-DAI"
        : tokenA === dai && tokenB === usdc
          ? "USDC-DAI"
          : tokenA === weth && tokenB === usdc
            ? "WETH-USDC"
            : tokenA === usdc && tokenB === weth
              ? "WETH-USDC"
              : null;

    if (activeKey === "USDC-DAI" && key === "USDC-DAI") {
      return defaultPairResult({
        pairAddress: "0x00000000000000000000000000000000000000AA" as `0x${string}`,
        token0: usdc,
        token1: dai,
        reserves: {
          reserve0: 1000000000n,
          reserve1: 2000000000000000000000n,
          blockTimestampLast: 0,
        },
        price0CumulativeLast: 0n,
        price1CumulativeLast: 0n,
        liquidity: 10000n,
        lpBalance: 1000n,
        refresh: vi.fn(),
      });
    }

    if (activeKey === "WETH-USDC" && key === "WETH-USDC") {
      return defaultPairResult({
        pairAddress: "0x00000000000000000000000000000000000000BB" as `0x${string}`,
        token0: weth,
        token1: usdc,
        reserves: {
          reserve0: 1000000000000000000000n,
          reserve1: 2000000000n,
          blockTimestampLast: 0,
        },
        price0CumulativeLast: 0n,
        price1CumulativeLast: 0n,
        liquidity: 10000n,
        lpBalance: 1000n,
        refresh: vi.fn(),
      });
    }

    return defaultPairResult();
  });
}

beforeEach(() => {
  mockWeb3Context();
  mockLiquidityState();
  mockGetDeployment.mockReturnValue(testDeployment);
  mockIsDeploymentConfigured.mockReturnValue(true);
  setupMockUsePair();
  mockEstimateRemoval.mockImplementation((
    liquidity: bigint,
    totalSupply: bigint,
    reserve0: bigint,
    reserve1: bigint,
    token0: `0x${string}`,
    tokenA: `0x${string}`,
  ) => {
    if (liquidity <= 0n || totalSupply <= 0n) return { amountA: 0n, amountB: 0n };
    const isTokenAZero = tokenA.toLowerCase() === token0.toLowerCase();
    const reserveA = isTokenAZero ? reserve0 : reserve1;
    const reserveB = isTokenAZero ? reserve1 : reserve0;
    return {
      amountA: (liquidity * reserveA) / totalSupply,
      amountB: (liquidity * reserveB) / totalSupply,
    };
  });
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("RemoveLiquidity", () => {
  it("renders nothing when wallet is disconnected", () => {
    mockWeb3Context({ status: "idle", account: null, chainId: null, chain: null });
    const { container } = render(<RemoveLiquidity />);
    expect(container.firstChild).toBeNull();
  });

  it("shows empty state when connected but no active positions exist", async () => {
    setupMockUsePair(null);
    render(<RemoveLiquidity />);
    await waitFor(() => {
      expect(screen.getByText("No active positions — add liquidity first.")).toBeInTheDocument();
    });
  });

  it("shows only active positions", async () => {
    const user = userEvent.setup();
    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    // Ensure no other pair rows are rendered.
    for (const pair of KNOWN_PAIRS) {
      const [a, b] = pair;
      if (a === "USDC" && b === "DAI") continue;
      const key = `${a} / ${b}`;
      expect(screen.queryByText(key)).not.toBeInTheDocument();
    }

    // LP balance shown.
    const row = screen.getByText("USDC / DAI").closest("button");
    expect(row).toHaveTextContent("LP");

    // Clicking selects the position and opens the removal panel.
    if (row) await user.click(row);
    expect(screen.getByText("Amount to remove")).toBeInTheDocument();
  });

  it("renders percentage preset buttons and custom input after selecting a position", async () => {
    const user = userEvent.setup();
    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    const row = screen.getByText("USDC / DAI").closest("button");
    if (row) await user.click(row);

    for (const preset of [25, 50, 75, 100]) {
      expect(screen.getByRole("button", { name: `${preset}%` })).toBeInTheDocument();
    }
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });

  it("shows estimated returns at 50%", async () => {
    const user = userEvent.setup();
    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    const row = screen.getByText("USDC / DAI").closest("button");
    if (row) await user.click(row);

    const fiftyButton = screen.getByRole("button", { name: "50%" });
    await user.click(fiftyButton);

    await waitFor(() => {
      expect(screen.getByText(/50\.000000 USDC/)).toBeInTheDocument();
      expect(screen.getByText(/100\.000000 DAI/)).toBeInTheDocument();
    });
  });

  it("requires confirmation for 100% removal and submits full lpBalance", async () => {
    const user = userEvent.setup();
    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    const row = screen.getByText("USDC / DAI").closest("button");
    if (row) await user.click(row);

    await user.click(screen.getByRole("button", { name: "100%" }));

    expect(screen.getByText("100% removal closes your position entirely.")).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", { name: /^Confirm closing position$/ });
    expect(confirmButton).toBeDisabled();

    const checkbox = screen.getByRole("checkbox", {
      name: "I understand — close my position",
    });
    await user.click(checkbox);
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);
    expect(mockRemoveLiquidity).toHaveBeenCalledWith(
      expect.objectContaining({
        liquidity: 1000n,
        usePermit: false,
      }),
    );
  });

  it("passes usePermit when the permit toggle is enabled", async () => {
    const user = userEvent.setup();
    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    const row = screen.getByText("USDC / DAI").closest("button");
    if (row) await user.click(row);

    await user.click(screen.getByRole("button", { name: "50%" }));

    const permitCheckbox = screen.getByRole("checkbox", {
      name: /Use permit instead of approve/,
    });
    await user.click(permitCheckbox);

    await user.click(screen.getByRole("button", { name: /^Remove Liquidity$/ }));
    expect(mockRemoveLiquidity).toHaveBeenCalledWith(
      expect.objectContaining({
        liquidity: 500n,
        usePermit: true,
      }),
    );
  });

  it("shows success feedback and resets via Remove another position", async () => {
    const user = userEvent.setup();
    mockLiquidityState({
      phase: "confirmed" as const,
      txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`,
      receipt: { status: 1 } as unknown as Awaited<ReturnType<typeof mockReset>>,
      error: null,
    });

    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    const row = screen.getByText("USDC / DAI").closest("button");
    if (row) await user.click(row);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Removed ✓" })).toBeInTheDocument();
    });
    expect(screen.getByText("Liquidity removed ✓")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove another position" }));
    expect(mockReset).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Removed ✓" })).not.toBeInTheDocument();
  });

  it("shows WETH unwrap label and note for WETH pairs", async () => {
    const user = userEvent.setup();
    setupMockUsePair("WETH-USDC");
    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("WETH / USDC")).toBeInTheDocument();
    });

    const row = screen.getByText("WETH / USDC").closest("button");
    if (row) await user.click(row);

    await user.click(screen.getByRole("button", { name: "50%" }));

    await waitFor(() => {
      expect(screen.getByText("ETH (WETH unwrap)")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /WETH will be unwrapped to ETH before it reaches your wallet\./,
      ),
    ).toBeInTheDocument();
  });

  it("displays the error message when the phase is error", async () => {
    const user = userEvent.setup();
    mockLiquidityState({
      phase: "error" as const,
      txHash: null,
      receipt: null,
      error: { code: "revert", message: "Insufficient liquidity" },
    });

    render(<RemoveLiquidity />);

    await waitFor(() => {
      expect(screen.getByText("USDC / DAI")).toBeInTheDocument();
    });

    const row = screen.getByText("USDC / DAI").closest("button");
    if (row) await user.click(row);

    await user.click(screen.getByRole("button", { name: "50%" }));

    expect(screen.getByText("Insufficient liquidity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
