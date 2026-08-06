// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IERC20 — minimal ERC-20 surface used by the Router periphery.
/// @notice Standard ERC-20 interface consumed by `TransferHelper` and the frontend `useToken` hook.
interface IERC20 {
    /// @notice The token name.
    function name() external view returns (string memory);

    /// @notice The token symbol.
    function symbol() external view returns (string memory);

    /// @notice The token decimals.
    function decimals() external view returns (uint8);

    /// @notice Total amount of tokens in existence.
    function totalSupply() external view returns (uint256);

    /// @notice Token balance of `account`.
    /// @param account The account to query.
    /// @return The account's token balance.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Allowance granted by `owner` to `spender`.
    /// @param owner The granting account.
    /// @param spender The allowed account.
    /// @return The current allowance.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Sets the allowance granted to `spender` by the caller.
    /// @param spender Account allowed to spend the caller's tokens.
    /// @param amount Allowance amount (use `type(uint256).max` for unlimited).
    /// @return True on success.
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` tokens from the caller to `to`.
    /// @param to Recipient of the tokens.
    /// @param amount Amount of tokens to transfer.
    /// @return True on success.
    function transfer(address to, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` tokens from `from` to `to` using allowance.
    /// @param from Account whose tokens are moved.
    /// @param to Recipient of the tokens.
    /// @param amount Amount of tokens to transfer.
    /// @return True on success.
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
