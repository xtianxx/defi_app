# Data Model: Sepolia Testnet & Vercel Deployment for Interview Demo

**Feature**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10
**Input**: [spec.md](./spec.md) Key Entities + [research.md](./research.md) decisions

## Overview

This feature adds no new databases and no off-chain persistence. All runtime state lives on-chain on **Sepolia (chainId 11155111)**; the frontend config layer gains a parallel set of **deployment configuration** records keyed by chainId. Entities below cover both the on-chain state (FaucetGrant) and the static configuration that documents/deploys the demo (DemoAccount, TestToken, LiquidityPool, ContractDeployment).

The local anvil (31337) deployment of the same configuration remains untouched (FR-009/SC-006) — every record that exists for anvil gains a Sepolia counterpart.

---

## Entity: DemoAccount

A testnet EOA created for the demo, with documented credentials and funded balances. Mirrors the anvil demo roles (001: deployer, LP provider B, swapper).

| Field | Type | Rules / Constraints | Notes |
|---|---|---|---|
| `address` | `address` (EVM) | Unique; checksummed | Public in demo guide (FR-004) |
| `privateKey` | `bytes32` | **Testnet-only asset holder** | Documented in demo guide; accepted risk (spec assumption). Master funding key NEVER documented |
| `role` | enum `{master, liquidityProvider, swapper}` | ≥2 demo accounts: LP + swapper (FR-004) | Master = deployer + replenishment source (FR-005) |
| `balances` | mapping token → `uint256` | Pre-funded at deploy: test ETH (gas) + project tokens | Seeded by DeployDemoSepolia.s.sol + master transfers |
| `faucetLastRequestAt` | `uint256` (timestamp) | Managed by DemoFaucet on-chain | Mirrors on-chain FaucetGrant state for UI |

**Relationships**:
- A DemoAccount **owns** FaucetGrant records (1:N via on-chain mapping).
- DemoAccount balances are held as TestToken balances and native ETH (on-chain ERC-20/balance-of state).

**State transitions**: funded at deploy → used during demo (spend) → replenished via master `cast send` (primary) or public faucet (fallback), ≤5 min (FR-005/SC-003).

**Notes**:
- Keys are **generated fresh for Sepolia** — anvil's well-known keys (`0xac09…`, `0x59c6…`) are public knowledge and would be drained (plan D5).
- Roles: master (deployer, holds seed liquidity + replenishment funds), LP provider (adds/removes liquidity), swapper (buys/sells).

---

## Entity: TestToken

A fungible token deployed on Sepolia representing the project's standard set (WETH, USDC, DAI, WBTC) — same set as anvil.

| Field | Type | Rules / Constraints | Notes |
|---|---|---|---|
| `symbol` | `string` | One of `WETH` \| `USDC` \| `DAI` \| `WBTC` | Fixed set (FR-001/FR-004) |
| `name` | `string` | Static metadata | Matches 001 (`tokens.ts`) |
| `decimals` | `uint8` | WETH 18, USDC 6, DAI 18, WBTC 8 | Must match ERC-20 contract |
| `address` | `address` | Per chainId: `addressByChain[31337]`, `addressByChain[11155111]` | Generated `tokens.ts` |
| `contract` | enum `{WETH9, MockERC20}` | WETH = WETH9 (no mint); others MockERC20 (open mint) | Drives faucet mechanics (R0.4) |
| `faucetAmount` | `uint256` | Fixed per token | Grant set is contract constants (input validation, R0.4) |

**Relationships**:
- A TestToken **is deployed within** a ContractDeployment.
- TestTokens **compose** LiquidityPools (2 per pair).
- DemoFaucet **grants** TestTokens (faucetAmount each).

**Notes**:
- WETH is special: cannot be minted — faucet holds a pre-funded WETH reserve; all others minted on demand (R0.4).

---

## Entity: LiquidityPool

A UniswapV2Pair on Sepolia holding seeded reserves of two tokens; backs swap/liquidity/portfolio pages (FR-006).

| Field | Type | Rules / Constraints | Notes |
|---|---|---|---|
| `pair` | `address` | Factory-created; verified | WETH/USDC + WETH/DAI seeded (mirrors 001) |
| `token0`, `token1` | `address` | Sorted per Uniswap convention | `getReserves()` ordering |
| `reserve0`, `reserve1` | `uint112` | Seeded at deploy; ≥ demo-trade depth | Seed sizes documented (e.g., 100 WETH / 200k USDC equivalent; Sepolia gas negligible) |
| `totalSupply` | `uint256` | LP tokens | Minted to master at seeding |
| `blockTimestampLast` | `uint32` | TWAP last update | Read via existing route handler |

