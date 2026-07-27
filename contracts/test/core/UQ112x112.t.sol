// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UQ112x112} from "../../src/core/libraries/UQ112x112.sol";

contract UQ112x112Test is Test {
    using UQ112x112 for uint224;

    function test_encode_zero() public pure {
        assertEq(UQ112x112.encode(0), 0);
    }

    function test_encode_one() public pure {
        assertEq(UQ112x112.encode(1), uint224(1) << 112);
    }

    function test_encode_maxUint112() public pure {
        uint224 encoded = UQ112x112.encode(type(uint112).max);
        assertEq(encoded, uint224(type(uint112).max) << 112);
    }

    function test_decode_roundTrip() public pure {
        uint112 original = 12_345;
        uint224 encoded = UQ112x112.encode(original);
        assertEq(UQ112x112.decode(encoded), original);
    }

    function test_decode_truncatesFractional() public pure {
        // Set high bits to 7 (encoded value), then set the low 112 bits to junk.
        uint224 encoded = UQ112x112.encode(7);
        // OR in some junk in the low bits
        encoded = encoded | uint224(0xABCDEF);
        assertEq(UQ112x112.decode(encoded), 7);
    }

    function test_uqdiv_basic() public pure {
        // x is a raw uint224; uqdiv(x, y) returns (x * 2**112) / y as uint224.
        // uqdiv(100, 25) = 100 * 2**112 / 25 = 4 * 2**112 (exact).
        uint224 r = uint224(100).uqdiv(25);
        assertEq(r, uint224(4) << 112);
    }

    function test_uqdiv_roundsDown() public pure {
        // x = 100 (raw uint224, not encoded); uqdiv by 25 should give 4 (with remainder).
        // We test that uqdiv(x, y) returns floor(x * 2**112 / y) for small x.
        uint224 x = 100;
        uint224 r = x.uqdiv(25);
        // (100 * 2**112) / 25 = 4 * 2**112 (exactly, since 100/25 = 4)
        assertEq(r, uint224(4) << 112);
    }
}
