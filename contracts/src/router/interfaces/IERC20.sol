// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IERC20 — minimal ERC-20 surface used by the Router periphery.
/// @notice Standard ERC-20 interface consumed by `TransferHelper` and the frontend `useToken` hook.
interface IERC20 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
