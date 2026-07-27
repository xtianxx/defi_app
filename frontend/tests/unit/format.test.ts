import { describe, it, expect } from "vitest";
import { formatTokenAmount, formatTokenAmountFixed, formatBasisPoints, parseTokenAmount, truncateAddress } from "@/lib/format";

describe("format", () => {
  describe("formatTokenAmount", () => {
    it("formats WETH (18 decimals) whole", () => {
      expect(formatTokenAmount(1_000000000000000000n, 18)).toBe("1.0");
    });

    it("formats WETH (18 decimals) fractional", () => {
      expect(formatTokenAmount(1_500000000000000000n, 18)).toBe("1.5");
    });

    it("formats USDC (6 decimals)", () => {
      expect(formatTokenAmount(1_000000n, 6)).toBe("1.0");
    });

    it("formats USDC (6 decimals) fractional", () => {
      expect(formatTokenAmount(1_500000n, 6)).toBe("1.5");
    });

    it("formats WBTC (8 decimals)", () => {
      expect(formatTokenAmount(1_00000000n, 8)).toBe("1.0");
    });

    it("formats zero", () => {
      expect(formatTokenAmount(0n, 18)).toBe("0.0");
    });

    it("formats null as dash", () => {
      expect(formatTokenAmount(null, 18)).toBe("—");
    });

    it("formats undefined as dash", () => {
      expect(formatTokenAmount(undefined, 18)).toBe("—");
    });
  });

  describe("formatTokenAmountFixed", () => {
    it("truncates to default 4 digits", () => {
      expect(formatTokenAmountFixed(1_123456789012345678n, 18)).toBe("1.1234");
    });

    it("pads with zeros when fraction is shorter than the request", () => {
      expect(formatTokenAmountFixed(1_500000000000000000n, 18, 4)).toBe("1.5000");
    });

    it("returns dash for null", () => {
      expect(formatTokenAmountFixed(null, 18)).toBe("—");
    });
  });

  describe("formatBasisPoints", () => {
    it("formats 30 bp with plus sign", () => {
      expect(formatBasisPoints(30)).toBe("+0.30%");
    });

    it("formats positive bp with plus sign", () => {
      expect(formatBasisPoints(123)).toBe("+1.23%");
    });

    it("formats negative bp with minus sign", () => {
      expect(formatBasisPoints(-456)).toBe("-4.56%");
    });

    it("formats zero bp without sign", () => {
      expect(formatBasisPoints(0)).toBe("0.00%");
    });

    it("returns dash for null", () => {
      expect(formatBasisPoints(null)).toBe("—");
    });
  });

  describe("parseTokenAmount", () => {
    it("parses 18-decimal input", () => {
      expect(parseTokenAmount("1.5", 18)).toBe(1_500000000000000000n);
    });

    it("parses 6-decimal input (USDC)", () => {
      expect(parseTokenAmount("1.5", 6)).toBe(1_500000n);
    });

    it("parses integer input", () => {
      expect(parseTokenAmount("42", 6)).toBe(42_000000n);
    });

    it("returns 0n for empty input", () => {
      expect(parseTokenAmount("", 18)).toBe(0n);
      expect(parseTokenAmount("   ", 18)).toBe(0n);
    });
  });

  describe("truncateAddress", () => {
    it("truncates 0x + 6 head + 4 tail by default", () => {
      expect(truncateAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
    });

    it("returns the address unchanged if it's short", () => {
      expect(truncateAddress("0x12")).toBe("0x12");
    });

    it("returns empty string for empty input", () => {
      expect(truncateAddress("")).toBe("");
    });
  });
});
