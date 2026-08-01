// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Library} from "../../src/router/libraries/UniswapV2Library.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @dev External wrapper so library reverts occur at a lower call depth (vm.expectRevert requirement).
///      Library functions are `internal` and inlined; without this wrapper the revert happens in the
///      test's own frame and `vm.expectRevert` cannot match it.
contract LibraryHarness {
    function sortTokens(address a, address b) external pure returns (address, address) {
        return UniswapV2Library.sortTokens(a, b);
    }

    function pairFor(address factory, address a, address b) external pure returns (address) {
        return UniswapV2Library.pairFor(factory, a, b);
    }

    function getReserves(address factory, address a, address b) external view returns (uint256, uint256) {
        return UniswapV2Library.getReserves(factory, a, b);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256) {
        return UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256) {
        return UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }
}

contract UniswapV2LibraryTest is Test {
    UniswapV2Factory internal factory;
    LibraryHarness internal harness;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal feeSetter = address(0xFEE);

    function setUp() public {
        factory = new UniswapV2Factory(feeSetter);
        harness = new LibraryHarness();
        tokenA = new MockERC20("TokenA", "TKA", 18);
        tokenB = new MockERC20("TokenB", "TKB", 18);
    }

    // -------- sortTokens --------

    function test_sortTokens_ordersByAddress() public view {
        (address token0, address token1) = harness.sortTokens(address(tokenA), address(tokenB));
        assertEq(token0, address(tokenA) < address(tokenB) ? address(tokenA) : address(tokenB));
        assertEq(token1, address(tokenA) < address(tokenB) ? address(tokenB) : address(tokenA));
        assertTrue(token0 < token1);
    }

    function test_sortTokens_isSymmetric() public view {
        (address token0A, address token1A) = harness.sortTokens(address(tokenA), address(tokenB));
        (address token0B, address token1B) = harness.sortTokens(address(tokenB), address(tokenA));
        assertEq(token0A, token0B);
        assertEq(token1A, token1B);
    }

    function test_sortTokens_revertsOnIdentical() public {
        vm.expectRevert(bytes("UniswapV2Library: IDENTICAL_ADDRESSES"));
        harness.sortTokens(address(tokenA), address(tokenA));
    }

    // -------- pairFor --------

    function test_pairFor_matchesCreatePair() public {
        // The CREATE2 address computed by the library must equal the actual deployed pair.
        address predicted = harness.pairFor(address(factory), address(tokenA), address(tokenB));
        address actual = factory.createPair(address(tokenA), address(tokenB));
        assertEq(predicted, actual);
    }

    function test_pairFor_isSymmetric() public view {
        address ab = harness.pairFor(address(factory), address(tokenA), address(tokenB));
        address ba = harness.pairFor(address(factory), address(tokenB), address(tokenA));
        assertEq(ab, ba);
    }

    function test_pairFor_usesDynamicInitHash() public view {
        // R0.4: pairFor reads the init-code hash from the factory, so it must match
        // keccak256(type(UniswapV2Pair).creationCode) — the same value the factory returns.
        bytes32 hashFromFactory = factory.pairCodeHash();
        bytes32 hashFromCode = keccak256(type(UniswapV2Pair).creationCode);
        assertEq(hashFromFactory, hashFromCode);
    }

    // -------- getReserves --------

    function test_getReserves_ordersByTokenOrder() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        // Seed reserves: transfer tokens to the pair and mint liquidity.
        tokenA.mint(pair, 1000e18);
        tokenB.mint(pair, 2000e18);
        UniswapV2Pair(pair).mint(address(this));

        (uint256 reserveA, uint256 reserveB) = harness.getReserves(address(factory), address(tokenA), address(tokenB));
        assertEq(reserveA, 1000e18);
        assertEq(reserveB, 2000e18);

        // Reverse order: reserves must follow the token argument order.
        (uint256 reserveB2, uint256 reserveA2) = harness.getReserves(address(factory), address(tokenB), address(tokenA));
        assertEq(reserveB2, 2000e18);
        assertEq(reserveA2, 1000e18);
    }

    function test_getReserves_zeroBeforeSeeding() public {
        factory.createPair(address(tokenA), address(tokenB));
        (uint256 reserveA, uint256 reserveB) = harness.getReserves(address(factory), address(tokenA), address(tokenB));
        assertEq(reserveA, 0);
        assertEq(reserveB, 0);
    }

    // -------- getAmountOut --------

    function test_getAmountOut_appliesFee() public view {
        // 0.3% fee: amountIn * 997 * reserveOut / (reserveIn * 1000 + amountIn * 997)
        uint256 amountIn = 1e18;
        uint256 reserveIn = 100e18;
        uint256 reserveOut = 200e18;
        uint256 expected = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997);
        uint256 actual = harness.getAmountOut(amountIn, reserveIn, reserveOut);
        assertEq(actual, expected);
    }

    function test_getAmountOut_knownValue() public view {
        // 1 token in, 100/100 reserves => ~0.9851... out (after 0.3% fee).
        uint256 amountIn = 1e18;
        uint256 reserveIn = 100e18;
        uint256 reserveOut = 100e18;
        uint256 out = harness.getAmountOut(amountIn, reserveIn, reserveOut);
        uint256 expected = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997);
        assertEq(out, expected);
        assertTrue(out > 0);
    }

    function test_getAmountOut_revertsOnZeroInput() public {
        vm.expectRevert(bytes("UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT"));
        harness.getAmountOut(0, 100e18, 100e18);
    }

    function test_getAmountOut_revertsOnZeroReserve() public {
        vm.expectRevert(bytes("UniswapV2Library: INSUFFICIENT_LIQUIDITY"));
        harness.getAmountOut(1e18, 0, 100e18);
    }

    function test_getAmountOut_revertsOnZeroReserveOut() public {
        vm.expectRevert(bytes("UniswapV2Library: INSUFFICIENT_LIQUIDITY"));
        harness.getAmountOut(1e18, 100e18, 0);
    }

    // -------- getAmountIn --------

    function test_getAmountIn_reverseFormula() public view {
        uint256 amountOut = 1e18;
        uint256 reserveIn = 100e18;
        uint256 reserveOut = 100e18;
        uint256 expected = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1;
        uint256 actual = harness.getAmountIn(amountOut, reserveIn, reserveOut);
        assertEq(actual, expected);
    }

    function test_getAmountIn_roundTripsGetAmountOut() public view {
        // getAmountIn(getAmountOut(x)) ≈ x (within rounding of the +1 ceil).
        uint256 amountIn = 5e18;
        uint256 reserveIn = 100e18;
        uint256 reserveOut = 200e18;
        uint256 out = harness.getAmountOut(amountIn, reserveIn, reserveOut);
        uint256 back = harness.getAmountIn(out, reserveIn, reserveOut);
        // The reverse should be >= original input (ceil +1) and within 1 wei of original + rounding.
        assertGe(back, amountIn);
        assertLe(back - amountIn, 2);
    }

    function test_getAmountIn_revertsOnZeroOutput() public {
        vm.expectRevert(bytes("UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT"));
        harness.getAmountIn(0, 100e18, 100e18);
    }

    function test_getAmountIn_revertsOnZeroReserve() public {
        vm.expectRevert(bytes("UniswapV2Library: INSUFFICIENT_LIQUIDITY"));
        harness.getAmountIn(1e18, 0, 100e18);
    }
}
