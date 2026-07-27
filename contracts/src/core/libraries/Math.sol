// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title Math library for the Uniswap V2-style AMM.
/// @notice Pure helpers for min and Babylonian integer square root.
library Math {
    /// @notice Returns the minimum of two uint256 values.
    function min(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = x < y ? x : y;
    }

    /// @notice Babylonian integer square root: floor(sqrt(y)).
    /// @dev Adapted from the canonical Solmate implementation. Reverts on overflow.
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
