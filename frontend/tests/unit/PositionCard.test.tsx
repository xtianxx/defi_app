import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PositionCard, type PositionCardProps } from "@/components/portfolio/PositionCard";

const PAIR_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;

const defaultProps: PositionCardProps = {
  pairAddress: PAIR_ADDRESS,
  token0Symbol: "WETH",
  token1Symbol: "USDC",
  token0Decimals: 18,
  token1Decimals: 6,
  reserve0: 1000000000000000000000n,
  reserve1: 2000000000000n,
  totalSupply: 10000n,
  lpBalance: 1000n,
};

function props(overrides: Partial<PositionCardProps> = {}): PositionCardProps {
  return { ...defaultProps, ...overrides };
}

describe("PositionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("computes sharePctBp = lpBalance * 10000 / totalSupply and shows the pool share", () => {
    // lpBalance=1000, totalSupply=10000 → sharePctBp = 1000 → 10.00%
    render(<PositionCard {...props({ lpBalance: 1000n, totalSupply: 10000n })} />);
    expect(screen.getByText("10.00%")).toBeInTheDocument();
  });

  it("computes depositedAmount0/1 = reserve * lpBalance / totalSupply", () => {
    // reserve0=1000000, reserve1=2000000, lpBalance=100, totalSupply=1000
    // → depositedAmount0 = 100000, depositedAmount1 = 200000
    render(
      <PositionCard
        {...props({
          reserve0: 1000000n,
          reserve1: 2000000n,
          lpBalance: 100n,
          totalSupply: 1000n,
        })}
      />,
    );
    // formatTokenAmountFixed(100000n, 18, 4) = "0.0000",
    // formatTokenAmountFixed(200000n, 6, 4) = "0.2000"
    expect(screen.getByText("0.0000 WETH")).toBeInTheDocument();
    expect(screen.getByText("0.2000 USDC")).toBeInTheDocument();
  });

  it("shows formatted fee estimates when fees are provided", () => {
    render(
      <PositionCard
        {...props({ feesEarned0: 5000n, feesEarned1: 3000n })}
      />,
    );
    // formatTokenAmountFixed(5000n, 18, 4) = "0.0000"
    expect(screen.getByText("0.0000 WETH")).toBeInTheDocument();
    // formatTokenAmountFixed(3000n, 6, 4) = "0.0030"
    expect(screen.getByText("0.0030 USDC")).toBeInTheDocument();
    expect(screen.queryByText("Fees tracked via event history")).toBeNull();
  });

  it("shows a dash and a hint when fee data is missing", () => {
    render(<PositionCard {...props({ feesEarned0: null, feesEarned1: null })} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("Fees tracked via event history")).toBeInTheDocument();
  });

  it("displays both pool token symbols", () => {
    render(<PositionCard {...props()} />);
    expect(screen.getByText("WETH / USDC")).toBeInTheDocument();
  });

  it("renders an animated skeleton while loading and no position data", () => {
    const { container } = render(<PositionCard {...props({ isLoading: true })} />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    expect(screen.queryByText("WETH / USDC")).toBeNull();
    expect(screen.queryByText(/LP$/)).toBeNull();
  });

  it("renders nothing when lpBalance is zero or negative", () => {
    const { container } = render(<PositionCard {...props({ lpBalance: 0n })} />);
    expect(container.firstChild).toBeNull();
  });

  it("links to /liquidity?pair=<pairAddress> for managing the position", () => {
    render(<PositionCard {...props()} />);
    const link = screen.getByRole("link", { name: "Manage liquidity" });
    expect(link.getAttribute("href")).toContain(`/liquidity?pair=${PAIR_ADDRESS}`);
  });
});