**Relationships**: composed of 2 TestTokens; owned state read by `/api/reserves` (existing, multi-chain).

**State transitions**: seeded at deploy → consumed by demo trades → **re-seeded via documented process** (edge case "seeded liquidity drained") restoring demo-ready state.

---

## Entity: ContractDeployment

The set of on-chain addresses on a given chain with verified source (FR-007).

| Field | Type | Rules / Constraints | Notes |
|---|---|---|---|
| `chainId` | `number` | `31337` (anvil) \| `11155111` (Sepolia) | Multi-chain generated bindings (plan D7) |
| `factory`, `router`, `weth` | `address` | Non-zero; verified on Etherscan (Sepolia) | `isDeploymentConfigured` gate (existing) |
| `tokens` | map symbol → `address` | WETH/USDC/DAI/WBTC | Generated `tokens.ts` |
| `faucet` | `address` | **NEW field** | DemoFaucet address; absent on 31337 until deployed there too |
| `verified` | `bool` | Sepolia: 100% of deployed contracts verified (SC-002) | Script `--verify` path (R0.3) |
| `explorerUrl` | `string` | `sepolia.etherscan.io` | `chains.ts` CHAINS entry |

**Relationships**: contains TestTokens + LiquidityPools + Faucet.

**Notes**: generated `addresses.ts`/`tokens.ts` are tracked + committed with Sepolia addresses (testnet-public; broadcast JSON remains gitignored — repo convention).

---

## Entity: FaucetGrant

A record of token disbursement to a wallet, enforced on-chain via the 24h time-window rate limit (FR-008).

| Field | Type | Rules / Constraints | Notes |
|---|---|---|---|
| `wallet` | `address` | `msg.sender` of `request()` | Any EOA/contract wallet |
| `requestedAt` | `uint256` | `block.timestamp` at grant | Stored in `lastRequestAt` mapping |
| `nextEligibleTime` | `uint256` | `lastRequestAt + 24h` (view) | UI countdown (US3-3) |
| `granted` | map token → `uint256` | Fixed amounts per token (constants) | USDC/DAI/WBTC minted; WETH transferred from reserve |
| `wethReserve` | `uint256` | Faucet's WETH balance | Exhaustible → re-seed process |

**State transition** (on-chain state machine):

```text
idle ──request()──▶ granting ──(mint/transfer OK)──▶ granted (lastRequestAt = now)
  ▲                                                  │
  └────────────── 24h window expires ◀───────────────┘
  (request() reverts "rate limited" inside window)
```

**Relationships**: 1 grant per wallet per 24h; wallet = any DemoAccount or visitor wallet (US3-1: "visitors can request tokens").

**Validation rules** (from FR-008 + US3):
1. `request()` reverts if `block.timestamp < lastRequestAt[msg.sender] + 24h` (rate limit).
2. Grant set is fixed by contract constants — no user-supplied amounts (input validation, Constitution I).
3. WETH grant fails gracefully (reverts) if the reserve is exhausted → documented re-seed path.
4. Event `Requested(wallet, tokens)` emitted for explorer/UI confirmation (US3-1: "UI confirms within one minute").

---

## Cross-Cutting Rules

| Rule | Source |
|---|---|
| Chain config: `CHAINS[11155111]` added with explorer `https://sepolia.etherscan.io`; RPC URL **server-only env** `SEPOLIA_RPC_URL` | plan D2, R0.2 |
| `isSupportedChain` must accept 11155111; wrong-network messaging must explain Sepolia + switch guidance (US1-4) | FR-003 |
| Multi-chain bindings: `addresses.ts`/`tokens.ts` regenerated with `{31337, 11155111}` keys | plan D7 |
| Local anvil flow unchanged (regression) | FR-009, SC-006 |
| 100% Sepolia contracts verified on Etherscan | FR-007, SC-002 |
| Replenishment path documented + executable ≤5 min; re-seeding documented | FR-005, edge cases |
| Demo guide (Chinese-primary) documents accounts/addresses/pools/replenishment/script with expected results | FR-012, SC-007 |
