// Chain configuration for the Uniswap V2 Resume dApp.
// Spec: contracts/frontend-module-api.md §1, research.md R0.1.

export interface ChainConfig {
  chainId: number;
  hex: `0x${string}`;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export const ANVIL_CHAIN_ID = 31337;
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_HEX = "0xaa36a7" as const;

export const CHAINS: Record<number, ChainConfig> = {
  [ANVIL_CHAIN_ID]: {
    chainId: ANVIL_CHAIN_ID,
    hex: "0x7a69" as `0x${string}`,
    name: "Anvil (local)",
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "http://127.0.0.1:8545",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  },
  [SEPOLIA_CHAIN_ID]: {
    chainId: SEPOLIA_CHAIN_ID,
    hex: SEPOLIA_HEX,
    name: "Sepolia",
    rpcUrl: "https://rpc.sepolia.org",
    explorerUrl: "https://sepolia.etherscan.io",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  },
};

export function isSupportedChain(chainId: number | null): chainId is number {
  return chainId !== null && chainId in CHAINS;
}

export function getChain(chainId: number | null): ChainConfig | null {
  if (chainId === null) return null;
  return CHAINS[chainId] ?? null;
}

export function getBlockExplorerTxUrl(chainId: number, txHash: `0x${string}`): string | null {
  const chain = CHAINS[chainId];
  if (!chain) return null;
  return `${chain.explorerUrl}/tx/${txHash}`;
}
