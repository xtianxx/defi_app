// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IWETH — canonical Wrapped Ether interface.
/// @notice Deposit/withdraw ETH plus the ERC-20 view surface used by the Router.
interface IWETH {
    /// @notice Wraps the sent ETH into WETH, crediting `msg.sender`.
    /// @dev Call with `{value: amount}` — `msg.value` is minted as WETH to the caller.
    function deposit() external payable;

    /// @notice Unwraps `wad` WETH back into ETH, sending it to `msg.sender`.
    /// @param wad Amount of WETH to burn/unwrap.
    function withdraw(uint256 wad) external;

    /// @notice Total amount of WETH in existence (equals the contract's ETH balance).
    function totalSupply() external view returns (uint256);

    /// @notice WETH balance of `account`.
    /// @param account The account to query.
    /// @return The account's WETH balance.
    function balanceOf(address account) external view returns (uint256);

    /// @notice Allowance granted by `owner` to `spender`.
    /// @param owner The granting account.
    /// @param spender The allowed account.
    /// @return The current allowance.
    function allowance(address owner, address spender) external view returns (uint256);

    /// @notice Sets the allowance granted to `spender` by the caller.
    /// @param spender Account allowed to spend the caller's WETH.
    /// @param amount Allowance amount (use `type(uint256).max` for unlimited).
    /// @return True on success.
    function approve(address spender, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` WETH from the caller to `to`.
    /// @param to Recipient of the WETH.
    /// @param amount Amount of WETH to transfer.
    /// @return True on success.
    function transfer(address to, uint256 amount) external returns (bool);

    /// @notice Transfers `amount` WETH from `from` to `to` using allowance.
    /// @param from Account whose WETH is moved.
    /// @param to Recipient of the WETH.
    /// @param amount Amount of WETH to transfer.
    /// @return True on success.
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
