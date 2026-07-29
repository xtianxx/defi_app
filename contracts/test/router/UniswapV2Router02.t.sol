// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Router02} from "../../src/router/UniswapV2Router02.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {WETH9} from "../../src/router/WETH9.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {UniswapV2Library} from "../../src/router/libraries/UniswapV2Library.sol";

/// @title UniswapV2Router02Test — swap entrypoints (Phase 3 / US1).
/// @notice Liquidity ops are stubs and tested only for revert; swap paths are direct-pair only.
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
    // Liquidity stubs — must revert "Not implemented"
    // ---------------------------------------------------------------------------------------------

    function test_addLiquidity_isStub() public {
        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(dai);
        vm.prank(trader);
        vm.expectRevert(bytes("Not implemented"));
        router.addLiquidity(address(usdc), address(dai), 100e6, 100e18, 0, 0, trader, DEADLINE);
    }

    function test_addLiquidityETH_isStub() public {
        vm.prank(trader);
        vm.expectRevert(bytes("Not implemented"));
        router.addLiquidityETH{value: 1 ether}(address(usdc), 100e6, 0, 0, trader, DEADLINE);
    }

    function test_removeLiquidity_isStub() public {
        vm.prank(trader);
        vm.expectRevert(bytes("Not implemented"));
        router.removeLiquidity(address(usdc), address(dai), 1e18, 0, 0, trader, DEADLINE);
    }

    function test_removeLiquidityETH_isStub() public {
        vm.prank(trader);
        vm.expectRevert(bytes("Not implemented"));
        router.removeLiquidityETH(address(usdc), 1e18, 0, 0, trader, DEADLINE);
    }

    function test_removeLiquidityWithPermit_isStub() public {
        vm.prank(trader);
        vm.expectRevert(bytes("Not implemented"));
        router.removeLiquidityWithPermit(
            address(usdc), address(dai), 1e18, 0, 0, trader, DEADLINE, false, 0, bytes32(0), bytes32(0)
        );
    }

    function test_removeLiquidityETHWithPermit_isStub() public {
        vm.prank(trader);
        vm.expectRevert(bytes("Not implemented"));
        router.removeLiquidityETHWithPermit(
            address(usdc), 1e18, 0, 0, trader, DEADLINE, false, 0, bytes32(0), bytes32(0)
        );
    }

    // ---------------------------------------------------------------------------------------------
    // factory() / WETH() getters
    // ---------------------------------------------------------------------------------------------

    function test_factory_andWETH_getters() public view {
        assertEq(router.factory(), address(factory));
        assertEq(router.WETH(), address(weth));
    }
}
