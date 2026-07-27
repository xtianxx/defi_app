// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";

/// @title DeployFactory — Forge script for UniswapV2Factory.
/// @notice Reads `FACTORY_FEE_TO_SETTER` from env (default `msg.sender`).
contract DeployFactory is Script {
    function run() external {
        address feeToSetter = vm.envOr("FACTORY_FEE_TO_SETTER", msg.sender);
        vm.startBroadcast();
        UniswapV2Factory factory = new UniswapV2Factory(feeToSetter);
        vm.stopBroadcast();
        console.log("UniswapV2Factory deployed at:", address(factory));
        console.log("feeToSetter:", feeToSetter);
    }
}
