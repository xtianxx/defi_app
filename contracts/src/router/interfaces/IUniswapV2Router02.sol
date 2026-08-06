// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IUniswapV2Router02 — periphery router interface (direct-pair subset).
/// @notice Swap + liquidity surface. Per FR-011 / R0.3, `path.length` MUST equal 2 (no multi-hop)
///         and there are no flash-swap entrypoints. Liquidity ops are present for ABI parity.
interface IUniswapV2Router02 {
    /// @dev `view` (not `pure`) — Solidity 0.8.x classifies immutable reads as state access.
    ///      The spec's `pure` is a 0.6.x carryover; this is the ABI-compatible 0.8.19 surface.
    /// @notice The UniswapV2Factory driving pair lookups.
    function factory() external view returns (address);

    /// @notice The canonical WETH9 address used to wrap/unwrap ETH.
    function WETH() external view returns (address);

    /// @notice Add liquidity to a token/token pair. Transfers tokens from the caller to the
    ///         pair, then mints LP tokens to `to`. Slippage is bounded by `amountAMin` /
    ///         `amountBMin`. Creates the pair first if it does not exist.
    /// @param tokenA One of the pair's tokens.
    /// @param tokenB The other of the pair's tokens.
    /// @param amountADesired Desired amount of `tokenA` to deposit.
    /// @param amountBDesired Desired amount of `tokenB` to deposit.
    /// @param amountAMin Minimum amount of `tokenA` to deposit (slippage protection).
    /// @param amountBMin Minimum amount of `tokenB` to deposit (slippage protection).
    /// @param to Recipient of the minted LP tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amountA The actual amount of `tokenA` deposited.
    /// @return amountB The actual amount of `tokenB` deposited.
    /// @return liquidity The amount of LP tokens minted to `to`.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    /// @notice Add liquidity to a token/ETH pair. The caller sends ETH via `msg.value`;
    ///         excess ETH beyond the used amount is refunded.
    /// @param token The non-WETH token of the pair.
    /// @param amountTokenDesired Desired amount of `token` to deposit.
    /// @param amountTokenMin Minimum amount of `token` to deposit (slippage protection).
    /// @param amountETHMin Minimum amount of ETH to deposit (slippage protection).
    /// @param to Recipient of the minted LP tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amountToken The actual amount of `token` deposited.
    /// @return amountETH The actual amount of ETH deposited (wrapped to WETH).
    /// @return liquidity The amount of LP tokens minted to `to`.
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

    /// @notice Remove liquidity from a token/token pair. Sends LP tokens to the pair (which
    ///         burns them) and transfers the proportional token amounts to `to`.
    /// @param tokenA One of the pair's tokens.
    /// @param tokenB The other of the pair's tokens.
    /// @param liquidity Amount of LP tokens to burn.
    /// @param amountAMin Minimum amount of `tokenA` to receive (slippage protection).
    /// @param amountBMin Minimum amount of `tokenB` to receive (slippage protection).
    /// @param to Recipient of the removed tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amountA The amount of `tokenA` received by `to`.
    /// @return amountB The amount of `tokenB` received by `to`.
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    /// @notice Remove liquidity from a token/ETH pair. Unwraps the WETH to ETH before
    ///         sending both tokens to `to`.
    /// @param token The non-WETH token of the pair.
    /// @param liquidity Amount of LP tokens to burn.
    /// @param amountTokenMin Minimum amount of `token` to receive (slippage protection).
    /// @param amountETHMin Minimum amount of ETH to receive (slippage protection).
    /// @param to Recipient of the removed tokens and ETH.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amountToken The amount of `token` received by `to`.
    /// @return amountETH The amount of ETH received by `to`.
    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountETH);

    /// @notice Remove liquidity from a token/token pair, authorizing the burn via an
    ///         EIP-712 `permit` signature instead of a prior LP approval.
    /// @param tokenA One of the pair's tokens.
    /// @param tokenB The other of the pair's tokens.
    /// @param liquidity Amount of LP tokens to burn.
    /// @param amountAMin Minimum amount of `tokenA` to receive (slippage protection).
    /// @param amountBMin Minimum amount of `tokenB` to receive (slippage protection).
    /// @param to Recipient of the removed tokens.
    /// @param deadline Transaction deadline (also the permit deadline).
    /// @param approveMax If true, the permit grants `type(uint256).max` allowance.
    /// @param v EIP-712 signature `v` value.
    /// @param r EIP-712 signature `r` value.
    /// @param s EIP-712 signature `s` value.
    /// @return amountA The amount of `tokenA` received by `to`.
    /// @return amountB The amount of `tokenB` received by `to`.
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
    ) external returns (uint256 amountA, uint256 amountB);

    /// @notice Remove liquidity from a token/ETH pair, authorizing the burn via an
    ///         EIP-712 `permit` signature. Unwraps WETH to ETH before sending to `to`.
    /// @param token The non-WETH token of the pair.
    /// @param liquidity Amount of LP tokens to burn.
    /// @param amountTokenMin Minimum amount of `token` to receive (slippage protection).
    /// @param amountETHMin Minimum amount of ETH to receive (slippage protection).
    /// @param to Recipient of the removed tokens and ETH.
    /// @param deadline Transaction deadline (also the permit deadline).
    /// @param approveMax If true, the permit grants `type(uint256).max` allowance.
    /// @param v EIP-712 signature `v` value.
    /// @param r EIP-712 signature `r` value.
    /// @param s EIP-712 signature `s` value.
    /// @return amountToken The amount of `token` received by `to`.
    /// @return amountETH The amount of ETH received by `to`.
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
    ) external returns (uint256 amountToken, uint256 amountETH);

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
    ) external returns (uint256[] memory amounts);

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
    ) external returns (uint256[] memory amounts);

    /// @notice Swap exact ETH for as much `path[1]` as possible (wraps ETH to WETH first).
    /// @param amountOutMin Minimum output amount of `path[1]` (slippage protection).
    /// @param path Token path; `path[0]` MUST be WETH, length MUST be 2 (FR-011).
    /// @param to Recipient of the output tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[msg.value, amountOut]` — the computed input/output amounts.
    function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);

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
    ) external returns (uint256[] memory amounts);

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
    ) external returns (uint256[] memory amounts);

    /// @notice Swap ETH for an exact amount of `path[1]` (wraps ETH, refunds excess).
    /// @param amountOut Exact output amount of `path[1]` desired.
    /// @param path Token path; `path[0]` MUST be WETH, length MUST be 2 (FR-011).
    /// @param to Recipient of the output tokens.
    /// @param deadline Transaction deadline (unix timestamp).
    /// @return amounts `[amountIn, amountOut]` — the computed input/output amounts.
    function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline)
        external
        payable
        returns (uint256[] memory amounts);
}
