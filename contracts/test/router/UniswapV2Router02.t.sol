// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Router02} from "../../src/router/UniswapV2Router02.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {WETH9} from "../../src/router/WETH9.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {UniswapV2Library} from "../../src/router/libraries/UniswapV2Library.sol";
import {Math} from "../../src/core/libraries/Math.sol";

/// @title UniswapV2Router02Test — swap + liquidity entrypoints (Phases 3–5 / US1–US3).
/// @notice Swap paths are direct-pair only; add/remove liquidity (incl. ETH + permit variants)
///         are fully implemented.
contract UniswapV2Router02Test is Test {
    UniswapV2Factory internal factory;
    WETH9 internal weth;
    UniswapV2Router02 internal router;

    MockERC20 internal usdc; // 6 decimals
    MockERC20 internal dai; // 18 decimals

    address internal pairWethUsdc;
    address internal pairWethDai;
    address internal pairUsdcDai;

    address internal trader = address(0x7AB4);
    address internal recipient = address(0x8EC1);

    uint256 internal constant DEADLINE = type(uint256).max;

    function setUp() public {
        factory = new UniswapV2Factory(address(this));
        weth = new WETH9();
        router = new UniswapV2Router02(address(factory), address(weth));

        usdc = new MockERC20("USD Coin", "USDC", 6);
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);

        pairWethUsdc = factory.createPair(address(weth), address(usdc));
        pairWethDai = factory.createPair(address(weth), address(dai));
        pairUsdcDai = factory.createPair(address(usdc), address(dai));

        // Seed liquidity by transferring tokens to each pair and minting LP tokens.
        _seedPair(pairWethUsdc, address(weth), 10 ether, address(usdc), 20_000e6);
        _seedPair(pairWethDai, address(weth), 10 ether, address(dai), 10_000e18);
        _seedPair(pairUsdcDai, address(usdc), 10_000e6, address(dai), 10_000e18);

        // Fund the trader with tokens + ETH for swap tests.
        usdc.mint(trader, 1_000_000e6);
        dai.mint(trader, 1_000_000e18);
        vm.deal(trader, 1000 ether);

        // Approve the router to spend the trader's tokens.
        vm.startPrank(trader);
        usdc.approve(address(router), type(uint256).max);
        dai.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    /// @dev Transfer `amountA` of `tokenA` and `amountB` of `tokenB` to `pair`, then mint LP.
    function _seedPair(address pair, address tokenA, uint256 amountA, address tokenB, uint256 amountB) internal {
        // Mint tokens to this contract (the LP provider).
        if (tokenA == address(weth)) {
            weth.deposit{value: amountA}();
        } else {
            MockERC20(tokenA).mint(address(this), amountA);
        }
        if (tokenB == address(weth)) {
            weth.deposit{value: amountB}();
        } else {
            MockERC20(tokenB).mint(address(this), amountB);
        }

        // Transfer tokens to the pair.
        _transfer(tokenA, address(this), pair, amountA);
        _transfer(tokenB, address(this), pair, amountB);

        // Mint LP tokens to this contract.
        UniswapV2Pair(pair).mint(address(this));
    }

    /// @dev Low-level transfer that works for both WETH9 and MockERC20.
    function _transfer(address token, address from, address to, uint256 value) internal {
        if (from == address(this)) {
            (bool ok,) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, value));
            require(ok, "setup: transfer failed");
        } else {
            (bool ok,) = token.call(abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, value));
            require(ok, "setup: transferFrom failed");
        }
    }

    /// @dev Transfer `amount` LP tokens of `pair` from this contract (the seeder) to `to`,
    ///      then approve the router to spend them on `to`'s behalf.
    function _fundLp(address pair, address to, uint256 amount) internal {
        UniswapV2Pair(pair).transfer(to, amount);
        vm.prank(to);
        UniswapV2Pair(pair).approve(address(router), type(uint256).max);
    }

    // ---------------------------------------------------------------------------------------------
    // swapExactTokensForTokens
    // ---------------------------------------------------------------------------------------------

    function test_swapExactTokensForTokens_succeeds() public {
        uint256 amountIn = 100e6; // 100 USDC
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);

        uint256 daiBefore = dai.balanceOf(recipient);
        uint256 usdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256[] memory amounts = router.swapExactTokensForTokens(amountIn, 0, path, recipient, DEADLINE);

        assertEq(amounts[0], amountIn);
        assertTrue(amounts[1] > 0);
        assertEq(usdc.balanceOf(trader), usdcBefore - amountIn);
        assertEq(dai.balanceOf(recipient), daiBefore + amounts[1]);
    }

    function test_swapExactTokensForTokens_revertsOnMultiHop() public {
        address[] memory path = new address[](3);
        path[0] = address(usdc);
        path[1] = address(dai);
        path[2] = address(weth);

        vm.prank(trader);
        vm.expectRevert(UniswapV2Router02.DirectPairOnly.selector);
        router.swapExactTokensForTokens(100e6, 0, path, recipient, DEADLINE);
    }

    function test_swapExactTokensForTokens_revertsOnExpiredDeadline() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: EXPIRED"));
        router.swapExactTokensForTokens(100e6, 0, path, recipient, block.timestamp - 1);
    }

    function test_swapExactTokensForTokens_revertsOnInsufficientOutput() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);

        // Demand more output than the pool can provide.
        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(100e6, type(uint256).max, path, recipient, DEADLINE);
    }

    function test_swapExactTokensForTokens_revertsOnZeroInput() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT"));
        router.swapExactTokensForTokens(0, 0, path, recipient, DEADLINE);
    }

    // ---------------------------------------------------------------------------------------------
    // swapTokensForExactTokens
    // ---------------------------------------------------------------------------------------------

    function test_swapTokensForExactTokens_succeeds() public {
        uint256 amountOut = 50e18; // want exactly 50 DAI
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);

        uint256 daiBefore = dai.balanceOf(recipient);
        uint256 usdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256[] memory amounts =
            router.swapTokensForExactTokens(amountOut, type(uint256).max, path, recipient, DEADLINE);

        assertEq(amounts[1], amountOut);
        assertTrue(amounts[0] > 0);
        assertEq(dai.balanceOf(recipient), daiBefore + amountOut);
        assertEq(usdc.balanceOf(trader), usdcBefore - amounts[0]);
    }

    function test_swapTokensForExactTokens_revertsOnExcessiveInput() public {
        uint256 amountOut = 50e18;
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: EXCESSIVE_INPUT_AMOUNT"));
        router.swapTokensForExactTokens(amountOut, 0, path, recipient, DEADLINE);
    }

    function test_swapTokensForExactTokens_revertsOnMultiHop() public {
        address[] memory path = new address[](3);
        path[0] = address(usdc);
        path[1] = address(dai);
        path[2] = address(weth);

        vm.prank(trader);
        vm.expectRevert(UniswapV2Router02.DirectPairOnly.selector);
        router.swapTokensForExactTokens(1e18, type(uint256).max, path, recipient, DEADLINE);
    }

    // ---------------------------------------------------------------------------------------------
    // swapExactETHForTokens
    // ---------------------------------------------------------------------------------------------

    function test_swapExactETHForTokens_succeeds() public {
        uint256 amountIn = 1 ether;
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);

        uint256 usdcBefore = usdc.balanceOf(recipient);
        uint256 ethBefore = trader.balance;

        vm.prank(trader);
        uint256[] memory amounts = router.swapExactETHForTokens{value: amountIn}(0, path, recipient, DEADLINE);

        assertEq(amounts[0], amountIn);
        assertTrue(amounts[1] > 0);
        assertEq(trader.balance, ethBefore - amountIn);
        assertEq(usdc.balanceOf(recipient), usdcBefore + amounts[1]);
    }

    function test_swapExactETHForTokens_revertsOnInvalidPath() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc); // path[0] must be WETH
        path[1] = address(dai);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INVALID_PATH"));
        router.swapExactETHForTokens{value: 1 ether}(0, path, recipient, DEADLINE);
    }

    // ---------------------------------------------------------------------------------------------
    // swapExactTokensForETH
    // ---------------------------------------------------------------------------------------------

    function test_swapExactTokensForETH_succeeds() public {
        uint256 amountIn = 100e6; // 100 USDC
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(weth);

        uint256 ethBefore = recipient.balance;
        uint256 usdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256[] memory amounts = router.swapExactTokensForETH(amountIn, 0, path, recipient, DEADLINE);

        assertTrue(amounts[1] > 0);
        assertEq(usdc.balanceOf(trader), usdcBefore - amountIn);
        assertEq(recipient.balance, ethBefore + amounts[1]);
    }

    function test_swapExactTokensForETH_revertsOnInvalidPath() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai); // path[1] must be WETH

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INVALID_PATH"));
        router.swapExactTokensForETH(100e6, 0, path, recipient, DEADLINE);
    }

    // ---------------------------------------------------------------------------------------------
    // swapTokensForExactETH
    // ---------------------------------------------------------------------------------------------

    function test_swapTokensForExactETH_succeeds() public {
        uint256 amountOut = 0.5 ether; // want exactly 0.5 ETH
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(weth);

        uint256 ethBefore = recipient.balance;
        uint256 usdcBefore = usdc.balanceOf(trader);

        vm.prank(trader);
        uint256[] memory amounts = router.swapTokensForExactETH(amountOut, type(uint256).max, path, recipient, DEADLINE);

        assertEq(amounts[1], amountOut);
        assertTrue(amounts[0] > 0);
        assertEq(recipient.balance, ethBefore + amountOut);
        assertEq(usdc.balanceOf(trader), usdcBefore - amounts[0]);
    }

    function test_swapTokensForExactETH_revertsOnInvalidPath() public {
        address[] memory path = new address[](2);
        path[0] = address(weth); // path[1] must be WETH
        path[1] = address(usdc);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INVALID_PATH"));
        router.swapTokensForExactETH(0.5 ether, type(uint256).max, path, recipient, DEADLINE);
    }

    // ---------------------------------------------------------------------------------------------
    // swapETHForExactTokens
    // ---------------------------------------------------------------------------------------------

    function test_swapETHForExactTokens_succeeds() public {
        uint256 amountOut = 100e6; // want exactly 100 USDC
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);

        uint256 usdcBefore = usdc.balanceOf(recipient);
        uint256 ethBefore = trader.balance;

        // Send more ETH than needed to verify the refund path.
        uint256 sent = 5 ether;
        vm.prank(trader);
        uint256[] memory amounts = router.swapETHForExactTokens{value: sent}(amountOut, path, recipient, DEADLINE);

        assertEq(amounts[1], amountOut);
        assertTrue(amounts[0] > 0 && amounts[0] <= sent);
        assertEq(usdc.balanceOf(recipient), usdcBefore + amountOut);
        // Trader only spent amounts[0] ETH (excess refunded).
        assertEq(trader.balance, ethBefore - amounts[0]);
    }

    function test_swapETHForExactTokens_revertsOnExcessiveInput() public {
        uint256 amountOut = 100e6;
        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(usdc);

        // Send too little ETH.
        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: EXCESSIVE_INPUT_AMOUNT"));
        router.swapETHForExactTokens{value: 1}(amountOut, path, recipient, DEADLINE);
    }

    function test_swapETHForExactTokens_revertsOnInvalidPath() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc); // path[0] must be WETH
        path[1] = address(dai);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INVALID_PATH"));
        router.swapETHForExactTokens{value: 1 ether}(100e18, path, recipient, DEADLINE);
    }

    // ---------------------------------------------------------------------------------------------
    // addLiquidity — Phase 4 / US2
    // ---------------------------------------------------------------------------------------------

    function test_addLiquidity_succeeds_proportional() public {
        uint256 amountADesired = 1000e6; // 1000 USDC
        uint256 amountBDesired = 1000e18; // 1000 DAI
        // pool ratio is 1:1 so desired amounts are already proportional

        uint256 usdcBefore = usdc.balanceOf(trader);
        uint256 daiBefore = dai.balanceOf(trader);
        (uint256 reserveA0, uint256 reserveB0) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(dai));

        vm.prank(trader);
        (uint256 amountA, uint256 amountB, uint256 liquidity) =
            router.addLiquidity(address(usdc), address(dai), amountADesired, amountBDesired, 0, 0, trader, DEADLINE);

        // Proportional adjustment — both amounts used as-is since ratio matches
        assertEq(amountA, amountADesired, "amountA should match desired");
        assertEq(amountB, amountBDesired, "amountB should match desired");
        assertTrue(liquidity > 0, "liquidity should be > 0");

        // Balances decrease
        assertEq(usdc.balanceOf(trader), usdcBefore - amountA, "USDC balance should decrease");
        assertEq(dai.balanceOf(trader), daiBefore - amountB, "DAI balance should decrease");

        // Reserves increase
        (uint256 reserveA1, uint256 reserveB1) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(dai));
        assertEq(reserveA1 - reserveA0, amountA, "USDC reserve should increase by amountA");
        assertEq(reserveB1 - reserveB0, amountB, "DAI reserve should increase by amountB");
    }

    function test_addLiquidity_firstProvider() public {
        MockERC20 tokenA = new MockERC20("TokenA", "TKNA", 18);
        MockERC20 tokenB = new MockERC20("TokenB", "TKNB", 18);

        uint256 amountADesired = 1 ether;
        uint256 amountBDesired = 2 ether;

        // Fund and approve trader for the new tokens
        tokenA.mint(trader, amountADesired);
        tokenB.mint(trader, amountBDesired);
        vm.startPrank(trader);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        vm.stopPrank();

        // Factory should not have a pair for these tokens yet
        assertEq(factory.getPair(address(tokenA), address(tokenB)), address(0), "pair should not exist yet");

        vm.prank(trader);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), amountADesired, amountBDesired, 0, 0, trader, DEADLINE
        );

        // First provider: amounts used as-is
        assertEq(amountA, amountADesired, "amountA should match desired");
        assertEq(amountB, amountBDesired, "amountB should match desired");

        // LP = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY
        uint256 expectedLiquidity = Math.sqrt(amountA * amountB) - 1000;
        assertEq(liquidity, expectedLiquidity, "liquidity should match expected formula");

        // Pair should now exist (created inside _addLiquidity)
        address pairAddr = factory.getPair(address(tokenA), address(tokenB));
        assertTrue(pairAddr != address(0), "pair should exist after addLiquidity");

        // MINIMUM_LIQUIDITY burned to address(0)
        assertEq(
            UniswapV2Pair(pairAddr).totalSupply(), liquidity + 1000, "totalSupply should include MINIMUM_LIQUIDITY"
        );
        assertEq(UniswapV2Pair(pairAddr).balanceOf(address(0)), 1000, "MINIMUM_LIQUIDITY should be at address(0)");
    }

    function test_addLiquidity_revertsOnSlippageA() public {
        uint256 amountADesired = 1000e6;
        uint256 amountBDesired = 1000e18;
        // Pool ratio is 1:1, so amountA will be 1000e6; set min higher to fail
        uint256 amountAMin = amountADesired + 1;

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_A_AMOUNT"));
        router.addLiquidity(
            address(usdc), address(dai), amountADesired, amountBDesired, amountAMin, 0, trader, DEADLINE
        );
    }

    function test_addLiquidity_revertsOnSlippageB() public {
        uint256 amountADesired = 1000e6;
        uint256 amountBDesired = 1000e18;
        // Pool ratio is 1:1, so amountB will be 1000e18; set min higher to fail
        uint256 amountBMin = amountBDesired + 1;

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_B_AMOUNT"));
        router.addLiquidity(
            address(usdc), address(dai), amountADesired, amountBDesired, 0, amountBMin, trader, DEADLINE
        );
    }

    function test_addLiquidity_asymmetricAdjustment() public {
        uint256 amountADesired = 1000e6; // 1000 USDC
        uint256 amountBDesired = 100e18; // only 100 DAI (unbalanced vs 1:1 pool ratio)

        uint256 usdcBefore = usdc.balanceOf(trader);
        uint256 daiBefore = dai.balanceOf(trader);

        vm.prank(trader);
        (uint256 amountA, uint256 amountB, uint256 liquidity) =
            router.addLiquidity(address(usdc), address(dai), amountADesired, amountBDesired, 0, 0, trader, DEADLINE);

        // System should adjust to the constraining side (DAI is the constraint)
        assertTrue(amountA <= amountADesired, "amountA should be <= amountADesired");
        assertTrue(amountB <= amountBDesired, "amountB should be <= amountBDesired");
        assertTrue(liquidity > 0, "liquidity should be > 0");

        // Since DAI (100e18) is less than the optimal ratio requires for 1000 USDC,
        // amountB should equal amountBDesired and amountA should be adjusted down.
        // amountA = quote(100e18, 10000e18, 10000e6) = 100e6
        assertEq(amountB, amountBDesired, "amountB should match constraining DAI desired");
        assertEq(amountA, 100e6, "amountA should be adjusted down to 100 USDC");

        // Check balances
        assertEq(usdc.balanceOf(trader), usdcBefore - amountA);
        assertEq(dai.balanceOf(trader), daiBefore - amountB);
    }

    function test_addLiquidityETH_succeeds() public {
        uint256 amountTokenDesired = 1000e6; // 1000 USDC
        uint256 msgValue = 1 ether; // send extra to test refund

        uint256 usdcBefore = usdc.balanceOf(trader);
        uint256 ethBefore = trader.balance;
        (uint256 reserveToken0, uint256 reserveEth0) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(weth));

        vm.prank(trader);
        (uint256 amountToken, uint256 amountETH, uint256 liquidity) =
            router.addLiquidityETH{value: msgValue}(address(usdc), amountTokenDesired, 0, 0, trader, DEADLINE);

        // Pool ratio: 10 WETH : 20000 USDC → 1000 USDC requires 0.5 ETH
        assertEq(amountToken, 1000e6, "amountToken should be 1000 USDC");
        assertEq(amountETH, 0.5 ether, "amountETH should be 0.5 ether");
        assertTrue(liquidity > 0, "liquidity should be > 0");

        // USDC balance decreased
        assertEq(usdc.balanceOf(trader), usdcBefore - amountToken);

        // ETH balance net: sent 1 ETH, used 0.5 ETH, refunded 0.5 ETH → net -0.5 ETH
        assertEq(trader.balance, ethBefore - amountETH, "ETH balance net should decrease by amountETH");

        // Reserves increased
        (uint256 reserveToken1, uint256 reserveEth1) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(weth));
        assertEq(reserveToken1 - reserveToken0, amountToken, "USDC reserve should increase");
        assertEq(reserveEth1 - reserveEth0, amountETH, "WETH reserve should increase");
    }

    function test_addLiquidityETH_revertsOnInsufficientETH() public {
        uint256 amountTokenDesired = 1000e6;
        uint256 amountETHMin = 0.5 ether; // require at least 0.5 ETH

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_B_AMOUNT"));
        router.addLiquidityETH{value: 1 wei}(address(usdc), amountTokenDesired, 0, amountETHMin, trader, DEADLINE);
    }

    function test_addLiquidity_revertsOnExpiredDeadline() public {
        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: EXPIRED"));
        router.addLiquidity(address(usdc), address(dai), 1000e6, 1000e18, 0, 0, trader, block.timestamp - 1);
    }

    // ---------------------------------------------------------------------------------------------
    // removeLiquidity — Phase 5 / US3
    // ---------------------------------------------------------------------------------------------

    /// @dev Removing a partial LP position returns amounts proportional to the pool share
    ///      (floor-rounded), burns the LP, and moves the tokens to the caller.
    function test_removeLiquidity_succeeds_proportional() public {
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this)) / 2;
        _fundLp(pairUsdcDai, trader, liquidity);

        (uint256 reserveA, uint256 reserveB) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(dai));
        uint256 totalSupply = UniswapV2Pair(pairUsdcDai).totalSupply();
        uint256 usdcBefore = usdc.balanceOf(trader);
        uint256 daiBefore = dai.balanceOf(trader);

        vm.prank(trader);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(usdc), address(dai), liquidity, 0, 0, trader, DEADLINE);

        // Proportional to pool share (floor rounding within 1 wei).
        assertApproxEqAbs(amountA, liquidity * reserveA / totalSupply, 1, "amountA should match proportional share");
        assertApproxEqAbs(amountB, liquidity * reserveB / totalSupply, 1, "amountB should match proportional share");

        // Trader receives exactly the returned amounts.
        assertEq(usdc.balanceOf(trader), usdcBefore + amountA, "trader USDC balance should increase by amountA");
        assertEq(dai.balanceOf(trader), daiBefore + amountB, "trader DAI balance should increase by amountB");

        // Reserves decrease by the returned amounts.
        (uint256 reserveA1, uint256 reserveB1) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(dai));
        assertEq(reserveA1, reserveA - amountA, "USDC reserve should decrease by amountA");
        assertEq(reserveB1, reserveB - amountB, "DAI reserve should decrease by amountB");

        // LP tokens are burned.
        assertEq(
            UniswapV2Pair(pairUsdcDai).totalSupply(),
            totalSupply - liquidity,
            "totalSupply should decrease by liquidity"
        );
        assertEq(UniswapV2Pair(pairUsdcDai).balanceOf(trader), 0, "trader LP balance should be spent");
    }

    /// @dev Removing 100% of the LP position closes it: LP balance hits zero, both tokens are
    ///      released, and totalSupply shrinks by the burned liquidity.
    function test_removeLiquidity_100PercentClosesPosition() public {
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this));
        _fundLp(pairUsdcDai, trader, liquidity);
        uint256 totalSupplyBefore = UniswapV2Pair(pairUsdcDai).totalSupply();

        vm.prank(trader);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(usdc), address(dai), liquidity, 0, 0, trader, DEADLINE);

        assertEq(UniswapV2Pair(pairUsdcDai).balanceOf(trader), 0, "trader LP balance should be 0 (position closed)");
        assertEq(UniswapV2Pair(pairUsdcDai).totalSupply(), totalSupplyBefore - liquidity, "totalSupply should decrease");
        assertTrue(amountA > 0, "amountA should be > 0");
        assertTrue(amountB > 0, "amountB should be > 0");
    }

    /// @dev Removing with `amountAMin` above the actual return reverts with the A slippage reason.
    function test_removeLiquidity_revertsOnSlippageA() public {
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this));
        _fundLp(pairUsdcDai, trader, liquidity);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_A_AMOUNT"));
        router.removeLiquidity(address(usdc), address(dai), liquidity, type(uint256).max, 0, trader, DEADLINE);
    }

    /// @dev Removing with `amountBMin` above the actual return reverts with the B slippage reason.
    function test_removeLiquidity_revertsOnSlippageB() public {
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this));
        _fundLp(pairUsdcDai, trader, liquidity);

        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_B_AMOUNT"));
        router.removeLiquidity(address(usdc), address(dai), liquidity, 0, type(uint256).max, trader, DEADLINE);
    }

    /// @dev A user without a router LP approval cannot remove liquidity (transferFrom fails).
    function test_removeLiquidity_revertsWithoutApproval() public {
        address bad = address(0xBAD);
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this)) / 2;
        UniswapV2Pair(pairUsdcDai).transfer(bad, liquidity); // LP given, but NO approval

        vm.prank(bad);
        vm.expectRevert(bytes("TransferHelper: TRANSFER_FROM_FAILED"));
        router.removeLiquidity(address(usdc), address(dai), liquidity, 0, 0, bad, DEADLINE);
    }

    /// @dev Expired deadlines are rejected before any state change.
    function test_removeLiquidity_revertsOnExpiredDeadline() public {
        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: EXPIRED"));
        router.removeLiquidity(address(usdc), address(dai), 1e18, 0, 0, trader, block.timestamp - 1);
    }

    /// @dev Optional: adding as trader then removing 100% recovers exactly the proportional share.
    function test_removeLiquidity_returnsProportionalToShare() public {
        // Trader adds liquidity to the already-seeded USDC/DAI pool.
        vm.prank(trader);
        (uint256 amountA, uint256 amountB, uint256 liquidity) =
            router.addLiquidity(address(usdc), address(dai), 1000e6, 1000e18, 0, 0, trader, DEADLINE);

        // The router needs an LP allowance to burn the trader's freshly minted position.
        vm.prank(trader);
        UniswapV2Pair(pairUsdcDai).approve(address(router), type(uint256).max);

        (uint256 reserveA, uint256 reserveB) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(dai));
        uint256 totalSupply = UniswapV2Pair(pairUsdcDai).totalSupply();

        vm.prank(trader);
        (uint256 outA, uint256 outB) =
            router.removeLiquidity(address(usdc), address(dai), liquidity, 0, 0, trader, DEADLINE);

        // Trader recovers ~what they deposited, proportional to their pool share.
        assertApproxEqAbs(outA, amountA, 1, "trader should recover ~amountA");
        assertApproxEqAbs(outB, amountB, 1, "trader should recover ~amountB");
        assertApproxEqAbs(outA, liquidity * reserveA / totalSupply, 1, "outA should match proportional share");
        assertApproxEqAbs(outB, liquidity * reserveB / totalSupply, 1, "outB should match proportional share");
    }

    // ---------------------------------------------------------------------------------------------
    // removeLiquidityETH — Phase 5 / US3
    // ---------------------------------------------------------------------------------------------

    /// @dev Removing from a WETH pair unwraps WETH to ETH and delivers both token and ETH to `to`.
    function test_removeLiquidityETH_succeeds() public {
        uint256 liquidity = UniswapV2Pair(pairWethUsdc).balanceOf(address(this));
        _fundLp(pairWethUsdc, trader, liquidity);

        (uint256 reserveToken, uint256 reserveEth) =
            UniswapV2Library.getReserves(address(factory), address(usdc), address(weth));
        uint256 totalSupply = UniswapV2Pair(pairWethUsdc).totalSupply();
        uint256 usdcBefore = usdc.balanceOf(recipient);
        uint256 ethBefore = recipient.balance;

        vm.prank(trader);
        (uint256 amountToken, uint256 amountETH) =
            router.removeLiquidityETH(address(usdc), liquidity, 0, 0, recipient, DEADLINE);

        assertApproxEqAbs(
            amountToken, liquidity * reserveToken / totalSupply, 1, "USDC should match proportional share"
        );
        assertApproxEqAbs(amountETH, liquidity * reserveEth / totalSupply, 1, "ETH should match proportional share");
        assertEq(usdc.balanceOf(recipient), usdcBefore + amountToken, "recipient should receive USDC");
        assertEq(recipient.balance, ethBefore + amountETH, "recipient should receive ETH");
    }

    /// @dev Expired deadlines are rejected before any state change.
    function test_removeLiquidityETH_revertsOnExpiredDeadline() public {
        vm.prank(trader);
        vm.expectRevert(bytes("UniswapV2: EXPIRED"));
        router.removeLiquidityETH(address(usdc), 1e18, 0, 0, trader, block.timestamp - 1);
    }

    // ---------------------------------------------------------------------------------------------
    // removeLiquidityWithPermit — Phase 5 / US3
    // ---------------------------------------------------------------------------------------------

    /// @dev A signed EIP-712 permit (no prior approval) authorizes the router to burn LP.
    function test_removeLiquidityWithPermit_succeeds() public {
        uint256 lpKey = 0xA11CE;
        address lpOwner = vm.addr(lpKey);
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this)) / 2;
        UniswapV2Pair(pairUsdcDai).transfer(lpOwner, liquidity); // LP given, but NO approve

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                UniswapV2Pair(pairUsdcDai).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        UniswapV2Pair(pairUsdcDai).PERMIT_TYPEHASH(),
                        lpOwner,
                        address(router),
                        liquidity,
                        UniswapV2Pair(pairUsdcDai).nonces(lpOwner),
                        DEADLINE
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(lpKey, digest);

        uint256 usdcBefore = usdc.balanceOf(recipient);
        uint256 daiBefore = dai.balanceOf(recipient);

        vm.prank(lpOwner);
        (uint256 amountA, uint256 amountB) = router.removeLiquidityWithPermit(
            address(usdc), address(dai), liquidity, 0, 0, recipient, DEADLINE, false, v, r, s
        );

        assertTrue(amountA > 0 && amountB > 0, "amounts should be > 0");
        assertEq(usdc.balanceOf(recipient), usdcBefore + amountA, "recipient should receive USDC");
        assertEq(dai.balanceOf(recipient), daiBefore + amountB, "recipient should receive DAI");
        assertEq(UniswapV2Pair(pairUsdcDai).balanceOf(lpOwner), 0, "owner LP should be burned");
    }

    /// @dev A permit signed by the wrong key is rejected by the pair's `permit`.
    function test_removeLiquidityWithPermit_revertsInvalidSignature() public {
        uint256 lpKey = 0xA11CE;
        address lpOwner = vm.addr(lpKey);
        uint256 liquidity = UniswapV2Pair(pairUsdcDai).balanceOf(address(this)) / 2;
        UniswapV2Pair(pairUsdcDai).transfer(lpOwner, liquidity);

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                UniswapV2Pair(pairUsdcDai).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        UniswapV2Pair(pairUsdcDai).PERMIT_TYPEHASH(),
                        lpOwner,
                        address(router),
                        liquidity,
                        UniswapV2Pair(pairUsdcDai).nonces(lpOwner),
                        DEADLINE
                    )
                )
            )
        );
        // Sign with a DIFFERENT key than the owner.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, digest);

        vm.prank(lpOwner);
        vm.expectRevert(bytes("UniswapV2: INVALID_SIGNATURE"));
        router.removeLiquidityWithPermit(
            address(usdc), address(dai), liquidity, 0, 0, recipient, DEADLINE, false, v, r, s
        );
    }

    // ---------------------------------------------------------------------------------------------
    // removeLiquidityETHWithPermit — Phase 5 / US3
    // ---------------------------------------------------------------------------------------------

    /// @dev Signed-permit path for a WETH pair: both token and unwrapped ETH reach `to`.
    function test_removeLiquidityETHWithPermit_succeeds() public {
        uint256 lpKey = 0xA11CE;
        address lpOwner = vm.addr(lpKey);
        uint256 liquidity = UniswapV2Pair(pairWethUsdc).balanceOf(address(this)) / 2;
        UniswapV2Pair(pairWethUsdc).transfer(lpOwner, liquidity); // LP given, but NO approve

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                UniswapV2Pair(pairWethUsdc).DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        UniswapV2Pair(pairWethUsdc).PERMIT_TYPEHASH(),
                        lpOwner,
                        address(router),
                        liquidity,
                        UniswapV2Pair(pairWethUsdc).nonces(lpOwner),
                        DEADLINE
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(lpKey, digest);

        uint256 usdcBefore = usdc.balanceOf(recipient);
        uint256 ethBefore = recipient.balance;

        vm.prank(lpOwner);
        (uint256 amountToken, uint256 amountETH) =
            router.removeLiquidityETHWithPermit(address(usdc), liquidity, 0, 0, recipient, DEADLINE, false, v, r, s);

        assertTrue(amountToken > 0 && amountETH > 0, "amounts should be > 0");
        assertEq(usdc.balanceOf(recipient), usdcBefore + amountToken, "recipient should receive USDC");
        assertEq(recipient.balance, ethBefore + amountETH, "recipient should receive ETH");
    }

    // ---------------------------------------------------------------------------------------------
    // factory() / WETH() getters
    // ---------------------------------------------------------------------------------------------

    function test_factory_andWETH_getters() public view {
        assertEq(router.factory(), address(factory));
        assertEq(router.WETH(), address(weth));
    }
}
