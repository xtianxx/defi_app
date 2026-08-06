// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title TransferHelper — safe transfer primitives for the Router periphery.
/// @notice Wraps ERC-20 `transfer` / `transferFrom` and ETH sends in low-level calls so the
///         Router can surface a uniform revert reason instead of swallowing non-bool returns
///         (e.g. USDT-style tokens that return nothing on success).
library TransferHelper {
    /// @notice Safe `transfer` of `value` of `token` to `to`.
    /// @param token The ERC-20 token to transfer.
    /// @param to The recipient of the transfer.
    /// @param value The amount to transfer.
    /// @dev Calls `token.transfer(to, value)` via a low-level call with the hard-coded
    ///      selector `0xa9059cbb`. Reverts with "TransferHelper: TRANSFER_FAILED" on any
    ///      failure; empty return data (non-standard tokens) is treated as success.
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FAILED");
    }

    /// @notice Safe `transferFrom` of `value` of `token` from `from` to `to`.
    /// @param token The ERC-20 token to transfer.
    /// @param from The account providing the tokens (must have approved the caller).
    /// @param to The recipient of the transfer.
    /// @param value The amount to transfer.
    /// @dev Calls `token.transferFrom(from, to, value)` via a low-level call with the
    ///      hard-coded selector `0x23b872dd`. Reverts with "TransferHelper:
    ///      TRANSFER_FROM_FAILED" on any failure (insufficient allowance/balance); empty
    ///      return data (non-standard tokens) is treated as success.
    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FROM_FAILED");
    }

    /// @notice Safe ETH send of `value` to `to`.
    /// @param to The recipient of the ETH.
    /// @param value The amount of ETH (wei) to send.
    /// @dev Performs a low-level `call{value: value}` with empty calldata and reverts
    ///      with "TransferHelper: ETH_TRANSFER_FAILED" if the call fails (reverting
    ///      recipients, out-of-gas, or exceeding the 2300-stipend limits).
    function safeTransferETH(address to, uint256 value) internal {
        (bool success,) = to.call{value: value}("");
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }
}
