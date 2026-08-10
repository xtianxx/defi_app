# Contract Interface: DemoFaucet (Sepolia Test-Token Faucet)

**Feature**: `002-sepolia-vercel-deploy` | **Date**: 2026-08-10
**Status**: Design (implementation phase follows)
**Spec refs**: FR-008, US3-1..US3-3 | [research.md R0.4](../research.md) | [data-model.md FaucetGrant](../data-model.md)

## 1. Purpose

A pure on-chain faucet granting the project's test tokens to any connected wallet, rate-limited to **one request per wallet per 24 hours**. No owner, no admin, no backend service, no server-held private keys (spec clarification 2026-08-10).

Deployed as part of the Sepolia deployment (`DeployDemoSepolia.s.sol`); also deployed on anvil in the local dev loop so the `/faucet` page is locally testable.

## 2. Contract Declaration

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title DemoFaucet — 24h time-window test-token faucet (no owner, no backend).
contract DemoFaucet {
    uint256 public constant WINDOW = 24 hours;
    // Grant amounts (fixed constants — input validation by construction).
    uint256 public constant WETH_AMOUNT  = 0.1 ether;
    uint256 public constant USDC_AMOUNT  = 200 * 10 ** 6;   // 200 USDC
    uint256 public constant DAI_AMOUNT   = 200 * 10 ** 18;  // 200 DAI
    uint256 public constant WBTC_AMOUNT  = 10_000 * 10 ** 8; // 0.01 WBTC

    IERC20 public immutable weth;
    MockERC20 public immutable usdc;
    MockERC20 public immutable dai;
    MockERC20 public immutable wbtc;

    mapping(address => uint256) public lastRequestAt;

    event Requested(address indexed wallet, uint256 timestamp);

    constructor(IERC20 _weth, MockERC20 _usdc, MockERC20 _dai, MockERC20 _wbtc) { ... }

    /// @notice Grant the fixed token set to msg.sender, once per 24h window.
    /// @dev CEI: rate-limit check first, transfers, then state write.
    function request() external { ... }

    /// @notice Earliest timestamp at which `who` may request again.
    function nextEligibleTime(address who) external view returns (uint256) { ... }
}
```

*(Signature-level contract — final NatSpec/implementation lands in `contracts/src/faucet/DemoFaucet.sol` during implementation.)*

## 3. Function Contracts

### 3.1 `request()` — external

**Preconditions**:
- `block.timestamp >= lastRequestAt[msg.sender] + WINDOW` — else revert `"DemoFaucet: rate limited"`.
- For the WETH leg: faucet WETH balance ≥ `WETH_AMOUNT` — else revert `"DemoFaucet: weth reserve empty"` (documented re-seed path).
- `msg.value == 0` (reject accidental ETH — no payable logic).

**Postconditions**:
- USDC: `usdc.mint(msg.sender, USDC_AMOUNT)` (open mint — permissionless MockERC20, accepted testnet trade-off).
- DAI: `dai.mint(msg.sender, DAI_AMOUNT)`.
- WBTC: `wbtc.mint(msg.sender, WBTC_AMOUNT)`.
- WETH: `weth.transfer(msg.sender, WETH_AMOUNT)` from faucet reserve.
- `lastRequestAt[msg.sender] = block.timestamp` (state write **last**, CEI order).
- Emit `Requested(msg.sender, block.timestamp)`.

**Failure modes** (surface human-readable in UI, FR-011):
| Revert | UI message |
|---|---|
| `rate limited` | "本钱包 24 小时内已领取过 — 下次可领取时间: {nextEligibleTime}" (US3-3) |
| `weth reserve empty` | "WETH 储备不足，请联系演示者补充" |
| `wallet not connected` (frontend gate) | Connect prompt (US3-2) |

### 3.2 `nextEligibleTime(address)` — external view

Returns `lastRequestAt[who] + WINDOW` (0 if never requested). Powers the UI countdown and the "request again in X" message.

### 3.3 Constants

`WINDOW`, `WETH_AMOUNT`, `USDC_AMOUNT`, `DAI_AMOUNT`, `WBTC_AMOUNT` — public getters used by the frontend to render the grant table (and tests to assert amounts).

## 4. Security Analysis (Constitution I)

| Threat | Mitigation |
|---|---|
| Reentrancy | No external calls that transfer value *to* untrusted code; `mint`/`transfer` target our own project contracts (MockERC20, WETH9). CEI ordering: state write after transfers. |
| Rate-limit bypass (re-request in window) | Single timestamp mapping keyed by `msg.sender`; window check is the first statement. |
| Amount inflation / griefing inputs | No user-supplied amounts/tokens — fixed constants. |
| Faucet drained as WETH proxy | Only `msg.sender` receives; one grant/24h/wallet; reserve sized for many visitors. |
| ETH stuck in contract | `request()` is non-payable; no `receive` — accidental ETH is impossible (contract has no ETH path at all). |
| Centralization / rug | No owner/admin keys at all — state is only the rate-limit map. |

## 5. Test Contract (TDD — Constitution III)

`test/faucet/DemoFaucet.t.sol` (≥95% coverage on the contract):

- `test_Request_GrantsExactAmounts` — all 4 tokens credited with exact constants.
- `test_Request_RateLimitedWithinWindow` — second request within 24h reverts `rate limited`.
- `test_Request_EligibleAfterWindow` — `vm.warp(lastRequestAt + WINDOW)` → second request succeeds.
- `test_Request_BoundaryExactWindow` — at exactly `+WINDOW` succeeds; at `+WINDOW - 1` reverts.
- `test_Request_RejectsEth` — `request{value: 1}` reverts (non-payable).
- `test_Request_RevertsWhenWethReserveEmpty` — drain reserve → revert `weth reserve empty`.
- `test_NextEligibleTime_ZeroBeforeFirstRequest` / `_EqualsLastPlusWindow` — view contract.
- `test_Request_EmitsEvent` — `Requested(wallet, ts)`.
- `test_Request_IndependentPerWallet` — wallet A request does not affect wallet B.
- Fuzz: `testFuzz_Request_AnyWalletEligibleAfterWindow` — random wallet + warp ≥ window succeeds.

## 6. Deployment Wiring

- **Sepolia**: deployed in `DeployDemoSepolia.s.sol` (order: tokens → factory → router → pairs → **fund faucet WETH** → deploy faucet) → funded with WETH reserve (`weth.transfer(faucet, X)`); address flows to `sync-deploy.ts` `faucet` field.
- **Anvil**: same script reused in the local loop so `/faucet` is testable offline.
- **ABI**: added to curated `frontend/src/lib/contracts/abis.ts` as `DemoFaucet_ABI` (sync-deploy regenerates `abis.generated.ts` automatically; the curated export is the binding the frontend imports).
