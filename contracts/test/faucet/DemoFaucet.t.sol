// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {DemoFaucet} from "../../src/faucet/DemoFaucet.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {IERC20} from "../../src/router/interfaces/IERC20.sol";

contract DemoFaucetTest is Test {
    DemoFaucet internal faucet;
    MockERC20 internal weth;
    MockERC20 internal usdc;
    MockERC20 internal dai;
    MockERC20 internal wbtc;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    event Requested(address indexed wallet, uint256 timestamp);

    function setUp() public {
        weth = new MockERC20("WETH", "WETH", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        wbtc = new MockERC20("Wrapped BTC", "WBTC", 8);
        faucet = new DemoFaucet(IERC20(address(weth)), usdc, dai, wbtc);
        // Fund the WETH reserve (enough for several grants; MockERC20 is not a real WETH9).
        weth.mint(address(faucet), 1 ether);
        // Forge's genesis timestamp is 1, so a fresh wallet would be "rate limited" by
        // the naive 0 + WINDOW check. Real chains (Sepolia/anvil) are past genesis —
        // warp the test chain past the window so first requests are eligible.
        vm.warp(block.timestamp + faucet.WINDOW());
    }

    function test_Request_GrantsExactAmounts() public {
        vm.prank(alice);
        faucet.request();

        assertEq(weth.balanceOf(alice), faucet.WETH_AMOUNT());
        assertEq(usdc.balanceOf(alice), faucet.USDC_AMOUNT());
        assertEq(dai.balanceOf(alice), faucet.DAI_AMOUNT());
        assertEq(wbtc.balanceOf(alice), faucet.WBTC_AMOUNT());
        assertEq(weth.balanceOf(address(faucet)), 1 ether - faucet.WETH_AMOUNT());
    }

    function test_Request_RateLimitedWithinWindow() public {
        vm.prank(alice);
        faucet.request();

        vm.expectRevert(bytes("DemoFaucet: rate limited"));
        vm.prank(alice);
        faucet.request();
    }

    function test_Request_EligibleAfterWindow() public {
        vm.prank(alice);
        faucet.request();

        vm.warp(block.timestamp + faucet.WINDOW());
        vm.prank(alice);
        faucet.request();

        assertEq(weth.balanceOf(alice), 2 * faucet.WETH_AMOUNT());
        assertEq(usdc.balanceOf(alice), 2 * faucet.USDC_AMOUNT());
        assertEq(dai.balanceOf(alice), 2 * faucet.DAI_AMOUNT());
        assertEq(wbtc.balanceOf(alice), 2 * faucet.WBTC_AMOUNT());
    }

    function test_Request_BoundaryExactWindow() public {
        vm.prank(alice);
        faucet.request();
        uint256 firstRequestAt = faucet.lastRequestAt(alice);

        vm.warp(firstRequestAt + faucet.WINDOW() - 1);
        vm.expectRevert(bytes("DemoFaucet: rate limited"));
        vm.prank(alice);
        faucet.request();

        vm.warp(firstRequestAt + faucet.WINDOW());
        vm.prank(alice);
        faucet.request();

        assertEq(weth.balanceOf(alice), 2 * faucet.WETH_AMOUNT());
    }

    function test_Request_RejectsEth() public {
        // Route through a payable interface: solc 0.8.19 rejects `{value: 1}` on the
        // non-payable type at compile time, but the deployed contract's non-payable
        // check still reverts with empty data at runtime.
        vm.expectRevert();
        IPayableDemoFaucet(address(faucet)).request{value: 1}();
    }

    function test_Request_RevertsWhenWethReserveEmpty() public {
        DemoFaucet unfunded = new DemoFaucet(IERC20(address(weth)), usdc, dai, wbtc);

        vm.expectRevert(bytes("DemoFaucet: weth reserve empty"));
        vm.prank(alice);
        unfunded.request();
    }

    function test_NextEligibleTime_ZeroBeforeFirstRequest() public view {
        assertEq(faucet.nextEligibleTime(alice), 0);
    }

    function test_NextEligibleTime_EqualsLastPlusWindow() public {
        uint256 ts = block.timestamp;
        vm.prank(alice);
        faucet.request();

        assertEq(faucet.nextEligibleTime(alice), ts + faucet.WINDOW());
    }

    function test_Request_EmitsEvent() public {
        uint256 ts = block.timestamp;

        vm.expectEmit();
        emit Requested(alice, ts);
        vm.prank(alice);
        faucet.request();

        assertEq(usdc.balanceOf(alice), faucet.USDC_AMOUNT());
        assertEq(dai.balanceOf(alice), faucet.DAI_AMOUNT());
        assertEq(wbtc.balanceOf(alice), faucet.WBTC_AMOUNT());
        assertEq(weth.balanceOf(alice), faucet.WETH_AMOUNT());
    }

    function test_Request_IndependentPerWallet() public {
        vm.prank(alice);
        faucet.request();

        vm.prank(bob);
        faucet.request();

        assertEq(usdc.balanceOf(alice), faucet.USDC_AMOUNT());
        assertEq(usdc.balanceOf(bob), faucet.USDC_AMOUNT());
    }

    function testFuzz_Request_AnyWalletEligibleAfterWindow(address wallet, uint256 extra) public {
        wallet = address(uint160(bound(uint160(wallet), 1, type(uint160).max)));
        // Replenish the reserve so the fuzz run can never exhaust it (0.1 WETH per request).
        weth.mint(address(faucet), faucet.WETH_AMOUNT());

        // First request makes the wallet rate-limited (eligible again only after WINDOW).
        vm.prank(wallet);
        faucet.request();
        uint256 ts0 = faucet.lastRequestAt(wallet);

        // Warp at least one full window past the first request, then request again.
        vm.warp(block.timestamp + faucet.WINDOW() + (extra % 7 days));
        weth.mint(address(faucet), faucet.WETH_AMOUNT());
        vm.prank(wallet);
        faucet.request();

        // Eligibility math, asserted on the contract's own recorded state. Test-frame
        // `block.timestamp` reads around `vm.warp` are unreliable: via_ir may defer the
        // read past the cheatcode call (timestamp is transaction-invariant on real chains),
        // and `forge coverage --ir-minimum` serves a stale value — so the only test-frame
        // read is the warp argument, which is necessarily evaluated before the call.
        assertEq(faucet.nextEligibleTime(wallet), faucet.lastRequestAt(wallet) + faucet.WINDOW());
        assertGe(faucet.lastRequestAt(wallet), ts0 + faucet.WINDOW());
    }
}

/// @dev Test-only payable facade so the non-payable `request()` can be probed with `{value: 1}`.
interface IPayableDemoFaucet {
    function request() external payable;
}
