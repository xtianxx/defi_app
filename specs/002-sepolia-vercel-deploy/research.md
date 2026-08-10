# Research: Sepolia Testnet & Vercel Deployment for Interview Demo

**Feature**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10
**Input**: [spec.md](./spec.md) — Public Sepolia DEX demo (FR-001..FR-013)

## Research Tasks

| # | Task | Source |
|---|------|--------|
| R0.1 | Sepolia test-ETH faucets for one-time master funding + fallback replenishment | @librarian live research (2026-08-10) |
| R0.2 | Vercel Hobby free-tier limits + server-only env vars for Next.js 15 | @librarian live research (official Vercel/Next.js docs, 2026-08-10) |
| R0.3 | Foundry contract verification on Sepolia Etherscan (via_ir project) | @librarian live research (Foundry book + Etherscan docs, 2026-08-10) |
| R0.4 | On-chain faucet contract pattern (time-window rate limit, no backend) | Spec FR-008 + established convention |

---

## R0.1 Sepolia Test-ETH Faucets (master funding + fallback)

**Source**: @librarian live research, 2026-08-10 (direct page fetches + HTTP redirect probes + live Sepolia RPC gas probe; ethereum.org testnet docs updated 2026-08-06).

### Decision

Fund the **master funding account once with 0.1–0.25 ETH** (covers full deployment ~0.02 ETH at 1 gwei + seeding + hundreds of demo txs; 0.25 ETH survives 10× fee spikes), then replenish demo accounts via `cast send` from master (primary path, FR-005/SC-003).

| Path | When | Faucet |
|---|---|---|
| **Primary (one-shot)** | Operator holds ≥0.08 ETH on mainnet | **Chainstack** — up to 0.5 ETH/24h, tops to 0.5; single claim completes funding |
| **Primary (no mainnet ETH)** | Fresh account | **Google Cloud Web3 Faucet** — 0.05 ETH/24h, GitHub auth, no mainnet requirement; claim 2–5 days to reach 0.1–0.25 ETH, supplemented in parallel by **ethfaucet.com** (0.1 ETH/24h, BringID zk identity) and/or **QuickNode** (12h drips, X-post) |
| **Replenishment (≤5 min)** | Any time | `cast send` from master — 21k gas ≈ 0.00002 ETH per transfer; 20 replenishments complete in well under a minute |
| **Emergency fallback** | Master dry mid-interview | **pk910 PoW faucet** (no auth, CPU mining) |

### Rationale

