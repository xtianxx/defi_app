// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IUniswapV2Router02} from "./interfaces/IUniswapV2Router02.sol";
import {IUniswapV2Factory} from "../core/interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "../core/interfaces/IUniswapV2Pair.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {UniswapV2Library} from "./libraries/UniswapV2Library.sol";
import {TransferHelper} from "./libraries/TransferHelper.sol";

/// @title UniswapV2Router02 — periphery router (direct-pair swaps + liquidity stubs).
/// @notice Phase 3 (User Story 1 — Token Swap) implements the six swap entrypoints. Liquidity
///         ops (`addLiquidity*` / `removeLiquidity*`) are stubs that revert "Not implemented";
///         they land in Phase 4 (US2) and Phase 5 (US3). Per FR-011 / R0.3 there are NO multi-hop
///         paths (`path.length` MUST equal 2, else `revert DirectPairOnly()`) and NO flash swaps
///         (the Pair's `swap` has no `bytes data` callback).
contract UniswapV2Router02 is IUniswapV2Router02 {
    /// @dev Custom error emitted when `path.length != 2` (multi-hop attempted, FR-011).
    error DirectPairOnly();

    address public immutable factory;
    address public immutable WETH;

    /// @param _factory The UniswapV2Factory address (pair registry / CREATE2 deployer).
    /// @param _weth The canonical WETH9 address used to wrap/unwrap ETH for ERC-20 pairs.
    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH = _weth;
    }

    /// @notice The UniswapV2Factory driving pair lookups (auto-generated `view` getter).
    /// @dev `view` (not `pure`) because it reads an immutable; Solidity 0.8.x classifies
    ///      immutable reads as state access. The spec's `pure` is a 0.6.x carryover.
    /// @notice The canonical WETH9 address (auto-generated `view` getter).
    /// @dev `view` (not `pure`) — see `factory` note.

    /// @dev Reverts if the deadline has passed.
    modifier ensure(uint256 deadline) {
        /// forge-lint: disable-next-line(block-timestamp)
        require(deadline >= block.timestamp, "UniswapV2: EXPIRED");
        _;
    }

    /// @notice Receive ETH — only the WETH9 contract wraps via the Router (unwrap path sends ETH here).
    receive() external payable {}

    // ---------------------------------------------------------------------------------------------
    // Swaps — fully implemented (Phase 3 / US1)
    // ---------------------------------------------------------------------------------------------

    /// @notice Swap an exact amount of `path[0]` for as much `path[1]` as possible.
    /// @param amountIn Exact input amount of `path[0]`.
    /// @param amountOutMin Minimum output amount of `path[1]` (slippage protection).
    /// @param path Token path; MUST have length 2 (direct pair only, FR-011).
    /// @param to Recipient of the output tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[amountIn, amountOut]` — the computed input/output amounts.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length != 2) revert DirectPairOnly();
        (uint256 reserveIn, uint256 reserveOut) = UniswapV2Library.getReserves(factory, path[0], path[1]);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
        require(amounts[1] >= amountOutMin, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    /// @notice Swap `path[0]` for an exact amount of `path[1]` (specify output, limit input).
    /// @param amountOut Exact output amount of `path[1]` desired.
    /// @param amountInMax Maximum input amount of `path[0]` to spend (slippage protection).
    /// @param path Token path; MUST have length 2 (direct pair only, FR-011).
    /// @param to Recipient of the output tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[amountIn, amountOut]` — the computed input/output amounts.
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length != 2) revert DirectPairOnly();
        (uint256 reserveIn, uint256 reserveOut) = UniswapV2Library.getReserves(factory, path[0], path[1]);
        amounts = new uint256[](2);
        amounts[0] = UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
        amounts[1] = amountOut;
        require(amounts[0] <= amountInMax, "UniswapV2: EXCESSIVE_INPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }

    /// @notice Swap exact ETH for as much `path[1]` as possible (wraps ETH to WETH first).
    /// @param amountOutMin Minimum output amount of `path[1]` (slippage protection).
    /// @param path Token path; `path[0]` MUST be WETH, length MUST be 2 (FR-011).
    /// @param to Recipient of the output tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[msg.value, amountOut]` — the computed input/output amounts.
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        if (path.length != 2) revert DirectPairOnly();
        require(path[0] == WETH, "UniswapV2Router: INVALID_PATH");
        (uint256 reserveIn, uint256 reserveOut) = UniswapV2Library.getReserves(factory, path[0], path[1]);
        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = UniswapV2Library.getAmountOut(msg.value, reserveIn, reserveOut);
        require(amounts[1] >= amountOutMin, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        TransferHelper.safeTransfer(WETH, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Swap `path[0]` for an exact amount of ETH (unwraps WETH to ETH at the end).
    /// @param amountOut Exact output amount of ETH desired.
    /// @param amountInMax Maximum input amount of `path[0]` to spend (slippage protection).
    /// @param path Token path; `path[1]` MUST be WETH, length MUST be 2 (FR-011).
    /// @param to Recipient of the ETH output.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[amountIn, amountOut]` — the computed input/output amounts.
    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length != 2) revert DirectPairOnly();
        require(path[1] == WETH, "UniswapV2Router: INVALID_PATH");
        (uint256 reserveIn, uint256 reserveOut) = UniswapV2Library.getReserves(factory, path[0], path[1]);
        amounts = new uint256[](2);
        amounts[0] = UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
        amounts[1] = amountOut;
        require(amounts[0] <= amountInMax, "UniswapV2: EXCESSIVE_INPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[1]);
        TransferHelper.safeTransferETH(to, amounts[1]);
    }

    /// @notice Swap an exact amount of `path[0]` for as much ETH as possible (unwraps WETH).
    /// @param amountIn Exact input amount of `path[0]`.
    /// @param amountOutMin Minimum output amount of ETH (slippage protection).
    /// @param path Token path; `path[1]` MUST be WETH, length MUST be 2 (FR-011).
    /// @param to Recipient of the ETH output.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[amountIn, amountOut]` — the computed input/output amounts.
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        if (path.length != 2) revert DirectPairOnly();
        require(path[1] == WETH, "UniswapV2Router: INVALID_PATH");
        (uint256 reserveIn, uint256 reserveOut) = UniswapV2Library.getReserves(factory, path[0], path[1]);
        amounts = new uint256[](2);
        amounts[0] = amountIn;
        amounts[1] = UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
        require(amounts[1] >= amountOutMin, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[1]);
        TransferHelper.safeTransferETH(to, amounts[1]);
    }

    /// @notice Swap ETH for an exact amount of `path[1]` (wraps ETH, refunds excess).
    /// @param amountOut Exact output amount of `path[1]` desired.
    /// @param path Token path; `path[0]` MUST be WETH, length MUST be 2 (FR-011).
    /// @param to Recipient of the output tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[amountIn, amountOut]` — the computed input/output amounts.
    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        if (path.length != 2) revert DirectPairOnly();
        require(path[0] == WETH, "UniswapV2Router: INVALID_PATH");
        (uint256 reserveIn, uint256 reserveOut) = UniswapV2Library.getReserves(factory, path[0], path[1]);
        amounts = new uint256[](2);
        amounts[0] = UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
        amounts[1] = amountOut;
        require(amounts[0] <= msg.value, "UniswapV2: EXCESSIVE_INPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        TransferHelper.safeTransfer(WETH, UniswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
        // Refund any excess ETH not used for the swap.
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    /// @dev Core direct-pair swap. `path.length == 2` is enforced by all callers. Computes
    ///      `(amount0Out, amount1Out)` based on which path token is the pair's `token0`, then
    ///      calls `pair.swap(amount0Out, amount1Out, _to)` — NO `bytes data` param (FR-011).
    function _swap(uint256[] memory amounts, address[] calldata path, address _to) internal {
        (address input, address output) = (path[0], path[1]);
        (address token0,) = UniswapV2Library.sortTokens(input, output);
        uint256 amountOut = amounts[1];
        (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
        IUniswapV2Pair(UniswapV2Library.pairFor(factory, input, output)).swap(amount0Out, amount1Out, _to);
    }

    // ---------------------------------------------------------------------------------------------
    // Liquidity — stubs (Phase 4 / US2 and Phase 5 / US3)
    // ---------------------------------------------------------------------------------------------

    /// @dev Compute optimal deposit amounts for a token/token pair (or token/WETH).
    ///      If the pair does not yet exist, it is created first. For existing pairs, the
    ///      amounts are adjusted to match the pool's current ratio so that the deposit is
    ///      as capital-efficient as possible while respecting the caller's slippage bounds.
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        // Create the pair if it doesn't exist yet.
        if (IUniswapV2Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IUniswapV2Factory(factory).createPair(tokenA, tokenB);
        }

        (uint256 reserveA, uint256 reserveB) = UniswapV2Library.getReserves(factory, tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            // First liquidity provider — use desired amounts as-is.
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = UniswapV2Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = UniswapV2Library.quote(amountBDesired, reserveB, reserveA);
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }

        require(amountA >= amountAMin, "UniswapV2Router: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "UniswapV2Router: INSUFFICIENT_B_AMOUNT");
    }

    /// @notice Add liquidity to a token/token pair. Transfers tokens from the caller to the
    ///         pair, then mints LP tokens to `to`. Slippage is bounded by `amountAMin` /
    ///         `amountBMin` (the minimum amounts the caller is willing to deposit).
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = UniswapV2Library.pairFor(factory, tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IUniswapV2Pair(pair).mint(to);
    }

    /// @notice Add liquidity to a token/ETH pair. The caller sends ETH via `msg.value`;
    ///         excess ETH beyond `amountETH` is refunded. Wraps the required ETH to WETH
    ///         before transferring it to the pair.
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        (amountToken, amountETH) =
            _addLiquidity(token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
        address pair = UniswapV2Library.pairFor(factory, token, WETH);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        TransferHelper.safeTransfer(WETH, pair, amountETH);
        liquidity = IUniswapV2Pair(pair).mint(to);
        // Refund any unused ETH.
        if (msg.value > amountETH) {
            TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
        }
    }

    /// @notice Remove liquidity from a token/token pair — STUB (Phase 5 / US3).
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external view ensure(deadline) returns (uint256, uint256) {
        (tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
        revert("Not implemented");
    }

    /// @notice Remove liquidity from a token/ETH pair — STUB (Phase 5 / US3).
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external view ensure(deadline) returns (uint256, uint256) {
        (token, liquidity, amountTokenMin, amountETHMin, to, deadline);
        revert("Not implemented");
    }

    /// @notice Remove liquidity with permit (token/token) — STUB (Phase 5 / US3).
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view ensure(deadline) returns (uint256, uint256) {
        (tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline, approveMax, v, r, s);
        revert("Not implemented");
    }

    /// @notice Remove liquidity with permit (token/ETH) — STUB (Phase 5 / US3).
    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external view ensure(deadline) returns (uint256, uint256) {
        (token, liquidity, amountTokenMin, amountETHMin, to, deadline, approveMax, v, r, s);
        revert("Not implemented");
    }
}
