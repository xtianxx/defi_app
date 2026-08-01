// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";

/// @title TestHelpers — shared helpers for the Foundry test suite.
contract TestHelpers is Test {
    /// @dev Sort two token addresses into (token0, token1) with token0 < token1.
    function _sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "TestHelpers: IDENTICAL");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "TestHelpers: ZERO_ADDRESS");
    }

    /// @dev Predict the CREATE2 pair address for `(tokenA, tokenB)`.
    function _pairFor(address factory, address tokenA, address tokenB, bytes32 initCodeHash)
        internal
        pure
        returns (address pair)
    {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
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

    /// @dev Snapshot token balances of `who` for `(tokenA, tokenB)`.
    function _balancesOf(address who, address tokenA, address tokenB) internal view returns (uint256 a, uint256 b) {
        a = _balanceOf(who, tokenA);
        b = _balanceOf(who, tokenB);
    }

    function _balanceOf(address who, address token) internal view returns (uint256) {
        (bool success, bytes memory data) = token.staticcall(abi.encodeWithSignature("balanceOf(address)", who));
        require(success && data.length >= 32, "TestHelpers: BALANCEOF_FAILED");
        return abi.decode(data, (uint256));
    }
}
