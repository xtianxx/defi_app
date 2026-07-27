// Token configuration for the demo set. Addresses are placeholders
// until sync-deploy.ts fills them in from the broadcast artifact.
// Spec: contracts/frontend-module-api.md §2, data-model.md E1.

export interface TokenConfig {
  symbol: "WETH" | "USDC" | "DAI" | "WBTC";
  name: string;
  decimals: number;
  /** Per-chain address. `null` until sync-deploy fills in. */
  addressByChain: Record<number, `0x${string}` | null>;
}

const PLACEHOLDER = "0x0000000000000000000000000000000000000000" as const;

function emptyAddresses(): Record<number, `0x${string}` | null> {
  return { 31337: null, 11155111: null };
}

export const TOKENS: Record<TokenConfig["symbol"], TokenConfig> = {
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    addressByChain: emptyAddresses(),
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    addressByChain: emptyAddresses(),
  },
  DAI: {
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    addressByChain: emptyAddresses(),
  },
  WBTC: {
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    addressByChain: emptyAddresses(),
  },
};

export const TOKEN_LIST: TokenConfig[] = Object.values(TOKENS);

/** Known 6 demo pairs per spec T044. Order is the user-facing display order. */
export const KNOWN_PAIRS: ReadonlyArray<readonly [TokenConfig["symbol"], TokenConfig["symbol"]]> = [
  ["WETH", "USDC"],
  ["WETH", "DAI"],
  ["WETH", "WBTC"],
  ["USDC", "DAI"],
  ["USDC", "WBTC"],
  ["DAI", "WBTC"],
];

export function getToken(symbol: TokenConfig["symbol"]): TokenConfig {
  return TOKENS[symbol];
}

export function getTokenAddress(symbol: TokenConfig["symbol"], chainId: number): `0x${string}` | null {
  return TOKENS[symbol].addressByChain[chainId] ?? null;
}

/** Returns true only if the address is a non-zero, valid-looking hex string. */
export function isValidAddress(addr: string | null | undefined): addr is `0x${string}` {
  return typeof addr === "string" && addr.length === 42 && addr.startsWith("0x") && addr !== PLACEHOLDER;
}
