// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title UQ112x112 fixed-point library.
/// @notice Q112.112 encoding for TWAP price accumulators.
/// @dev    price = uint224(y) * 2**112 / x; encode stores y * 2**112 in the high 112 bits.
library UQ112x112 {
    uint224 internal constant Q112 = uint224(1) << 112; // 2**112

    /// @notice Encode a uint112 as a Q112.112.
    /// @param y The value to encode (up to 2^112 - 1).
    /// @return z `y` shifted left by 112 bits — i.e. `y * 2**112` in Q112.112 format.
    /// @dev Never overflows because `y` is uint112 and `Q112` occupies exactly the
    ///      high 112 bits of a uint224.
    function encode(uint112 y) internal pure returns (uint224 z) {
        z = uint224(y) * Q112; // never overflows — y is uint112
    }

    /// @notice Divide a Q112.112 by a uint112, returning a Q112.112.
    /// @param x The Q112.112 dividend.
    /// @param y The uint112 divisor.
    /// @return z `x / y` in Q112.112 fixed-point.
    /// @dev Fractional bits are preserved by shifting the dividend left by 112 before
    ///      dividing; truncates (rounds toward zero) at the bit level.
    function uqdiv(uint224 x, uint112 y) internal pure returns (uint224 z) {
        z = uint224((uint256(x) << 112) / y);
    }

    /// @notice Decode a Q112.112 back to its uint112 value (truncates fractional bits).
    /// @param x The Q112.112 value to decode.
    /// @return y The integer part of `x` (top 112 bits).
    /// @dev The fractional low 112 bits are discarded.
    function decode(uint224 x) internal pure returns (uint112 y) {
        // forge-lint: disable-next-line(unsafe-typecast)
        y = uint112(x >> 112);
    }
}
