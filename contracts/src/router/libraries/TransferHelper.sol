// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title TransferHelper — safe transfer primitives for the Router periphery.
/// @notice Wraps ERC-20 `transfer` / `transferFrom` and ETH sends in low-level calls so the
///         Router can surface a uniform revert reason instead of swallowing non-bool returns
///         (e.g. USDT-style tokens that return nothing on success).
library TransferHelper {
    /// @notice Safe `transfer` of `value` of `token` to `to`.
    /// @dev Reverts with "TransferHelper: TRANSFER_FAILED" on any failure.
    function safeTransfer(address token, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FAILED");
    }

    /// @notice Safe `transferFrom` of `value` of `token` from `from` to `to`.
    /// @dev Reverts with "TransferHelper: TRANSFER_FROM_FAILED" on any failure (allowance/balance).
    function safeTransferFrom(address token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: TRANSFER_FROM_FAILED");
    }

    /// @notice Safe ETH send of `value` to `to`.
    /// @dev Reverts with "TransferHelper: ETH_TRANSFER_FAILED" if the call fails or returns no data.
    function safeTransferETH(address to, uint256 value) internal {
        (bool success,) = to.call{value: value}("");
        require(success, "TransferHelper: ETH_TRANSFER_FAILED");
    }
}
