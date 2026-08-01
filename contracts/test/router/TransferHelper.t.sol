// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {TransferHelper} from "../../src/router/libraries/TransferHelper.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @title TransferHelperHarness — exposes the internal TransferHelper functions for testing.
contract TransferHelperHarness {
    function doSafeTransfer(address token, address to, uint256 value) external {
        TransferHelper.safeTransfer(token, to, value);
    }

    function doSafeTransferFrom(address token, address from, address to, uint256 value) external {
        TransferHelper.safeTransferFrom(token, from, to, value);
    }

    function doSafeTransferETH(address to, uint256 value) external payable {
        TransferHelper.safeTransferETH(to, value);
    }
}

/// @dev A contract whose `receive()` always reverts — used to test ETH send failure.
contract RevertingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}

/// @title TransferHelperTest — verifies safe transfer primitives.
contract TransferHelperTest is Test {
    TransferHelperHarness internal harness;
    MockERC20 internal token;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        harness = new TransferHelperHarness();
        token = new MockERC20("Token", "TKN", 18);
        // safeTransfer moves tokens FROM the caller (the harness), so the harness must hold them.
        token.mint(address(harness), 1000e18);
        // safeTransferFrom moves tokens from `from` (alice) via allowance, so alice holds them.
        token.mint(alice, 1000e18);
    }

    // -------- safeTransfer --------

    function test_safeTransfer_succeeds() public {
        harness.doSafeTransfer(address(token), bob, 100e18);
        assertEq(token.balanceOf(address(harness)), 900e18);
        assertEq(token.balanceOf(bob), 100e18);
    }

    function test_safeTransfer_revertsOnInsufficientBalance() public {
        vm.expectRevert(bytes("TransferHelper: TRANSFER_FAILED"));
        harness.doSafeTransfer(address(token), bob, 10_000e18);
    }

    // -------- safeTransferFrom --------

    function test_safeTransferFrom_succeeds() public {
        vm.startPrank(alice);
        token.approve(address(harness), 500e18);
        vm.stopPrank();
        vm.prank(alice);
        harness.doSafeTransferFrom(address(token), alice, bob, 200e18);
        assertEq(token.balanceOf(alice), 800e18);
        assertEq(token.balanceOf(bob), 200e18);
        assertEq(token.allowance(alice, address(harness)), 300e18);
    }

    function test_safeTransferFrom_revertsOnInsufficientAllowance() public {
        vm.startPrank(alice);
        token.approve(address(harness), 100e18);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(bytes("TransferHelper: TRANSFER_FROM_FAILED"));
        harness.doSafeTransferFrom(address(token), alice, bob, 200e18);
    }

    function test_safeTransferFrom_revertsOnInsufficientBalance() public {
        vm.startPrank(alice);
        token.approve(address(harness), type(uint256).max);
        vm.stopPrank();
        vm.prank(alice);
        vm.expectRevert(bytes("TransferHelper: TRANSFER_FROM_FAILED"));
        harness.doSafeTransferFrom(address(token), alice, bob, 10_000e18);
    }

    // -------- safeTransferETH --------

    function test_safeTransferETH_toEOA() public {
        address recipient = address(0xCAFE);
        harness.doSafeTransferETH{value: 1 ether}(recipient, 1 ether);
        assertEq(recipient.balance, 1 ether);
    }

    function test_safeTransferETH_revertsOnRevertingReceiver() public {
        RevertingReceiver receiver = new RevertingReceiver();
        vm.expectRevert(bytes("TransferHelper: ETH_TRANSFER_FAILED"));
        harness.doSafeTransferETH{value: 1 ether}(address(receiver), 1 ether);
    }
}
