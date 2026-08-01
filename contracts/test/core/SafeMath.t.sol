// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {Math} from "../../src/core/libraries/Math.sol";
import {SafeMath} from "../../src/core/libraries/SafeMath.sol";

/// @dev External caller for SafeMath (lib is `internal` and can't be tested directly).
contract SafeMathCaller {
    function add(uint256 x, uint256 y) external pure returns (uint256) {
        return SafeMath.add(x, y);
    }

    function sub(uint256 x, uint256 y) external pure returns (uint256) {
        return SafeMath.sub(x, y);
    }

    function mul(uint256 x, uint256 y) external pure returns (uint256) {
        return SafeMath.mul(x, y);
    }
}

contract SafeMathTest is Test {
    SafeMathCaller internal caller;

    function setUp() public {
        caller = new SafeMathCaller();
    }

    function test_add_basic() public view {
        assertEq(caller.add(1, 2), 3);
        assertEq(caller.add(0, 0), 0);
        assertEq(caller.add(100, 200), 300);
    }

    function test_add_overflowReverts() public {
        vm.expectRevert(bytes("SafeMath: ADD_OVERFLOW"));
        caller.add(type(uint256).max, 1);
    }

    function test_sub_basic() public view {
        assertEq(caller.sub(5, 3), 2);
        assertEq(caller.sub(100, 100), 0);
    }

    function test_sub_underflowReverts() public {
        vm.expectRevert(bytes("SafeMath: SUB_UNDERFLOW"));
        caller.sub(0, 1);
        vm.expectRevert(bytes("SafeMath: SUB_UNDERFLOW"));
        caller.sub(1, 2);
    }

    function test_mul_basic() public view {
        assertEq(caller.mul(3, 7), 21);
        assertEq(caller.mul(0, 999), 0);
        assertEq(caller.mul(1, type(uint256).max), type(uint256).max);
    }

    function test_mul_overflowReverts() public {
        vm.expectRevert(bytes("SafeMath: MUL_OVERFLOW"));
        caller.mul(type(uint256).max, 2);
    }
}
