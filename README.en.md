# Uniswap V2–Style DEX — Resume Project

[中文版](README.md) | English

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

A Uniswap V2–style decentralized exchange (DEX) built as a resume/portfolio project: an
on-chain AMM with constant-product pricing (`x·y=k`), a 0.3% swap fee, TWAP price oracles,
and a full web dApp that connects to it via MetaMask.

The repository is a two-package monorepo:

- **`contracts/`** — Foundry project re-implementing Uniswap V2 core (`Factory`, `Pair`, LP
  `ERC20`) and a simplified periphery (`Router02`, `WETH9`, `UniswapV2Library`,
  `TransferHelper`), excluding flash swaps and multi-hop routing.
- **`frontend/`** — Next.js 15 (App Router) dApp: swap, add/remove liquidity, and a
  portfolio view backed by on-chain TWAP-only prices. ethers v6, React 19, Tailwind +
  shadcn/ui, Vitest + Playwright.

The dev loop deploys to local `anvil` (chainId 31337, deterministic). No real
value is ever at risk; the public demo runs on the Sepolia testnet and is hosted
on Vercel (see "Sepolia Testnet / Vercel Deployment" below).

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ contracts/  (Foundry, Solidity ^0.8.19, viaIR + optimizer 200 runs)      │
│                                                                          │
│   src/core/     Factory · Pair · ERC20 (LP) · Math · SafeMath · UQ112x112│
│   src/router/   Router02 · WETH9 · UniswapV2Library · TransferHelper     │
│   script/       DeployDemo.s.sol (Factory + Router + WETH9 + 4 tokens,   │
│                 2 seeded pairs)                                          │
│                                                                          │
│   forge build ──► out/ (ABIs + build artifacts)                          │
│   forge script --broadcast ──► broadcast/<chainId>/run-latest.json       │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │                               │
                │ out/ ABIs                     │ broadcast/ addresses
                ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ frontend/scripts/sync-deploy.ts   (argless; chainIds hardcoded in script)   │
│   regenerates src/lib/contracts/{addresses,tokens}.ts                     │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ frontend/  (Next.js 15 App Router)                                       │
│   src/lib/contracts/addresses.ts   per-chain DEPLOYMENTS (anvil)         │
│   src/lib/contracts/abis.ts        ABI bindings for the dApp             │
│   src/app/  /swap · /liquidity · /portfolio · /debug                     │
└──────────────────────────────────────────────────────────────────────────┘
```

The two packages are coupled only through generated artifacts: ABI exports from
`contracts/out/` and per-chain deployed addresses from `broadcast/` run files. There is no
root workspace tool — the packages are independent (see the `specs/` design docs for the
full structure).

## Prerequisites

- **Foundry** (forge, cast, anvil):
  `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **Node.js ≥ 20** and a package manager (npm/pnpm/bun)
- **MetaMask** (or any EIP-1193 wallet) for browser flows

## Quickstart — Local anvil (primary dev loop)

The full runnable guide is [specs/001-uniswap-v2-resume/quickstart.md](specs/001-uniswap-v2-resume/quickstart.md);
the canonical dev loop is:

```bash
# A.1 — start a local chain (keep this terminal open)
anvil --chain-id 31337 --port 8545

# A.2 — deploy the demo (Factory, Router02, WETH9, 4 tokens, 2 seeded pairs)
cd contracts
forge install                                   # if contracts/lib is empty
forge build
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  -vvv

# A.3 — sync deployed addresses + ABIs into the frontend
cd ../frontend
npm run sync-deploy

# A.4 — run the frontend
npm install
npm run dev                                     # http://localhost:3000

# A.5 — browser validation (manual)
#   Connect MetaMask to anvil (chainId 31337, RPC http://127.0.0.1:8545),
#   swap WETH → USDC on /swap, approve + confirm, check the empty
#   USDC/DAI pool edge case, add liquidity on /liquidity, and verify
#   positions + fees on /portfolio.

# A.6 — automated validation (CI parity)
cd ../contracts
forge fmt --check
forge build --sizes
forge test -vvv
forge test --coverage
forge snapshot
cd ../frontend
npm run lint
npm run test
npm run test:e2e
```

