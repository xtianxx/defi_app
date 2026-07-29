// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IWETH — canonical Wrapped Ether interface.
/// @notice Deposit/withdraw ETH plus the ERC-20 view surface used by the Router.
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 wad) external;

    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);

    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
