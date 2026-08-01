// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {UniswapV2Factory} from "../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../src/core/UniswapV2Pair.sol";
import {WETH9} from "../src/router/WETH9.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @title DeployDev — one-shot local anvil deployment + liquidity seeding.
/// @notice Deploys Factory, WETH9, USDC (MockERC20), creates the WETH/USDC pair,
///         and seeds initial liquidity so the frontend /debug page shows live data.
///         NOT for production — uses test mocks and anvil's funded account.
///         Run: `forge script script/DeployDev.s.sol --rpc-url $RPC --broadcast --private-key $KEY`
contract DeployDev is Script {
    // Seed amounts: 100 WETH + 200,000 USDC => price ~2000 USDC/WETH.
    uint256 constant WETH_AMOUNT = 100 ether; // 100 * 1e18
    uint256 constant USDC_AMOUNT = 200_000 * 10 ** 6; // 200k * 1e6 (6 decimals)

    function run() external {
        address deployer = msg.sender;
        vm.startBroadcast();

        // 1. Core contracts
        UniswapV2Factory factory = new UniswapV2Factory(deployer);
        WETH9 weth = new WETH9();

        // 2. USDC (MockERC20, 6 decimals) — sync-deploy.ts picks up "MockERC20" as USDC
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);

        // 3. Create WETH/USDC pair
        address pair = factory.createPair(address(weth), address(usdc));

        // 4. Wrap 100 ETH -> WETH (deposit is payable)
        weth.deposit{value: WETH_AMOUNT}();

        // 5. Mint 200,000 USDC to deployer
        usdc.mint(deployer, USDC_AMOUNT);

        // 6. Transfer tokens to the pair
        require(weth.transfer(pair, WETH_AMOUNT), "DeployDev: weth->pair failed");
        require(usdc.transfer(pair, USDC_AMOUNT), "DeployDev: usdc->pair failed");

        // 7. Mint initial liquidity -> LP tokens to deployer
        UniswapV2Pair(pair).mint(deployer);

        vm.stopBroadcast();

        // Log everything for visibility
        console.log("=== Dev Deployment Complete ===");
        console.log("Factory:", address(factory));
        console.log("WETH9:", address(weth));
        console.log("USDC:", address(usdc));
        console.log("Pair:", pair);
        console.log("Deployer:", deployer);

        // Sanity: read back reserves
        (uint112 r0, uint112 r1,) = UniswapV2Pair(pair).getReserves();
        console.log("reserve0:", r0);
        console.log("reserve1:", r1);
    }
}