### One-command quick start (deploy scripts)

Instead of the manual steps above, use the deploy script to start a full local
environment in one command:

```bash
# Start a fresh anvil → deploy the demo → sync addresses → verify swap-ready
# (leaves anvil running so the frontend can connect)
./scripts/dev-deploy.sh

# Same, plus start the frontend dev server (Ctrl+C stops everything)
./scripts/dev-deploy.sh --dev
```

`dev-deploy.sh` is the quick-deployment script: it restarts a clean anvil (chainId
31337, port 8545), deploys the demo (Factory, Router02, WETH9, 4 tokens, 2 seeded
pairs), regenerates the frontend bindings via `sync-deploy.ts`, and verifies the
deployer can swap. After it finishes, run `cd frontend && npm run dev` (unless you
used `--dev`) and open http://localhost:3000.

`./scripts/test-e2e.sh --dev` and `./scripts/test-e2e-phase5.sh --dev` are
alternative quick-start paths with the same anvil + deploy + sync + dev-server
flow, without running any tests.

## Deployment targets

- **Local dev/testing** — anvil (chainId 31337, deterministic dev loop); see the
  Quickstart section above.
- **Public demo** — Sepolia testnet (chainId 11155111) + Vercel hosting; see below.

## Sepolia Testnet / Vercel Deployment (public demo)

The public demo environment: contracts deployed on the **Sepolia testnet** (chainId
11155111) and verified on Etherscan, frontend publicly hosted on **Vercel**. The
interview demo script, demo accounts and deployed addresses live in
[specs/002-sepolia-vercel-deploy/demo-guide.md](specs/002-sepolia-vercel-deploy/demo-guide.md);
the full validation scenarios (public access, demo accounts, in-app faucet, local
regression, reproducibility) are in
[specs/002-sepolia-vercel-deploy/quickstart.md](specs/002-sepolia-vercel-deploy/quickstart.md).

The whole deployment can be reproduced in **≤ 30 minutes** with the 6 steps below:

