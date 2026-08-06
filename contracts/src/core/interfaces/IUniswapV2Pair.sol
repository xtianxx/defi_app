// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IUniswapV2Pair — AMM pair interface (ERC-20 + swap/mint/burn).
/// @notice The full surface of a Uniswap V2 pair: LP token (ERC-20 + permit), the AMM
///         entrypoints (`mint` / `burn` / `swap` / `skim` / `sync`) and the read-only
///         state used by the Router and by TWAP oracles.
interface IUniswapV2Pair {
    /// @notice Emitted when liquidity is deposited and LP tokens are minted.
    /// @param sender The liquidity provider.
    /// @param amount0 Amount of `token0` deposited.
    /// @param amount1 Amount of `token1` deposited.
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);

    /// @notice Emitted when liquidity is withdrawn and LP tokens are burned.
    /// @param sender The liquidity provider.
    /// @param amount0 Amount of `token0` withdrawn.
    /// @param amount1 Amount of `token1` withdrawn.
    /// @param to Recipient of the withdrawn tokens.
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);

    /// @notice Emitted on every swap.
    /// @param sender The swapper (usually the Router).
    /// @param amount0In Amount of `token0` paid in.
    /// @param amount1In Amount of `token1` paid in.
    /// @param amount0Out Amount of `token0` sent out.
    /// @param amount1Out Amount of `token1` sent out.
    /// @param to Recipient of the output tokens.
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );

    /// @notice Emitted when reserves are reconciled with actual balances.
    /// @param reserve0 New reserve of `token0`.
    /// @param reserve1 New reserve of `token1`.
    event Sync(uint112 reserve0, uint112 reserve1);

    /// @notice The LP token name ("Uniswap V2").
    function name() external pure returns (string memory);

    /// @notice The LP token symbol ("UNI-V2").
    function symbol() external pure returns (string memory);

    /// @notice The LP token decimals (18).
    function decimals() external pure returns (uint8);

    /// @notice Total amount of LP tokens in existence.
    function totalSupply() external view returns (uint256);

    /// @notice LP token balance of `owner`.
    /// @param owner The account to query.
    /// @return The account's LP token balance.
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Allowance granted by `owner` to `spender`.
    /// @param owner The granting account.
    /// @param spender The allowed account.
    /// @return The current allowance.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Sets the allowance granted to `spender` by the caller.
    /// @param spender Account allowed to spend the caller's LP tokens.
    /// @param value Allowance amount (use `type(uint256).max` for unlimited).
    /// @return True on success.
    function approve(address spender, uint256 value) external returns (bool);

    /// @notice Transfers `value` LP tokens from the caller to `to`.
    /// @param to Recipient of the tokens.
    /// @param value Amount of LP tokens to transfer.
    /// @return True on success.
    function transfer(address to, uint256 value) external returns (bool);

    /// @notice Transfers `value` LP tokens from `from` to `to` using allowance.
    /// @param from Account whose tokens are moved.
    /// @param to Recipient of the tokens.
    /// @param value Amount of LP tokens to transfer.
    /// @return True on success.
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    /// @notice EIP-2612 gasless approval from `owner` to `spender`.
    /// @param owner Account granting the allowance (must match the recovered signer).
    /// @param spender Account allowed to spend `owner`'s LP tokens.
    /// @param value Allowance amount.
    /// @param deadline Unix timestamp after which the signature is invalid.
    /// @param v EIP-712 signature `v` value.
    /// @param r EIP-712 signature `r` value.
    /// @param s EIP-712 signature `s` value.
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;

    /// @notice Deposits tokens and mints LP tokens to `to` (tokens must be pre-transferred
    ///         to the pair; amounts are balance deltas).
    /// @param to Recipient of the minted LP tokens.
    /// @return liquidity The amount of LP tokens minted to `to`.
    function mint(address to) external returns (uint256 liquidity);

    /// @notice Burns LP tokens held by the pair and transfers proportional tokens to `to`
    ///         (LP tokens must be pre-transferred to the pair).
    /// @param to Recipient of the withdrawn tokens.
    /// @return amount0 The amount of `token0` transferred to `to`.
    /// @return amount1 The amount of `token1` transferred to `to`.
    function burn(address to) external returns (uint256 amount0, uint256 amount1);

    /// @notice Executes a swap enforcing the constant-product invariant with a 0.3% fee
    ///         (input tokens must be pre-transferred to the pair; no flash callback).
    /// @param amount0Out Amount of `token0` to send to `to` (0 for pure token1 swaps).
    /// @param amount1Out Amount of `token1` to send to `to` (0 for pure token0 swaps).
    /// @param to Recipient of the output tokens; MUST NOT be `token0` or `token1`.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;

    /// @notice Sends token balances in excess of the reserves to `to`.
    /// @param to Recipient of the skimmed surplus.
    function skim(address to) external;

    /// @notice Reconciles reserves with actual token balances.
    function sync() external;

    /// @notice The factory that deployed this pair.
    function factory() external view returns (address);

    /// @notice The pair's lower-address token.
    function token0() external view returns (address);

    /// @notice The pair's higher-address token.
    function token1() external view returns (address);

    /// @notice The pair's current reserves and last-update timestamp.
    /// @return reserve0 Current reserve of `token0`.
    /// @return reserve1 Current reserve of `token1`.
    /// @return blockTimestampLast `block.timestamp` of the last reserve update.
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

    /// @notice Cumulative price of `token0` denominated in `token1` (TWAP oracle).
    function price0CumulativeLast() external view returns (uint256);

    /// @notice Cumulative price of `token1` denominated in `token0` (TWAP oracle).
    function price1CumulativeLast() external view returns (uint256);

    /// @notice Cached `reserve0 * reserve1` from the last mint/burn (fee accrual bookkeeping).
    function kLast() external view returns (uint256);
}
