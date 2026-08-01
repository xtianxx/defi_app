// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title SafeMath library — explicit overflow checks under 0.8.
/// @notice `unchecked` blocks with explicit revert on overflow for clarity in AMM math.
library SafeMath {
    /// @notice Add with overflow revert.
    function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            require((z = x + y) >= x, "SafeMath: ADD_OVERFLOW");
        }
    }

    /// @notice Subtract with underflow revert.
    function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            require((z = x - y) <= x, "SafeMath: SUB_UNDERFLOW");
        }
    }

    /// @notice Multiply with overflow revert.
    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        unchecked {
            require(y == 0 || (z = x * y) / y == x, "SafeMath: MUL_OVERFLOW");
        }
    }
}
