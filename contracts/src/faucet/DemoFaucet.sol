// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "../router/interfaces/IERC20.sol";
import {MockERC20} from "../../test/mocks/MockERC20.sol";

/// @title DemoFaucet — 24h time-window test-token faucet (no owner, no backend).
/// @notice Grants the project's test tokens (USDC/DAI/WBTC minted, WETH transferred
/// from a funded reserve) to any wallet, rate-limited to one request per 24 hours.
/// @dev No owner, no admin, no payable path, no receive() — state is only the
/// per-wallet rate-limit map. Meant for Sepolia and the local anvil dev loop.
contract DemoFaucet {
    /// @notice Rate-limit window: one grant per wallet per 24 hours.
    uint256 public constant WINDOW = 24 hours;

    /// @notice WETH granted per request — 0.1 WETH, transferred from the faucet reserve.
    uint256 public constant WETH_AMOUNT = 0.1 ether;

    /// @notice USDC granted per request — 200 USDC (6 decimals), minted.
    uint256 public constant USDC_AMOUNT = 200 * 10 ** 6;

    /// @notice DAI granted per request — 200 DAI (18 decimals), minted.
    uint256 public constant DAI_AMOUNT = 200 * 10 ** 18;

    /// @notice WBTC granted per request — 0.01 WBTC (8 decimals), minted.
    uint256 public constant WBTC_AMOUNT = 1_000_000;

    /// @notice WETH token — the only leg backed by a reserve (funded externally via transfer).
    IERC20 public immutable weth;

    /// @notice USDC token — minted to the requester (open-mint test token).
    MockERC20 public immutable usdc;

    /// @notice DAI token — minted to the requester (open-mint test token).
    MockERC20 public immutable dai;

    /// @notice WBTC token — minted to the requester (open-mint test token).
    MockERC20 public immutable wbtc;

    /// @notice Timestamp of the last successful request per wallet (0 = never).
    mapping(address => uint256) public lastRequestAt;

    /// @notice Emitted after every successful grant.
    /// @param wallet The wallet that received the grant.
    /// @param timestamp The timestamp of the grant (also stored in `lastRequestAt`).
    event Requested(address indexed wallet, uint256 timestamp);

    /// @notice Deploys the faucet bound to the project's four test tokens.
    /// @param _weth The WETH token (reserve-funded leg).
    /// @param _usdc The USDC token (minted leg).
    /// @param _dai The DAI token (minted leg).
    /// @param _wbtc The WBTC token (minted leg).
    constructor(IERC20 _weth, MockERC20 _usdc, MockERC20 _dai, MockERC20 _wbtc) {
        weth = _weth;
        usdc = _usdc;
        dai = _dai;
        wbtc = _wbtc;
    }

    /// @notice Grant the fixed token set to `msg.sender`, once per 24h window.
    /// @dev CEI order: rate-limit check first, then the mandatory WETH reserve check
    /// (MockERC20.transfer underflow-reverts instead of returning false, so the explicit
    /// balance check is required to surface a human-readable error), then the token
    /// effects, and only then the state write.
    function request() external {
        require(block.timestamp >= lastRequestAt[msg.sender] + WINDOW, "DemoFaucet: rate limited");
        require(weth.balanceOf(address(this)) >= WETH_AMOUNT, "DemoFaucet: weth reserve empty");

        usdc.mint(msg.sender, USDC_AMOUNT);
        dai.mint(msg.sender, DAI_AMOUNT);
        wbtc.mint(msg.sender, WBTC_AMOUNT);
        // The reserve check above guarantees the transfer cannot fail (MockERC20 never
        // returns false — it underflow-reverts), so the return value is intentionally unchecked.
        // forge-lint: disable-next-line(erc20-unchecked-transfer)
        weth.transfer(msg.sender, WETH_AMOUNT);

        lastRequestAt[msg.sender] = block.timestamp;
        emit Requested(msg.sender, block.timestamp);
    }

    /// @notice Earliest timestamp at which `who` may request again.
    /// @param who The wallet to query.
    /// @return 0 if `who` never requested, otherwise lastRequestAt[who] + WINDOW.
    function nextEligibleTime(address who) external view returns (uint256) {
        return lastRequestAt[who] == 0 ? 0 : lastRequestAt[who] + WINDOW;
    }
}
