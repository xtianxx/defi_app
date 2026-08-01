# FRONTEND — Next.js 15 + React 19 + TypeScript

**Generated:** 2026-08-01

## OVERVIEW
Next.js 15 App Router dApp for the Uniswap V2 DEX (migrated from the Vite scaffold). React 19, TS 6 strict, ethers v6, @tanstack/react-query, tailwind + shadcn/ui. Talks to contracts on anvil 31337 (local) or Sepolia.

## STRUCTURE
```
src/app/            /swap /liquidity /portfolio /debug pages; api/reserves/route.ts (server-side RPC reads)
src/components/     swap/SwapWidget; liquidity/AddLiquidity, ActivePositions; wallet/Navbar, ConnectButton; ui/ (shadcn)
src/hooks/          useWeb3, useToken, usePair, useSwap, useLiquidity, useTwapPrice
src/lib/            chains.ts, rpc.ts, tx.ts, errors.ts, format.ts, utils.ts, contracts/ (bindings)
src/providers/      Web3Provider.tsx (BrowserProvider + account/chain context)
tests/              unit/ (vitest + testing-library, jsdom) · e2e/ + load/ EMPTY
scripts/            sync-deploy.ts (regenerates contract bindings from forge broadcasts)
```

## COMMANDS
- **Dev**: `npm run dev` (:3000 — needs anvil running + contracts deployed; use `../scripts/dev-deploy.sh --dev` from repo root)
- **Unit**: `npm run test` (vitest run) · `npx vitest run tests/unit/<file>` · `npm run test:watch`
- **E2E**: `npm run test:e2e` (Playwright, auto-starts dev server; seed first via `../scripts/test-e2e.sh --unit-only` or dev-deploy)
- **CI**: `npx tsc --noEmit` → `npm run lint` → `npm run test` → `npm run build` (root `.github/workflows/test.yml`)

## CONVENTIONS
- **TS6 strict**: noUnusedLocals, noUnusedParameters, erasableSyntaxOnly, verbatimModuleSyntax; `@/*` → `./src/*` in tsconfig + vitest
- **ethers v6 split**: server reads via JsonRpcProvider in route handlers; client writes via BrowserProvider from Web3Provider context (not wagmi/viem)
- **Generated bindings — never hand-edit**: `src/lib/contracts/addresses.ts`, `tokens.ts`, `abis.generated.ts` are rewritten by `node scripts/sync-deploy.ts <chainId>` (auto-finds `../contracts/broadcast/DeployDemo.s.sol/<chainId>/run-latest.json`; run `forge build` first)
- **No .env for local flow** — chains + RPC hardcoded in `lib/chains.ts` (anvil 31337, Sepolia via public `rpc.sepolia.org`)
- **route.ts handlers excluded from unit coverage** — intended for Playwright e2e (tests/e2e currently empty)

## GOTCHAS
- MetaMask against anvil: chainId 31337, RPC `http://127.0.0.1:8545`, import deployer key `0xac0974…ff80` (see `../scripts/dev-deploy.sh`)
- Unit tests mock `@/providers/Web3Provider` and `@/lib/contracts/addresses` — keep exports stable when editing them
- Playwright `webServer` runs `npm run dev` and reuses an existing server locally
