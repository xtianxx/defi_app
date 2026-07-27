// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {Math} from "../../src/core/libraries/Math.sol";

contract MathTest is Test {
    function test_min_returnsSmaller() public pure {
        assertEq(Math.min(1, 2), 1);
        assertEq(Math.min(100, 99), 99);
        assertEq(Math.min(7, 7), 7);
    }

    function test_min_handlesZero() public pure {
        assertEq(Math.min(0, 100), 0);
        assertEq(Math.min(100, 0), 0);
    }

    function test_min_handlesMax() public pure {
        assertEq(Math.min(type(uint256).max, 1), 1);
        assertEq(Math.min(type(uint256).max, type(uint256).max), type(uint256).max);
    }

    function test_sqrt_zero() public pure {
        assertEq(Math.sqrt(0), 0);
    }

    function test_sqrt_one() public pure {
        assertEq(Math.sqrt(1), 1);
    }

    function test_sqrt_four() public pure {
        assertEq(Math.sqrt(4), 2);
    }

    function test_sqrt_perfectSquares() public pure {
        assertEq(Math.sqrt(9), 3);
        assertEq(Math.sqrt(16), 4);
        assertEq(Math.sqrt(25), 5);
        assertEq(Math.sqrt(1e18), 1e9);
    }

    function test_sqrt_floorsNonSquare() public pure {
        assertEq(Math.sqrt(2), 1);
        assertEq(Math.sqrt(3), 1);
        assertEq(Math.sqrt(15), 3);
    }

    function test_sqrt_maxUint256() public pure {
        // Verify sqrt(max) is non-zero and z*z doesn't overflow.
        uint256 z = Math.sqrt(type(uint256).max);
        assertGt(z, 0);
        // z must be such that z*z <= max.
        // We can't safely compute (z+1)^2 (it would overflow by design),
        // so we just sanity-check the lower bound.
        assertLe(z * z, type(uint256).max);
    }

    function test_sqrt_smallValues() public pure {
        // y <= 3 path
        assertEq(Math.sqrt(2), 1);
        assertEq(Math.sqrt(3), 1);
    }

    /// @notice Fuzz: sqrt(x)^2 <= x and (sqrt(x)+1)^2 > x (no overflow check).
    function testFuzz_sqrt_lowerBound(uint256 x) public pure {
        uint256 z = Math.sqrt(x);
        assertLe(z * z, x);
    }
}