- Verified live: Alchemy faucet now requires ≥0.001 ETH mainnet + tx activity (fresh master **rejected**); Infura discontinued (redirects); sepoliafaucet.com dead (→Alchemy); Paradigm/GetBlock/0xfaucet/Moralis dead; LearnWeb3 pool exhausted (0.02 sETH left). Holesky deprecated Sept 2025 — Sepolia is the only real app-dev testnet.
- Sepolia fees measured live: gasPrice ≈ 1.01 gwei, baseFee ≈ 1.01 gwei → deployment ~18–19M gas ≈ 0.02 ETH; swap ~165k gas ≈ 0.00017 ETH; approve 46k ≈ 0.00005 ETH; ETH transfer 21k ≈ 0.00002 ETH.
- The ≤5 min replenishment target is trivially satisfied by the master-transfer loop; the faucet checklist is a documented fallback, never hard-coded into scripts (landscape is shrinking — don't rely on any single faucet).

### Alternatives considered

| Alternative | Rejected because |
|---|---|
| Alchemy faucet as primary | Mainnet-balance + activity gating (verified on live FAQ) — fresh accounts rejected. |
| Infura/sepoliafaucet/Paradigm/LearnWeb3 | Dead, redirected, or exhausted (verified live). |
| Public PoW faucet as primary | Slow (minutes of mining), IP-rate-limited, can run dry — emergency fallback only. |

### Gotchas to carry into implementation

- Faucet payouts are slow and sometimes silently dropped (Alchemy's own FAQ warns claims can sit at low gas) — verify with `cast balance` after claiming; allow minutes-to-hours.
- Several faucet UIs are JS SPAs — published limits should be re-verified at claim time.
- Docs must present funding as a **checklist with fallbacks**, not a single faucet URL.

---

## R0.2 Vercel Hobby Deployment & Server-Only Env Vars

### Decision

Use Vercel Hobby (free) tier with the **`frontend/` directory as the imported root**; framework auto-detected (Next.js); no `vercel.json`, no CI wiring — auto-deploy on push to `main`. Store the Sepolia RPC URL as a **server-only env var** named `SEPOLIA_RPC_URL` (no `NEXT_PUBLIC_` prefix), read only inside the `api/reserves` route handler via `process.env`.

### Rationale

- Route Handlers default to the **Node.js runtime** and are **dynamic by default since Next.js 15** — the existing `/api/reserves` route (already `runtime = "nodejs"`) serves live on-chain data without caching changes. `force-dynamic` is optional documentation only.
- Vars **without** `NEXT_PUBLIC_` are server-only: available to Route Handlers/Server Components/build, **never bundled to the browser**. Prefixing the key would leak it into the client bundle — rejected.
- Hobby limits are ample for this app: function duration 300 s (default max), build 45 min/deployment, bandwidth 100 GB/mo, invocations 1M/mo, cold starts +~1 s after 2-week idle. A Sepolia `eth_call` round trip is ~100–500 ms.
- Client-side reads need no RPC key at all: wallet `BrowserProvider` covers them; the server route covers the batched reserve reads.
- Alchemy/Infura free-tier rate limits (e.g., Alchemy ~300M CU/mo) → keep react-query polling intervals at 5–10 s (existing `revalidate: 2` cache is fine).

### Alternatives considered

| Alternative | Rejected because |
|---|---|
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` in the client bundle | Exposes the API key to every visitor; burns free-tier quota and risks key rotation. |
| Public RPC endpoints (e.g., `https://rpc.sepolia.org`) | Spec clarification: public RPCs found unreliable; Alchemy/Infura free tier chosen. |
| `vercel.json` with function/region config | Default Node runtime + default `iad1` region suffice; global Alchemy/Infura endpoints make region tuning pointless. |
| Root-level repo import (monorepo, no workspace) | Root has no Next.js package; Vercel needs the `frontend/` root directory to auto-detect the framework. |

### Gotchas to carry into implementation

- Hobby **cannot connect to GitHub org-owned repos** — must be a personal repo (or Pro).
- Hobby runtime logs retained **1 hour only** — debug soon after deploy.
- Env changes only affect **new** deployments; set `SEPOLIA_RPC_URL` for both **Production and Preview** environments.
- Git-based auto-deploy is default behavior — no GitHub Action needed for Vercel.

---

## R0.3 Foundry Contract Verification on Sepolia Etherscan

### Decision

**Primary path (preferred, reproducible, <30 min):** wire verification into the deployment itself —

```bash
forge script script/DeployDemoSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast \
  --verify --etherscan-api-key "$ETHERSCAN_API_KEY" --slow
```

Constructor args, compiler version, optimizer runs, and via-ir are decoded automatically from the broadcast receipts/artifacts, which eliminates the most common mismatch failures.

**Fallback path (post-hoc):** loop `forge verify-contract` over each deployed address:

```bash
forge verify-contract <ADDRESS> <Path.sol:ContractName> \
  --chain 11155111 --compiler-version 0.8.19 --optimizer-runs 200 --via-ir --watch
```

**If bytecode mismatch persists** (known via-ir discrepancies — foundry issues #6780, #12737): use `forge verify-contract --show-standard-json-input` and paste into Etherscan's Standard JSON Input verifier.

### Rationale

- Sepolia (11155111) is on the Etherscan **free tier** (source + ABI endpoints free on all chains); current limits **3 calls/s, 100k calls/day** — the legacy "1 req/5s" figure is superseded by the 2025+ API V2 rollout. A 9-contract deploy verifies in ~1–2 min.
- `--via-ir` must be passed **explicitly** — historical Foundry behavior did not inherit `via_ir` from `foundry.toml`; passing it is idempotent and deterministic.
- Our contracts use SPDX `MIT` headers → no `--license-type` needed.
- `ETHERSCAN_API_KEY` env var is read automatically by forge.

### Alternatives considered

| Alternative | Rejected because |
|---|---|
| Sourcify/Blockscout verification | Etherscan is the spec-chosen explorer for interviewers; primary UX is Sepolia Etherscan links. |
| Manual "Verify & Publish" paste on etherscan.io | Error-prone (constructor args, optimizer settings); not reproducible in <30 min (FR-010). |
| `--guess-constructor-args` | Works, but script `--verify` decodes args from broadcasts more reliably. |

### Gotchas to carry into implementation

- V2 unified keys need `--verifier-url "https://api.etherscan.io/v2/api?chainid=11155111"`; legacy per-chain keys (`api-sepolia.etherscan.io`) still work with plain `--etherscan-api-key`.
- "Unable to locate ContractCode" = checked too early (forge retries 5×, 5 s delay) or wrong chainid on V2 URL.
- "Already verified" → add `--skip-is-verified-check`.
- `--slow` from 001's anvil gotcha: keep for Sepolia broadcasts (EIP-1559 fee-estimation timeouts are a real class of failure on live chains too).

---

## R0.4 On-Chain Faucet Contract Pattern

### Decision

Implement `DemoFaucet` as a **pure on-chain grant contract** with a per-wallet time-window rate limit:

```text
mapping(address => uint256) public lastRequestAt;      // block.timestamp of last grant
uint256 public constant WINDOW = 24 hours;             // one request per wallet per 24h

function request() external {
    require(block.timestamp >= lastRequestAt[msg.sender] + WINDOW, "rate limited");
    // USDC/DAI/WBTC: MockERC20.mint(msg.sender, AMOUNT_x)
    // WETH:          IERC20(WETH).transfer(msg.sender, WETH_AMOUNT) from deploy-funded reserve
    lastRequestAt[msg.sender] = block.timestamp;       // state change LAST (CEI)
    emit Requested(msg.sender, ...);
}

function nextEligibleTime(address who) external view returns (uint256); // UI countdown
```

- **No owner, no admin, no backend**: anyone can call `request()`; the rate limit is the only gate (FR-008 clarification: "no backend service, no server-held private keys").
- **No value-transferring external calls**: `mint`/`transfer` on our own token contracts only — no reentrancy surface (Constitution I). CEI ordering: rate-limit check → transfers → timestamp update.
- **Input validation**: no user-supplied amounts/tokens; the grant set is fixed by constants.
- **WETH note**: `WETH9` has no `mint` — the faucet is funded with WETH once at deploy time (part of `DeployDemoSepolia.s.sol`); the documented re-seeding process tops it up.
- **Grant amounts** (constants, documented in contracts/faucet-contract.md): sized so one claim enables a swap + a small liquidity add (e.g., 0.1 WETH, 200 USDC, 200 DAI, 0.01 WBTC). Sepolia gas is negligible.
- **UI**: `nextEligibleTime` powers the countdown message ("next request in 23h 12m") — satisfies US3-3 ("explains the limit and when they can request again").
- **Tests** (Constitution III): window boundary (`vm.warp`), exact per-token amounts, revert on early re-request, event emission, WETH-reserve exhaustion behavior, ≥95% coverage.

### Rationale

The pattern is the standard faucet state machine (timestamp map + window check) used across testnet faucet contracts. GitHub pattern searches (2026-08-10) returned no canonical public reference for this exact shape; the design follows the spec's own constraints (pure contract, time-window, per-wallet) and the 001 codebase conventions (`MockERC20` is already deployed and its `mint` is permissionless — the faucet needs no minter role).

### Alternatives considered

| Alternative | Rejected because |
|---|---|
| Backend service with server-held key (classic drip API) | Explicitly out of scope (spec clarification 2026-08-10): no backend, no server keys. |
| Role/permissioned mintable token (faucet owns minter role) | Requires token changes + permissioned ops; `MockERC20.mint` is already open — testnet demo has no real value at risk (documented accepted trade-off). |
| Merkle/queue-based grant system | Overkill; nothing to prove beyond time-window rate limiting. |
| Wallet nonce/ETH-balance-based rate limit | Testnet wallets are cheap to recreate; per-wallet timestamp window is what the spec asks for. |

### Gotchas to carry into implementation

- `MockERC20.mint` being permissionless is an **accepted testnet trade-off** (anyone could mint directly) — harmless on Sepolia, documented in the plan gate notes.
- Faucet must be funded with WETH **after** deployment (WETH cannot be minted) — order matters in the deploy script; re-seeding doc covers top-ups.
- The faucet ABI must reach the frontend: `abis.ts` (curated, tracked) gains a `DemoFaucet_ABI` export; `sync-deploy.ts` gains a `faucet` field in the `Deployment` interface.

---

## Consolidated Decisions (Phase 0 output)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Vercel Hobby, `frontend/` root dir, auto-deploy from `main`, no vercel.json | Free tier sufficient; zero-config Git deploy (R0.2) |
| D2 | `SEPOLIA_RPC_URL` server-only env var (no `NEXT_PUBLIC_`), read in route handler only | Keeps API key out of the browser bundle (R0.2) |
| D3 | Verify via `forge script --verify` in the deploy loop; post-hoc `forge verify-contract --via-ir --optimizer-runs 200 --compiler-version 0.8.19` fallback; standard-JSON last resort | Reproducible, <30 min, avoids constructor-arg mismatches (R0.3) |
| D4 | Pure on-chain `DemoFaucet`: timestamp map + 24h window, mint USDC/DAI/WBTC + transfer WETH reserve, `nextEligibleTime` view | Spec-mandated, no backend; CEI-safe; no reentrancy surface (R0.4) |
| D5 | Fresh demo-account keys generated for Sepolia (anvil well-known keys are public knowledge) | Prevent drain by anyone who knows 001's docs (plan D4) |
| D6 | Master funding account charged once with 0.1–0.25 ETH (Chainstack if ≥0.08 ETH mainnet held, else Google Cloud Web3 faucet + ethfaucet supplement); replenishment via `cast send` from master (seconds), pk910 PoW + faucet checklist as emergency fallback | R0.1: live-verified landscape; ≤5 min target (FR-005/SC-003) trivially satisfied |
| D7 | Multi-chain sync-deploy: `chainIds = [31337, 11155111]`, tracked generated `addresses.ts`/`tokens.ts` committed with Sepolia addresses | Sepolia addresses are testnet-public; broadcast JSON stays gitignored (repo convention) |
