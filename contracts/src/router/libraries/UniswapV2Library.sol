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
    /// @param tokenA First token (order-independent).
    /// @param tokenB Second token (order-independent).
    /// @return token0 The lower-address token.
    /// @return token1 The higher-address token.
    /// @dev Reverts with "UniswapV2Library: IDENTICAL_ADDRESSES" on identical addresses
    ///      (no zero-address check here — caller is responsible).
    function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "UniswapV2Library: IDENTICAL_ADDRESSES");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /// @notice Compute the CREATE2 pair address for `(tokenA, tokenB)` under `factory`.
    /// @param factory The UniswapV2Factory address (pair registry / CREATE2 deployer).
    /// @param tokenA First token (order-independent).
    /// @param tokenB Second token (order-independent).
    /// @return pair The deterministic pair address for the token pair.
    /// @dev Reads the init-code hash dynamically via `IUniswapV2Factory(factory).pairCodeHash()`
    ///      (R0.4). Salt is `keccak256(abi.encodePacked(token0, token1))`. Pure because the
    ///      factory call goes through an interface with a `pure` implementation.
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
    /// @param factory The UniswapV2Factory address.
    /// @param tokenA First token (order-independent).
    /// @param tokenB Second token (order-independent).
    /// @return reserveA The reserve of `tokenA` in the pair.
    /// @return reserveB The reserve of `tokenB` in the pair.
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
    /// @param amountIn Input amount of the token being sold.
    /// @param reserveIn Reserve of the input token in the pair.
    /// @param reserveOut Reserve of the output token in the pair.
    /// @return amountOut The output amount received for `amountIn`.
    /// @dev Formula: `amountIn * 997 * reserveOut / (reserveIn * 1000 + amountIn * 997)`. The 997/1000
    ///      factor applies the 0.3% fee. Reverts with "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT"
    ///      if `amountIn == 0` and "UniswapV2Library: INSUFFICIENT_LIQUIDITY" if either reserve is 0.
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
    /// @param amountOut Desired output amount.
    /// @param reserveIn Reserve of the input token in the pair.
    /// @param reserveOut Reserve of the output token in the pair.
    /// @return amountIn The input amount required to receive exactly `amountOut`.
    /// @dev Formula: `reserveIn * amountOut * 1000 / ((reserveOut - amountOut) * 997) + 1` (the +1
    ///      rounds up so the K invariant can never be violated). Reverts with "UniswapV2Library:
    ///      INSUFFICIENT_OUTPUT_AMOUNT" if `amountOut == 0` and "UniswapV2Library:
    ///      INSUFFICIENT_LIQUIDITY" if either reserve is 0.
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
    /// @param amountA Amount of tokenA to quote.
    /// @param reserveA Reserve of tokenA in the pair.
    /// @param reserveB Reserve of tokenB in the pair.
    /// @return amountB The equivalent amount of tokenB.
    /// @dev Formula: `amountB = amountA * reserveB / reserveA`.
    ///      Reverts with "UniswapV2Library: INSUFFICIENT_AMOUNT" if `amountA == 0` and
    ///      "UniswapV2Library: INSUFFICIENT_LIQUIDITY" if either reserve is zero.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) internal pure returns (uint256 amountB) {
        require(amountA > 0, "UniswapV2Library: INSUFFICIENT_AMOUNT");
        require(reserveA > 0 && reserveB > 0, "UniswapV2Library: INSUFFICIENT_LIQUIDITY");
        amountB = amountA * reserveB / reserveA;
    }
}
