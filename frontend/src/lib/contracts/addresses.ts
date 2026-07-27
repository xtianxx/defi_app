// Per-chain deployed contract addresses. Populated by scripts/sync-deploy.ts
// after a `forge script ... --broadcast` run; defaults to placeholder zeros
// until then. Spec: contracts/frontend-module-api.md §9, research.md R0.9.

import { ANVIL_CHAIN_ID, SEPOLIA_CHAIN_ID } from "../chains";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export interface Deployment {
  factory: `0x${string}`;
  router: `0x${string}`;
  weth: `0x${string}`;
  tokens: {
    WETH: `0x${string}`;
    USDC: `0x${string}`;
    DAI: `0x${string}`;
    WBTC: `0x${string}`;
  };
}

export const DEPLOYMENTS: Record<number, Deployment> = {
  [ANVIL_CHAIN_ID]: {
    factory: ZERO,
    router: ZERO,
    weth: ZERO,
    tokens: { WETH: ZERO, USDC: ZERO, DAI: ZERO, WBTC: ZERO },
  },
  [SEPOLIA_CHAIN_ID]: {
    factory: ZERO,
    router: ZERO,
    weth: ZERO,
    tokens: { WETH: ZERO, USDC: ZERO, DAI: ZERO, WBTC: ZERO },
  },
};

export function getDeployment(chainId: number | null): Deployment | null {
  if (chainId === null) return null;
  return DEPLOYMENTS[chainId] ?? null;
}

export function isDeploymentConfigured(d: Deployment | null | undefined): d is Deployment {
  if (!d) return false;
  return d.factory !== ZERO && d.router !== ZERO && d.weth !== ZERO;
}
