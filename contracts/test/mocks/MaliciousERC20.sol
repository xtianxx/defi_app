// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title MaliciousERC20 — token that attempts reentrancy on transfer from the pair.
/// @notice Used to verify UniswapV2Pair's `lock` modifier blocks reentrant swap/mint/burn.
///         When the pair sends this token out via `_safeTransfer`, the token's `transfer`
///         re-enters `pair.swap(...)`. The lock modifier must reject the reentrant call.
contract MaliciousERC20 {
    string public name = "Malicious Token";
    string public symbol = "MAL";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    address public pair;
    bool public reenterEnabled;
    bool public reenterAttempted;
    bool public reenterSucceeded;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function setPair(address _pair) external {
        pair = _pair;
    }

    function enableReenter() external {
        reenterEnabled = true;
    }

    function mint(address to, uint256 value) external {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);

        // Reentrancy: when the pair sends this token out, attempt a reentrant swap.
        // The pair's `lock` modifier should reject this with "UniswapV2: LOCKED".
        if (reenterEnabled && msg.sender == pair) {
            reenterAttempted = true;
            (bool ok,) = pair.call(abi.encodeWithSignature("swap(uint256,uint256,address)", 1, 1, address(0xDEAD)));
            reenterSucceeded = ok;
        }
        return true;
    }
}
