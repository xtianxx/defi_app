import { describe, it, expect } from "vitest";
import { estimateFeesEarned, type MintBurnTotals } from "@/lib/fees";

const zero: MintBurnTotals = { minted0: 0n, minted1: 0n, burned0: 0n, burned1: 0n };

describe("estimateFeesEarned", () => {
  it("returns claimable - minted when nothing was burned", () => {
    // 10% share; reserves grew 1_000_000 -> 1_100_000 via swap fees
    const result = estimateFeesEarned({
      lpBalance: 1000n,
      reserve0: 1100000n,
      reserve1: 2200000n,
      totalSupply: 10000n,
      totals: { ...zero, minted0: 100000n, minted1: 200000n },
    });
    expect(result.feesEarned0).toBe(10000n); // 110000 - 100000
    expect(result.feesEarned1).toBe(20000n); // 220000 - 200000
  });

  it("adds burned amounts back (burning returns principal + accrued fees)", () => {
    // claimable 60/120, burned 55/110, minted 100/200 -> 15/30
    const result = estimateFeesEarned({
      lpBalance: 50n,
      reserve0: 120n,
      reserve1: 240n,
      totalSupply: 100n,
      totals: { minted0: 100n, minted1: 200n, burned0: 55n, burned1: 110n },
    });
    expect(result.feesEarned0).toBe(15n);
    expect(result.feesEarned1).toBe(30n);
  });

  it("clamps negative estimates to zero (LP tokens transferred away)", () => {
    const result = estimateFeesEarned({
      lpBalance: 100n,
      reserve0: 100000n,
      reserve1: 200000n,
      totalSupply: 1000n,
      totals: { ...zero, minted0: 100000n, minted1: 200000n },
    });
    expect(result.feesEarned0).toBe(0n);
    expect(result.feesEarned1).toBe(0n);
  });

  it("returns zero when totalSupply is zero", () => {
    const result = estimateFeesEarned({
      lpBalance: 100n,
      reserve0: 100000n,
      reserve1: 200000n,
      totalSupply: 0n,
      totals: zero,
    });
    expect(result).toEqual({ feesEarned0: 0n, feesEarned1: 0n });
  });
});
