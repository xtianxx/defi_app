// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {WETH9} from "../../src/router/WETH9.sol";

contract WETH9Test is Test {
    WETH9 internal weth;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        weth = new WETH9();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // -------- deposit --------

    function test_deposit_increasesBalance() public {
        vm.prank(alice);
        weth.deposit{value: 1 ether}();
        assertEq(weth.balanceOf(alice), 1 ether);
        assertEq(address(weth).balance, 1 ether);
    }

    function test_deposit_viaReceive() public {
        // Sending ETH directly triggers receive() -> deposit()
        vm.prank(alice);
        (bool ok,) = address(weth).call{value: 2 ether}("");
        assertTrue(ok);
        assertEq(weth.balanceOf(alice), 2 ether);
    }

    // -------- withdraw --------

    function test_withdraw_returnsETH() public {
        vm.startPrank(alice);
        weth.deposit{value: 5 ether}();
        uint256 balBefore = alice.balance;
        weth.withdraw(3 ether);
        vm.stopPrank();
        assertEq(weth.balanceOf(alice), 2 ether);
        assertEq(alice.balance, balBefore + 3 ether);
    }

    function test_withdraw_revertsOnInsufficientBalance() public {
        vm.startPrank(alice);
        weth.deposit{value: 1 ether}();
        vm.expectRevert(bytes("WETH9: INSUFFICIENT_BALANCE"));
        weth.withdraw(2 ether);
        vm.stopPrank();
    }

    // -------- transfer --------

    function test_transfer_movesBalance() public {
        vm.startPrank(alice);
        weth.deposit{value: 10 ether}();
        assertTrue(weth.transfer(bob, 4 ether), "transfer should succeed");
        vm.stopPrank();
        assertEq(weth.balanceOf(alice), 6 ether);
        assertEq(weth.balanceOf(bob), 4 ether);
    }

    function test_transfer_revertsOnInsufficientBalance() public {
        vm.startPrank(alice);
        weth.deposit{value: 1 ether}();
        vm.expectRevert(bytes("WETH9: INSUFFICIENT_BALANCE"));
        /// forge-lint: disable-next-line(erc20-unchecked-transfer)
        weth.transfer(bob, 2 ether);
        vm.stopPrank();
    }

    // -------- approve / transferFrom --------

    function test_approve_setsAllowance() public {
        vm.prank(alice);
        weth.approve(bob, 5 ether);
        assertEq(weth.allowance(alice, bob), 5 ether);
    }

    function test_transferFrom_respectsAllowance() public {
        vm.startPrank(alice);
        weth.deposit{value: 10 ether}();
        weth.approve(bob, 5 ether);
        vm.stopPrank();

        vm.prank(bob);
        assertTrue(weth.transferFrom(alice, bob, 3 ether), "transferFrom should succeed");

        assertEq(weth.balanceOf(alice), 7 ether);
        assertEq(weth.balanceOf(bob), 3 ether);
        assertEq(weth.allowance(alice, bob), 2 ether);
    }

    function test_transferFrom_revertsOnInsufficientAllowance() public {
        vm.startPrank(alice);
        weth.deposit{value: 10 ether}();
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(bytes("WETH9: INSUFFICIENT_ALLOWANCE"));
        /// forge-lint: disable-next-line(erc20-unchecked-transfer)
        weth.transferFrom(alice, bob, 3 ether);
    }

    // -------- totalSupply --------

    function test_totalSupply_equalsContractETHBalance() public {
        vm.prank(alice);
        weth.deposit{value: 3 ether}();
        vm.prank(bob);
        weth.deposit{value: 7 ether}();
        assertEq(weth.totalSupply(), 10 ether);
    }
}
