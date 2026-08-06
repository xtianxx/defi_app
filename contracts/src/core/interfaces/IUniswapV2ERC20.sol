// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IUniswapV2ERC20 — LP token interface (ERC-20 + EIP-2612 permit).
/// @notice The standard ERC-20 surface plus `permit`, as implemented by
///         `UniswapV2ERC20` (the Pair's LP token base).
interface IUniswapV2ERC20 {
    /// @notice Emitted when an allowance is set.
    /// @param owner The granting account.
    /// @param spender The allowed account.
    /// @param value The new allowance.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Emitted on every transfer / mint / burn.
    /// @param from The source account (`address(0)` for mints).
    /// @param to The destination account (`address(0)` for burns).
    /// @param value The amount transferred.
    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @notice The token name.
    function name() external pure returns (string memory);

    /// @notice The token symbol.
    function symbol() external pure returns (string memory);

    /// @notice The token decimals (18).
    function decimals() external pure returns (uint8);

    /// @notice Total amount of tokens in existence.
    function totalSupply() external view returns (uint256);

    /// @notice Token balance of `owner`.
    /// @param owner The account to query.
    /// @return The account's token balance.
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Allowance granted by `owner` to `spender`.
    /// @param owner The granting account.
    /// @param spender The allowed account.
    /// @return The current allowance.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Sets the allowance granted to `spender` by the caller.
    /// @param spender Account allowed to spend the caller's tokens.
    /// @param value Allowance amount (use `type(uint256).max` for unlimited).
    /// @return True on success.
    function approve(address spender, uint256 value) external returns (bool);

    /// @notice Transfers `value` tokens from the caller to `to`.
    /// @param to Recipient of the tokens.
    /// @param value Amount of tokens to transfer.
    /// @return True on success.
    function transfer(address to, uint256 value) external returns (bool);

    /// @notice Transfers `value` tokens from `from` to `to` using allowance.
    /// @param from Account whose tokens are moved.
    /// @param to Recipient of the tokens.
    /// @param value Amount of tokens to transfer.
    /// @return True on success.
    function transferFrom(address from, address to, uint256 value) external returns (bool);

    /// @notice EIP-2612 gasless approval from `owner` to `spender`.
    /// @param owner Account granting the allowance (must match the recovered signer).
    /// @param spender Account allowed to spend `owner`'s tokens.
    /// @param value Allowance amount.
    /// @param deadline Unix timestamp after which the signature is invalid.
    /// @param v EIP-712 signature `v` value.
    /// @param r EIP-712 signature `r` value.
    /// @param s EIP-712 signature `s` value.
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}
