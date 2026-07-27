// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title UQ112x112 fixed-point library.
/// @notice Q112.112 encoding for TWAP price accumulators.
/// @dev    price = uint224(y) * 2**112 / x; encode stores y * 2**112 in the high 112 bits.
library UQ112x112 {
    uint224 internal constant Q112 = uint224(1) << 112; // 2**112

    /// @notice Encode a uint112 as a Q112.112.
    function encode(uint112 y) internal pure returns (uint224 z) {
        z = uint224(y) * Q112; // never overflows — y is uint112
    }

    /// @notice Divide a Q112.112 by a uint112, returning a Q112.112.
    function uqdiv(uint224 x, uint112 y) internal pure returns (uint224 z) {
        z = uint224((uint256(x) << 112) / y);
    }

    /// @notice Decode a Q112.112 back to its uint112 value (truncates fractional bits).
    function decode(uint224 x) internal pure returns (uint112 y) {
        y = uint112(x >> 112);
    }
}
