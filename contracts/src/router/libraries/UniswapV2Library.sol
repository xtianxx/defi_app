// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IUniswapV2Factory} from "../../core/interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../core/interfaces/IUniswapV2Pair.sol";

/// @title UniswapV2Library — direct-pair helpers for the Router periphery.
/// @notice `pairFor` reads the dynamic init-code hash from the factory (R0.4), eliminating the
///         fragile "paste the deployed hash into Router source" step. Multi-hop `getAmountsOut` /
///         `getAmountsIn` helpers are intentionally REMOVED per R0.3 (no multi-hop, no dead code).
library UniswapV2Library {
    /// @notice Sort two token addresses into (token0, token1) with token0 < token1.
    /// @dev Reverts on identical addresses (no zero-address check here — caller is responsible).
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /// @notice Compute the CREATE2 pair address for `(tokenA, tokenB)` under `factory`.
    /// @dev Reads the init-code hash dynamically via `IUniswapV2Factory(factory).pairCodeHash()`
    ///      (R0.4). Salt is `keccak256(abi.encodePacked(token0, token1))`.
    function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        bytes32 initCodeHash = IUniswapV2Factory(factory).pairCodeHash();
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(hex"ff", factory, keccak256(abi.encodePacked(token0, token1)), initCodeHash)
                    )
                )
            )
        );
    }

    /// @notice Fetch and order reserves for `(tokenA, tokenB)` from the pair deployed by `factory`.
    /// @dev Returns reserves ordered to match `(tokenA, tokenB)` — i.e. `reserveA` corresponds to
    ///      `tokenA`, regardless of which token is `token0` in the pair.
    function getReserves(address factory, address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pairFor(factory, tokenA, tokenB)).getReserves();
        (reserveA, reserveB) =
            tokenA == token0 ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
    }

    /// @notice Exact-output amount for a 0.3% fee swap.
    /// @dev Formula: `amountIn * 997 * reserveOut / (reserveIn * 1000 + amountIn * 997)`.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountOut)
    {
        require(amountIn > 0, "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /// @notice Exact-input amount required to buy `amountOut` from a 0.3% fee pool.
    /// @dev Formula: `reserveIn * amountOut * 1000 / ((reserveOut - amountOut) * 997) + 1`.
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        internal
        pure
        returns (uint256 amountIn)
    {
        require(amountOut > 0, "UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    /// @notice Compute the equivalent amount of tokenB for a given amount of tokenA at the
    ///         current pool ratio (no fees, no slippage — purely the constant-product quote).
    /// @dev Formula: `amountB = amountA * reserveB / reserveA`.
    ///      Reverts if `amountA == 0` or either reserve is zero.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        require(amountA > 0, "UniswapV2Library: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        amountB = amountA * reserveB / reserveA;
    }
}
