// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {UniswapV2Factory} from "../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../src/core/UniswapV2Pair.sol";
import {UniswapV2Router02} from "../src/router/UniswapV2Router02.sol";
import {WETH9} from "../src/router/WETH9.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @title DeployDemo — one-shot anvil demo deployment + liquidity seeding.
/// @notice Deploys the full demo stack: MockERC20 tokens (USDC, DAI, WBTC), real WETH9, Factory,
///         Router02, creates WETH/USDC + WETH/DAI pairs, and seeds initial liquidity MANUALLY
///         (the Router's `addLiquidityETH` is a stub in Phase 3, so we transfer + mint directly).
///         Funds multiple anvil test accounts for multi-user E2E testing.
///         Run: `forge script script/DeployDemo.s.sol --rpc-url $RPC --broadcast --private-key $KEY`
contract DeployDemo is Script {
    // Deterministic anvil test accounts (preseeded with 10000 ETH each by anvil).
    // Account #0 = msg.sender (deployer); #1 = LP provider B; #2 = swapper.
    address constant TEST_ACCOUNT_1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant TEST_ACCOUNT_2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;

    // Seed amounts for WETH/USDC: 100 WETH + 200,000 USDC => price ~2000 USDC/WETH.
    // Large enough that a 1 WETH swap (~1% of pool) won't trigger slippage issues.
    uint256 constant WETH_USDC_WETH = 100 ether;
    uint256 constant WETH_USDC_USDC = 200_000 * 10 ** 6;

    // Seed amounts for WETH/DAI: 100 WETH + 200,000 DAI => price ~2000 DAI/WETH.
    uint256 constant WETH_DAI_WETH = 100 ether;
    uint256 constant WETH_DAI_DAI = 200_000 * 10 ** 18;

    // Deployer's personal testing balance (retained after seeding pools) so the
    // connected wallet can actually perform swaps in the UI demo.
    uint256 constant DEPLOYER_WETH = 100 ether;
    uint256 constant DEPLOYER_USDC = 50_000 * 10 ** 6;
    uint256 constant DEPLOYER_DAI = 50_000 * 10 ** 18;

    // Test accounts get enough to add liquidity or swap.
    uint256 constant TESTER_WETH = 20 ether;
    uint256 constant TESTER_TOKEN = 20_000 * 10 ** 18;
    uint256 constant TESTER_USDC = 20_000 * 10 ** 6;

    function run() external {
        address deployer = msg.sender;
        vm.startBroadcast();

        // 1. Tokens — MockERC20 for USDC/DAI/WBTC, real WETH9 for wrapped ether.
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockERC20 dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        MockERC20 wbtc = new MockERC20("Wrapped BTC", "WBTC", 8);
        WETH9 weth = new WETH9();

        // 2. Core + periphery.
        UniswapV2Factory factory = new UniswapV2Factory(deployer);
        UniswapV2Router02 router = new UniswapV2Router02(address(factory), address(weth));

        // 3. Create pairs.
        address pairWethUsdc = factory.createPair(address(weth), address(usdc));
        address pairWethDai = factory.createPair(address(weth), address(dai));

        // 4. Fund deployer: wrap ETH + mint tokens. Mint/seed amounts include a personal
        //    testing balance so the connected wallet can swap after seeding (see constants above).
        weth.deposit{value: WETH_USDC_WETH + WETH_DAI_WETH + DEPLOYER_WETH}();
        usdc.mint(deployer, WETH_USDC_USDC + DEPLOYER_USDC);
        dai.mint(deployer, WETH_DAI_DAI + DEPLOYER_DAI);
        // WBTC is deployed for ABI/frontend parity but not seeded into a pair in this demo.
        wbtc.mint(deployer, 100 * 10 ** 8);

        // 4b. Fund test accounts for multi-user E2E testing.
        //     Account #1 — LP provider B (adds to an existing pool, verifies share dilution).
        usdc.mint(TEST_ACCOUNT_1, TESTER_USDC);
        dai.mint(TEST_ACCOUNT_1, TESTER_TOKEN);
        wbtc.mint(TEST_ACCOUNT_1, TESTER_USDC);
        //    Account #2 — swapper (buys & sells without providing liquidity).
        weth.deposit{value: TESTER_WETH}();
        require(weth.transfer(TEST_ACCOUNT_2, TESTER_WETH), "DeployDemo: weth->account2 failed");
        usdc.mint(TEST_ACCOUNT_2, TESTER_USDC);
        dai.mint(TEST_ACCOUNT_2, TESTER_TOKEN);

        // 5. Seed liquidity MANUALLY (router.addLiquidityETH is a stub in Phase 3).
        //    WETH/USDC pair.
        require(weth.transfer(pairWethUsdc, WETH_USDC_WETH), "DeployDemo: weth->pairWethUsdc failed");
        require(usdc.transfer(pairWethUsdc, WETH_USDC_USDC), "DeployDemo: usdc->pairWethUsdc failed");
        UniswapV2Pair(pairWethUsdc).mint(deployer);

        //    WETH/DAI pair.
        require(weth.transfer(pairWethDai, WETH_DAI_WETH), "DeployDemo: weth->pairWethDai failed");
        require(dai.transfer(pairWethDai, WETH_DAI_DAI), "DeployDemo: dai->pairWethDai failed");
        UniswapV2Pair(pairWethDai).mint(deployer);

        vm.stopBroadcast();

        // 6. Log all deployed addresses (consumable by frontend sync-deploy.ts).
        console.log("=== Demo Deployment Complete ===");
        console.log("Factory:", address(factory));
        console.log("Router02:", address(router));
        console.log("WETH9:", address(weth));
        console.log("USDC:", address(usdc));
        console.log("DAI:", address(dai));
        console.log("WBTC:", address(wbtc));
        console.log("PairWETHUSDC:", pairWethUsdc);
        console.log("PairWETHDAI:", pairWethDai);
        console.log("Deployer:", deployer);

        // Sanity: read back reserves.
        (uint112 r0, uint112 r1,) = UniswapV2Pair(pairWethUsdc).getReserves();
        console.log("WETH/USDC reserve0:", r0);
        console.log("WETH/USDC reserve1:", r1);
        (uint112 d0, uint112 d1,) = UniswapV2Pair(pairWethDai).getReserves();
        console.log("WETH/DAI reserve0:", d0);
        console.log("WETH/DAI reserve1:", d1);
        console.log("TestAccount1 (LP B):", TEST_ACCOUNT_1);
        console.log("TestAccount2 (swapper):", TEST_ACCOUNT_2);
    }
}
