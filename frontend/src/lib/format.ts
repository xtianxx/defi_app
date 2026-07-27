// formatUnits / parseUnits by token decimals. Wraps ethers v6 helpers with
// explicit decimals parameter (USDC=6, WBTC=8, ETH/WETH/DAI=18).
// Spec: frontend-module-api.md §1, data-model.md E1.

import { formatUnits, parseUnits as ethersParseUnits } from "ethers";

export function formatTokenAmount(value: bigint | null | undefined, decimals: number): string {
  if (value === null || value === undefined) return "—";
  return formatUnits(value, decimals);
}

export function parseTokenAmount(value: string, decimals: number): bigint {
  if (!value || value.trim() === "") return 0n;
  return ethersParseUnits(value.trim(), decimals);
}

/**
 * Format with a fixed number of fractional digits. Useful for UI display where
 * a long trailing decimal is unhelpful.
 */
export function formatTokenAmountFixed(value: bigint | null | undefined, decimals: number, fractionDigits = 4): string {
  if (value === null || value === undefined) return "—";
  const full = formatUnits(value, decimals);
  const [whole, frac = ""] = full.split(".");
  if (fractionDigits <= 0) return whole;
  const trimmed = (frac + "0".repeat(fractionDigits)).slice(0, fractionDigits);
  return `${whole}.${trimmed}`;
}

/**
 * Format basis points (1 bp = 0.01%) as a percentage string with sign for non-zero values.
 */
export function formatBasisPoints(bp: number | null | undefined, fractionDigits = 2): string {
  if (bp === null || bp === undefined || !Number.isFinite(bp)) return "—";
  const pct = bp / 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "-" : "";
  return `${sign}${Math.abs(pct).toFixed(fractionDigits)}%`;
}

/**
 * Truncate an address to `0x1234…abcd` style.
 */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (!address) return "";
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
