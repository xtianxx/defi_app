// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {WETH9} from "../../src/router/WETH9.sol";

/// @title DeployRouter — Phase 2 stub. Router02 lands in Phase 3 (T040).
/// @notice Deploys WETH9 in this phase. Will be extended to deploy UniswapV2Router02
///         with `(FACTORY, WETH)` constructor args once Phase 3 lands.
contract DeployRouter is Script {
    function run() external {
        vm.startBroadcast();
        WETH9 weth = new WETH9();
        vm.stopBroadcast();
        console.log("WETH9 deployed at:", address(weth));
        // TODO Phase 3 (T040): deploy UniswapV2Router02(factory, weth) and log its address.
    }
}