| # | Step | Time budget |
|---|---|---|
| 1 | Generate 3 fresh demo-account keys (master / LP provider / swapper): `cast wallet new`, record the addresses (never reuse anvil's well-known keys) | ~3 min |
| 2 | Fund the master via public Sepolia faucets (0.25–0.5 ETH; faucet ladder in research.md) | ~5 min |
| 3 | One-shot deploy + seed + verify: `forge script script/DeployDemoSepolia.s.sol --broadcast --verify --slow` (with `SEPOLIA_RPC_URL` / `ETHERSCAN_API_KEY` exported) | ~10 min |
| 4 | Regenerate and commit frontend bindings: `npm run sync-deploy` (argless, multi-chain) → `git add` + commit | ~2 min |
| 5 | Import the repo on Vercel: Root Directory = `frontend/`, env var `SEPOLIA_RPC_URL` (Production + Preview) | ~5 min |
| 6 | Replenish demo accounts (primary path): `./scripts/sepolia-deploy.sh fund-demo-accounts` | ~5 min |

Total: ~30 minutes.

```bash
# 1. Generate demo-account keys (× 3)
cast wallet new

# 2. Fund master via public Sepolia faucets (ladder in research.md)

# 3. One-shot deploy + seed + Etherscan verification (from contracts/; --verify auto-decodes constructor args)
export SEPOLIA_RPC_URL=... ETHERSCAN_API_KEY=...
forge script script/DeployDemoSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast \
  --verify --etherscan-api-key "$ETHERSCAN_API_KEY" --slow -vvv

# 4. Regenerate frontend bindings (argless, multi-chain) and commit
cd ../frontend && npm run sync-deploy
git add frontend/src/lib/contracts/addresses.ts frontend/src/lib/contracts/tokens.ts && git commit

# 5. Vercel: import repo → Root Directory: frontend/ → env SEPOLIA_RPC_URL (Production + Preview) → Deploy

# 6. Replenish demo accounts (primary path)
./scripts/sepolia-deploy.sh fund-demo-accounts
```

After deployment: every contract address from step 3 shows verified source code on
`sepolia.etherscan.io`; a fresh browser at the Vercel URL connects via
MetaMask (Sepolia network added) and loads live on-chain balances and prices.

`./scripts/sepolia-deploy.sh` (no subcommand) runs the whole deployment in one
shot: preflight (`contracts/.env`, toolchain, master balance) → `forge build` →
dry-run simulation against live Sepolia (nothing broadcast) → `--broadcast
--verify --slow` → `sync-deploy.ts` → summary table of deployed addresses and
verification status.

### Environment variables (server-only, never `NEXT_PUBLIC_`)

| Variable | Purpose | Notes |
|---|---|---|
| `SEPOLIA_RPC_URL` | Sepolia RPC endpoint (Alchemy/Infura free tier) | Used by forge for deploys; read server-side by the frontend `/api/reserves` route (`createServerProvider()`) — **server-only, never prefix with `NEXT_PUBLIC_`**; configure on Vercel for Production + Preview |
| `ETHERSCAN_API_KEY` | Free Etherscan API key | Used by `--verify` for contract verification |
| `SEPOLIA_DEPLOYER_KEY` | Master deployer private key | Deployer + funding source; **never documented anywhere** (demo-guide.md only records demo-account addresses) |

All live in the **gitignored** `contracts/.env` (template: `contracts/.env.example`),
read by `sepolia-deploy.sh` and referenced only via variables — never inlined into
commands or commits. Same rule on the frontend: environment variables are read by
server-side route handlers only; the client never depends on any env var.

## Contract addresses

Deployed addresses are generated by `scripts/sync-deploy.ts` into
`frontend/src/lib/contracts/addresses.ts` as a per-chain `DEPLOYMENTS` record (anvil
31337 + Sepolia 11155111), populated from the Foundry `broadcast/` run-latest JSON of the deploy script. Re-run `sync-deploy.ts` after any redeploy — `broadcast/` is gitignored and
the generated files are tracked.

Deploy scripts: `contracts/script/DeployDemo.s.sol` (main demo),
`contracts/script/core/DeployFactory.s.sol`, `contracts/script/router/DeployRouter.s.sol`.

## Testing

**Contracts** (from `contracts/`):

```bash
forge fmt --check        # formatting
forge build --sizes      # Router02 must stay under the 24 KB EIP-170 limit
forge test -vvv          # all tests green
forge test --coverage    # ≥ 95% line coverage
forge snapshot           # gas baseline; CI diffs with --check
```

**Frontend** (from `frontend/`):

```bash
npm run lint             # ESLint
npx tsc --noEmit         # TypeScript strict
npm run test             # Vitest unit + component
npm run build            # Next.js production build
npm run test:e2e         # Playwright against a local anvil chain
```

**Root scripts** (canonical dev loop):

| Script | Purpose |
|---|---|
| `./scripts/test-unit.sh` | forge test + vitest (both packages) |
| `./scripts/test-e2e.sh` | Fresh anvil → DeployDemo → sync → forge test → vitest → build + Playwright |
| `./scripts/test-e2e-phase5.sh` | US3 (liquidity-removal) loop with an LP-readiness gate |
| `./scripts/dev-deploy.sh` | **Quick deploy**: fresh anvil → deploy → sync → verify; leaves anvil running for the frontend (`--dev` also starts `npm run dev`) |

## CI

GitHub Actions (`.github/workflows/test.yml`) runs, per push/PR: contracts
`forge fmt --check` → `forge build --sizes` → `forge test -vvv` (+ coverage and gas
snapshot when artifacts exist), and frontend `tsc --noEmit` → `npm run lint` →
`npm run test` → `npm run build`.

## Repository structure

```text
contracts/      Foundry project (core + router + DeployDemo scripts + tests)
frontend/       Next.js 15 App Router dApp (pages, hooks, generated bindings)
scripts/        test-unit.sh · test-e2e.sh · test-e2e-phase5.sh · dev-deploy.sh · sepolia-deploy.sh
specs/          Authoritative feature docs (spec, plan, tasks, quickstart)
.github/        CI workflows (test.yml)
```

See the `specs/` design docs for the full structure, conventions, and gotchas.

## License

MIT License. Copyright (c) 2026 Ray Tian.
