# Uniswap V2–Style DEX — Resume Project

[中文版](README.md) | English

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

A Uniswap V2–style decentralized exchange (DEX) built as a resume/portfolio project: an
on-chain AMM with constant-product pricing (`x·y=k`), a 0.3% swap fee, TWAP price oracles,
and a full web dApp that connects to it via MetaMask.

The repository is a two-package monorepo:

- **`contracts/`** — Foundry project re-implementing Uniswap V2 core (`Factory`, `Pair`, LP
  `ERC20`) and a simplified periphery (`Router02`, `WETH9`, `UniswapV2Library`,
  `TransferHelper`), excluding flash swaps and multi-hop routing (FR-011).
- **`frontend/`** — Next.js 15 (App Router) dApp: swap, add/remove liquidity, and a
  portfolio view backed by on-chain TWAP-only prices. ethers v6, React 19, Tailwind +
  shadcn/ui, Vitest + Playwright.

The deploy target is local `anvil` (chainId 31337, deterministic dev loop). No real
value is ever at risk.

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
│ frontend/scripts/sync-deploy.ts   (node scripts/sync-deploy.ts <json> <id>)│
│   regenerates src/lib/contracts/{addresses,abis,tokens}.ts                │
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
root workspace tool — the packages are independent (see `AGENTS.md` for the full
structure).

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
node scripts/sync-deploy.ts ../contracts/broadcast/31337/run-latest.json 31337

# A.4 — run the frontend
npm install
npm run dev                                     # http://localhost:3000

# A.5 — browser validation (manual, SC-001)
#   Connect MetaMask to anvil (chainId 31337, RPC http://127.0.0.1:8545),
#   swap WETH → USDC on /swap, approve + confirm, check the empty
#   USDC/DAI pool edge case, add liquidity on /liquidity, and verify
#   positions + fees on /portfolio (SC-004, < 3 s).

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

> **Scenario B removed** — this project is Anvil-only. Local testing and demos run on
> the anvil chain (chainId 31337); see the Quickstart section above.

## Contract addresses

Deployed addresses are generated by `scripts/sync-deploy.ts` into
`frontend/src/lib/contracts/addresses.ts` as a per-chain `DEPLOYMENTS` record (anvil
31337), populated from the Foundry `broadcast/` run-latest JSON of the deploy script. Re-run `sync-deploy.ts` after any redeploy — `broadcast/` is gitignored and
the generated files are tracked.

Deploy scripts: `contracts/script/DeployDemo.s.sol` (main demo),
`contracts/script/core/DeployFactory.s.sol`, `contracts/script/router/DeployRouter.s.sol`.

## Testing

**Contracts** (from `contracts/`):

```bash
forge fmt --check        # formatting (Constitution IV)
forge build --sizes      # Router02 must stay under the 24 KB EIP-170 limit
forge test -vvv          # all tests green
forge test --coverage    # ≥ 95% line coverage (Constitution III)
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
scripts/        test-unit.sh · test-e2e.sh · test-e2e-phase5.sh · dev-deploy.sh
specs/          Authoritative feature docs (spec, plan, tasks, quickstart)
.github/        CI workflows (test.yml)
```

See `AGENTS.md` for the full structure, conventions, and gotchas.

## License

MIT License. Copyright (c) 2026 Ray Tian.
