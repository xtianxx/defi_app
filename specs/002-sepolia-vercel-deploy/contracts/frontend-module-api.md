# Frontend Module API: Multi-Chain + Faucet (Sepolia/Vercel demo)

**Feature**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10
**Status**: Design (implementation phase follows)
**Spec refs**: FR-002, FR-003, FR-008, FR-011 | [research.md](../research.md) | [data-model.md](../data-model.md)

This document defines the frontend contracts ADDED or MODIFIED for the Sepolia/Vercel demo. All existing contracts from 001 (`frontend-module-api.md` §1–§9) remain unchanged unless listed here.

## 1. Chain Configuration — `src/lib/chains.ts` (MODIFIED)

```ts
export const ANVIL_CHAIN_ID = 31337;
export const SEPOLIA_CHAIN_ID = 11155111;   // NEW

CHAINS[SEPOLIA_CHAIN_ID] = {
  chainId: 11155111,
  hex: "0xaa36a7",
  name: "Sepolia",
  rpcUrl: "",                        // NEW: resolved server-side from env — see §2
  explorerUrl: "https://sepolia.etherscan.io",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};
```

**Contract**:
- `isSupportedChain(11155111)` → `true`; `getChain(11155111)` returns the entry.
- `getBlockExplorerTxUrl(11155111, hash)` → `https://sepolia.etherscan.io/tx/{hash}`.
- `rpcUrl` for Sepolia is **empty in the static config** — never baked into client-importable code (R0.2).
- Unit tests: new cases for Sepolia entries; existing anvil assertions unchanged.

## 2. Server RPC Resolution — `src/lib/rpc.ts` + `src/app/api/reserves/route.ts` (MODIFIED)

```ts
// rpc.ts — server-only resolution (never imported at client module top level)
export function createServerProvider(chainId: number): JsonRpcProvider {
  const chain = CHAINS[chainId];
  ...
  const rpcUrl = chainId === SEPOLIA_CHAIN_ID
    ? process.env.SEPOLIA_RPC_URL           // server-only env var (Vercel: Production+Preview)
    : chain.rpcUrl;
  if (!rpcUrl) throw new Error(`SEPOLIA_RPC_URL not configured`);
  return new JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
}
```

**Contract**:
- `process.env.SEPOLIA_RPC_URL` is read **inside the server function** — never at module top level, never in a client-imported path, never `NEXT_PUBLIC_`-prefixed.
- `/api/reserves?pair=&account=&chainId=11155111` serves Sepolia data; missing env → HTTP 500 with clear message (edge case "RPC slow/unavailable" → existing 502/`Retry-After` path covers runtime failure).
- Default `chainId` stays `ANVIL_CHAIN_ID` (regression).

## 3. Generated Bindings — `sync-deploy.ts` + `addresses.ts`/`tokens.ts` (MODIFIED)

```ts
// sync-deploy.ts
const chainIds = [ANVIL_CHAIN_ID, SEPOLIA_CHAIN_ID];   // NEW: 11155111

export interface Deployment {            // addresses.ts (generated)
  factory: `0x${string}`;
  router: `0x${string}`;
  weth: `0x${string}`;
  faucet: `0x${string}`;                 // NEW field
  tokens: { WETH; USDC; DAI; WBTC };
}
// DEPLOYMENTS: { 31337: {...}, 11155111: {...} }   // NEW multi-chain keys
// tokens.ts addressByChain: { 31337: addr|null, 11155111: addr|null }  // NEW
```

