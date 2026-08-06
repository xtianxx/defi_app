// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title SafeMath library — explicit overflow checks under 0.8.
/// @notice `unchecked` blocks with explicit revert on overflow for clarity in AMM math
///         (the same checks the compiler would insert implicitly, spelled out).
library SafeMath {
    /// @notice Add with overflow revert.
    /// @param x First addend.
    /// @param y Second addend.
    /// @return z `x + y`.
    /// @dev Reverts with "SafeMath: ADD_OVERFLOW" if `x + y` overflows uint256.
    function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            require((z = x + y) >= x, "SafeMath: ADD_OVERFLOW");
        }
    }

    /// @notice Subtract with underflow revert.
    /// @param x The minuend.
    /// @param y The subtrahend.
    /// @return z `x - y`.
    /// @dev Reverts with "SafeMath: SUB_UNDERFLOW" if `x < y`.
    function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            require((z = x - y) <= x, "SafeMath: SUB_UNDERFLOW");
        }
    }

    /// @notice Multiply with overflow revert.
    /// @param x First factor.
    /// @param y Second factor.
    /// @return z `x * y`.
    /// @dev Reverts with "SafeMath: MUL_OVERFLOW" if `x * y` overflows uint256
    ///      (multiplication by zero is always allowed).
    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            require(y == 0 || (z = x * y) / y == x, "SafeMath: MUL_OVERFLOW");
        }
    }
}
