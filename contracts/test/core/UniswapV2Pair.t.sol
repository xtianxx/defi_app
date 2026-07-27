// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract UniswapV2PairTest is Test {
    UniswapV2Factory internal factory;
    UniswapV2Pair internal pair;
    MockERC20 internal token0;
    MockERC20 internal token1;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant RESERVE_TOKEN0 = 100 ether;
    uint256 internal constant RESERVE_TOKEN1 = 400 ether;

    function setUp() public {
        // Deploy two tokens and resolve the sorted order (token0 < token1 by address).
        MockERC20 ta = new MockERC20("TokenA", "TKA", 18);
        MockERC20 tb = new MockERC20("TokenB", "TKB", 18);
        (token0, token1) = address(ta) < address(tb) ? (ta, tb) : (tb, ta);

        factory = new UniswapV2Factory(address(this));
        pair = UniswapV2Pair(factory.createPair(address(token0), address(token1)));
    }

    function _addInitialLiquidity() internal {
        token0.mint(address(pair), RESERVE_TOKEN0);
        token1.mint(address(pair), RESERVE_TOKEN1);
        pair.mint(alice);
    }

    // -------- mint --------

    function test_mint_initialLiquidity_locksMinimumToAddressZero() public {
        _addInitialLiquidity();
        assertEq(pair.balanceOf(address(0)), 1000);
        // Expected LP = sqrt(RESERVE_TOKEN0 * RESERVE_TOKEN1) - 1000
        //              = sqrt(100e18 * 400e18) - 1000
        //              = 200e18 - 1000
        assertEq(pair.balanceOf(alice), 200 ether - 1000);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(r0, RESERVE_TOKEN0);
        assertEq(r1, RESERVE_TOKEN1);
    }

    function test_mint_subsequentProportional() public {
        _addInitialLiquidity();
        // Add 50 more of token0 and 200 of token1 (proportional 1:4)
        token0.mint(address(pair), 50 ether);
        token1.mint(address(pair), 200 ether);
        pair.mint(bob);
        // Bob's contribution is 50% of original. totalSupply after first mint
        // is 200e18 (sqrt(100*400)*1e18). Bob's LP = min(50*200/100, 200*200/400)
        // = min(100, 100) * 1e18 = 100e18.
        assertEq(pair.balanceOf(bob), 100 ether);
    }

    function test_mint_revertsIfNoLiquidity() public {
        // Send exactly 1 wei of each so the sqrt underflows (1*1=1 < 1000).
        // We expect the underflow panic, not the INSUFFICIENT_LIQUIDITY_MINTED revert.
        token0.mint(address(pair), 1);
        token1.mint(address(pair), 1);
        vm.expectRevert();
        pair.mint(alice);
    }

    // -------- burn --------

    function test_burn_returnsProportional() public {
        _addInitialLiquidity();
        uint256 lp = pair.balanceOf(alice);
        vm.prank(alice);
        pair.transfer(address(pair), lp);
        pair.burn(alice);
        // alice should have 0 LP. Due to MINIMUM_LIQUIDITY rounding, she gets
        // back her original token amounts minus rounding loss. The loss is
        // `liquidity * reserve / totalSupply` rounding: for token0 it's
        // ~500 wei, for token1 it's ~2000 wei. Use a 3000-wei tolerance.
        assertEq(pair.balanceOf(alice), 0);
        assertGe(token0.balanceOf(alice) + 1000, RESERVE_TOKEN0);
        assertGe(token1.balanceOf(alice) + 3000, RESERVE_TOKEN1);
    }

    // -------- swap --------

    function test_swap_respectsKInvariant() public {
        _addInitialLiquidity();
        // Simulate a swap: send 10 of token0 to the pair, request 36 of token1 out.
        // AMM: amountOut = amountIn * 997 * reserveOut / (reserveIn * 1000 + amountIn * 997)
        // = 10 * 997 * 400 / (100 * 1000 + 10 * 997) = 36.26 (passes K check with fee)
        token0.mint(address(pair), 10 ether);
        uint256 amountOut = 36 ether;
        pair.swap(0, amountOut, bob);
        assertGe(token1.balanceOf(bob), amountOut);
    }

    function test_swap_revertsOnZeroOutput() public {
        _addInitialLiquidity();
        vm.expectRevert(bytes("UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT"));
        pair.swap(0, 0, bob);
    }

    function test_swap_revertsOnInsufficientLiquidity() public {
        _addInitialLiquidity();
        // Asking for amount0Out > reserve0 should revert.
        vm.expectRevert(bytes("UniswapV2: INSUFFICIENT_LIQUIDITY"));
        pair.swap(RESERVE_TOKEN0 + 1, 0, bob);
    }

    function test_swap_revertsOnKViolation() public {
        _addInitialLiquidity();
        // Send tokens to the pair, then try to drain without paying the fee.
        token0.mint(address(pair), 1 ether);
        // Try to swap out nearly all of token1 — K check should fail.
        // Use RESERVE_TOKEN1 - 1 to pass the < reserve check but fail K.
        vm.expectRevert(bytes("UniswapV2: K"));
        pair.swap(0, RESERVE_TOKEN1 - 1, bob);
    }

    // -------- sync / skim --------

    function test_sync_updatesReservesToBalances() public {
        _addInitialLiquidity();
        // Donate tokens without calling mint
        token0.mint(address(pair), 1 ether);
        pair.sync();
        (uint112 r0,,) = pair.getReserves();
        assertEq(r0, RESERVE_TOKEN0 + 1 ether);
    }

    function test_skim_drainsExcess() public {
        _addInitialLiquidity();
        token0.mint(address(pair), 1 ether);
        pair.skim(alice);
        assertGe(token0.balanceOf(alice), 1 ether);
    }

    // -------- fee accrual --------

    function test_feeOn_doesNotRevert() public {
        // Verify the fee path is exercised when feeTo is set. Uniswap V2's
        // canonical fee design only mints fee LP when k grows above kLast,
        // which requires a specific imbalance setup. We just verify the path
        // doesn't revert when feeTo is set during a swap.
        factory.setFeeTo(address(0xFEE));
        _addInitialLiquidity();
        // Do a swap with a comfortable margin to ensure it passes K.
        token0.mint(address(pair), 1 ether);
        pair.swap(0, 3 ether, bob);
        // Verify the swap completed (bob got his tokens).
        assertGe(token1.balanceOf(bob), 3 ether);
    }

    function test_feeOff_resetsKLast() public {
        // When feeTo is reset to 0, kLast should be cleared.
        factory.setFeeTo(address(0xCAFE));
        _addInitialLiquidity();
        // Do a swap with fee on, then a mint with fee off.
        token0.mint(address(pair), 1 ether);
        pair.swap(0, 3 ether, bob);
        factory.setFeeTo(address(0));
        // Mint BOTH tokens proportionally so the second mint can compute non-zero LP.
        token0.mint(address(pair), 1 ether);
        token1.mint(address(pair), 4 ether);
        pair.mint(alice);
        // kLast should be 0 after the fee-off operation.
        assertEq(pair.kLast(), 0);
    }

    // -------- TWAP --------

    function test_twap_accumulatesOverTime() public {
        _addInitialLiquidity();
        uint256 p0Before = pair.price0CumulativeLast();
        uint256 p1Before = pair.price1CumulativeLast();
        // Wait for 100 seconds
        vm.warp(block.timestamp + 100);
        // Do a sync to flush the accumulators
        pair.sync();
        assertGt(pair.price0CumulativeLast(), p0Before);
        assertGt(pair.price1CumulativeLast(), p1Before);
    }
}