**Contract**:
- `getDeployment(11155111)` returns the Sepolia deployment after `sync-deploy 11155111` runs (broadcast JSON at `contracts/broadcast/DeployDemoSepolia.s.sol/11155111/run-latest.json`).
- `isDeploymentConfigured` unchanged (factory/router/weth non-zero) — Sepolia passes after deploy.
- Missing broadcast for a chain → ZERO addresses for that chain only (never clobbers the other chain's committed values).
- Generated files remain **tracked and committed** with Sepolia addresses (testnet-public; R0.2/D7).
- `abis.ts` gains `DemoFaucet_ABI` export (curated, tracked).

## 4. Faucet Page — `src/app/faucet` + `src/components/faucet/FaucetWidget.tsx` (NEW)

**Page contract** (US3-1..US3-3, FR-011):
- Not connected → connect prompt (US3-2), no request button.
- Connected + eligible → grant table (amounts from contract constants) + **Claim** button.
- Connected + in-window → countdown from `nextEligibleTime` ("下次可领取: 23h 12m 后"), button disabled (US3-3).
- Success → confirmation with tx explorer link (US3-1: confirm within one minute).
- Wrong network → network-mismatch message with switch guidance (FR-003, US1-4).

**Component contract** — `FaucetWidget` props: `{ deployment: Deployment }`; renders phases from `useFaucet`.

## 5. Faucet Hook — `src/hooks/useFaucet.ts` (NEW)

Mirrors `useSwap` phase machine (001 conventions):

```ts
type FaucetPhase = "idle" | "claiming" | "mining" | "confirmed" | "reverted" | "rejected" | "error";

interface UseFaucetResult {
  phase: FaucetPhase;
  txHash: `0x${string}` | null;
  error: { code: ErrorCode; message: string } | null;
  nextEligibleTime: bigint | null;      // from contract view; drives countdown
  grantAmounts: { symbol: string; amount: string }[];  // constants from contract
  claim: () => Promise<void>;           // validate chain → request() → waitForReceipt
  reset: () => void;
}
```

**Contract**:
- `claim()` preconditions: signer + account + `chainId === 11155111` (or anvil) + `isDeploymentConfigured` + signer network matches context chainId (mirror useSwap §4.3).
- Calls `DemoFaucet.request()` via `DemoFaucet_ABI`; waits for receipt via existing `waitForReceipt`; classifies via `decodeError` (user-rejection → `rejected`; rate-limit revert → `error` with countdown message).
- Unit tests: phase transitions, rate-limited revert mapping, `nextEligibleTime` formatting, wrong-network gate (mock Web3Provider + addresses per 001 test conventions).

## 6. Network Mismatch Messaging (MODIFIED — verify/adjust)

**Contract** (US1-4, FR-003, FR-011):
- Wallet on mainnet/other chain → explicit message: "请切换到 Sepolia 测试网" + how-to-switch steps (MetaMask network add: chainId 11155111, RPC from provider docs — note: the PUBLIC RPC for wallet config is documented in the demo guide, distinct from the server-only env key).
- Existing `decodeError` `wrong-network` code reused; `isSupportedChain` now accepts 11155111.

## 7. Testing Contract

| Layer | Test | Status |
|---|---|---|
| chains.ts | Sepolia entries; `isSupportedChain`; tx URL | NEW Vitest cases |
| rpc.ts | server provider env resolution (mock env) | NEW Vitest cases |
| addresses/tokens | multi-chain lookup, ZERO-handling | NEW Vitest cases |
| useFaucet | phases, reverts, countdown | NEW Vitest suite |
| reserves route | chainId=11155111 fetch (mock provider) | Existing pattern extended |
| E2E | none for live Sepolia (flaky) — quickstart manual scenarios | — |

## 8. Vercel Deployment Contract (FR-002, FR-010)

```text
1. Import repo on Vercel → Root Directory: frontend/ (framework auto-detected: Next.js)
2. Project → Settings → Environment Variables:
     SEPOLIA_RPC_URL = https://sepolia.g.alchemy.com/v2/<KEY>   (Production + Preview; no NEXT_PUBLIC_)
3. Production branch: main → auto-deploy on push (no vercel.json, no CI wiring)
4. Verify: production URL loads; /api/reserves?chainId=11155111 returns live Sepolia data
```

Gotchas (R0.2): Hobby cannot link GitHub **org** repos; logs retained 1 h; env changes apply to new deployments only.
