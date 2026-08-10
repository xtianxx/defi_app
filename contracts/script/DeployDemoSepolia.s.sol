// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {UniswapV2Factory} from "../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../src/core/UniswapV2Pair.sol";
import {DemoFaucet} from "../src/faucet/DemoFaucet.sol";
import {UniswapV2Router02} from "../src/router/UniswapV2Router02.sol";
import {IERC20} from "../src/router/interfaces/IERC20.sol";
import {WETH9} from "../src/router/WETH9.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @title DeployDemoSepolia — one-shot Sepolia demo deployment + liquidity seeding.
/// @notice Sepolia twin of `DeployDemo` (anvil): deploys MockERC20 USDC/DAI/WBTC + real
///         WETH9 + Factory + Router02, creates and seeds WETH/USDC + WETH/DAI pairs with the
///         same scale constants as the anvil demo, funds the two documented demo accounts
///         (LP provider + swapper) with ETH/tokens, and deploys `DemoFaucet` funded with its
///         initial WETH reserve. Deployer is the master key supplied via `--private-key`
///         (SEPOLIA_DEPLOYER_KEY in contracts/.env) — never hardcoded in this file.
///         Run: `forge script script/DeployDemoSepolia.s.sol:DeployDemoSepolia
///         --rpc-url $SEPOLIA_RPC_URL --broadcast --verify --etherscan-api-key $ETHERSCAN_API_KEY
///         --private-key $SEPOLIA_DEPLOYER_KEY --slow`
contract DeployDemoSepolia is Script {
    // Documented demo accounts (specs/002-sepolia-vercel-deploy/demo-guide.md, T002).
    // Private keys live only in the gitignored contracts/.env (SEPOLIA_LP_PROVIDER_KEY /
    // SEPOLIA_SWAPPER_KEY) — the addresses are testnet-public and safe to hardcode.
    /// @notice LP provider — adds/removes liquidity in the demo.
    address constant LP_PROVIDER = 0x55a5818d1F4b21C5D2F4b898Ff986cA29934A984;
    /// @notice Swapper — buys & sells in the demo.
    address constant SWAPPER = 0x61e223dA8bafd9f39e749685CB7653Cf1C3b8096;

    // Seed amounts for WETH/USDC: 0.1 WETH + 200 USDC => price ~2000 USDC/WETH.
    // Anvil demo uses 100 WETH + 200,000 USDC (data-model.md); on Sepolia the master
    // only holds faucet ETH, so the scale is ÷1000 (price unchanged) — the demo
    // mechanics (swap/liquidity/faucet) behave identically at any absolute size.
    uint256 constant WETH_USDC_WETH = 0.1 ether;
    uint256 constant WETH_USDC_USDC = 200 * 10 ** 6;

    // Seed amounts for WETH/DAI: 0.1 WETH + 200 DAI => price ~2000 DAI/WETH.
    uint256 constant WETH_DAI_WETH = 0.1 ether;
    uint256 constant WETH_DAI_DAI = 200 * 10 ** 18;

    // Deployer's (master) personal testing balance retained after seeding so the
    // connected wallet can actually perform swaps in the UI demo. Also the funding
    // source for later `reseed-pools` top-ups (T017).
    uint256 constant DEPLOYER_WETH = 0.05 ether;
    uint256 constant DEPLOYER_USDC = 50 * 10 ** 6;
    uint256 constant DEPLOYER_DAI = 50 * 10 ** 18;

    // Demo accounts get enough to add liquidity or swap (mirrors the anvil script's
    // account #1/#2 grants at ÷1000 scale; both accounts additionally receive
    // WETH + gas ETH).
    uint256 constant TESTER_WETH = 0.01 ether;
    uint256 constant TESTER_TOKEN = 20 * 10 ** 18;
    uint256 constant TESTER_USDC = 20 * 10 ** 6;

    // Gas ETH for each demo account, sent from master (research.md R0.1 budget).
    uint256 constant DEMO_ACCOUNT_ETH = 0.02 ether;

    // DemoFaucet initial WETH reserve (0.2 WETH = 2 grants; same as the anvil wiring — T023).
    // WETH cannot be minted (R0.4) — funded by transfer AFTER deployment; grows via
    // `reseed-pools` top-ups (T017).
    uint256 internal constant FAUCET_WETH_RESERVE = 0.2 ether;

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

        // 4. Fund deployer (master): wrap ETH + mint tokens. Mint/seed amounts include a
        //    personal testing balance plus the demo-account WETH, faucet reserve and seed
        //    budgets (see constants above).
        weth.deposit{value: WETH_USDC_WETH + WETH_DAI_WETH + DEPLOYER_WETH}();
        usdc.mint(deployer, WETH_USDC_USDC + DEPLOYER_USDC);
        dai.mint(deployer, WETH_DAI_DAI + DEPLOYER_DAI);
        // WBTC is deployed for ABI/frontend parity but not seeded into a pair in this demo.
        wbtc.mint(deployer, 0.1 * 10 ** 8);

        // 4b. Fund demo accounts (demo-guide.md): gas ETH + USDC/DAI/WBTC mints + WETH
        //     wrap (WETH has no mint — deposit + transfer, R0.4).
        //     LP provider — adds to existing pools, verifies share dilution.
        payable(LP_PROVIDER).transfer(DEMO_ACCOUNT_ETH);
        usdc.mint(LP_PROVIDER, TESTER_USDC);
        dai.mint(LP_PROVIDER, TESTER_TOKEN);
        wbtc.mint(LP_PROVIDER, TESTER_USDC);
        //     Swapper — buys & sells without providing liquidity.
        payable(SWAPPER).transfer(DEMO_ACCOUNT_ETH);
        usdc.mint(SWAPPER, TESTER_USDC);
        dai.mint(SWAPPER, TESTER_TOKEN);
        wbtc.mint(SWAPPER, TESTER_USDC);
        //     WETH for both demo accounts.
        weth.deposit{value: TESTER_WETH}();
        require(weth.transfer(LP_PROVIDER, TESTER_WETH), "DeployDemoSepolia: weth->lp failed");
        weth.deposit{value: TESTER_WETH}();
        require(weth.transfer(SWAPPER, TESTER_WETH), "DeployDemoSepolia: weth->swapper failed");

        // 5. Seed liquidity MANUALLY (router.addLiquidityETH is a stub in Phase 3).
        //    WETH/USDC pair.
        require(weth.transfer(pairWethUsdc, WETH_USDC_WETH), "DeployDemoSepolia: weth->pairWethUsdc failed");
        require(usdc.transfer(pairWethUsdc, WETH_USDC_USDC), "DeployDemoSepolia: usdc->pairWethUsdc failed");
        UniswapV2Pair(pairWethUsdc).mint(deployer);

        //    WETH/DAI pair.
        require(weth.transfer(pairWethDai, WETH_DAI_WETH), "DeployDemoSepolia: weth->pairWethDai failed");
        require(dai.transfer(pairWethDai, WETH_DAI_DAI), "DeployDemoSepolia: dai->pairWethDai failed");
        UniswapV2Pair(pairWethDai).mint(deployer);

        // 5b. DemoFaucet — deploy, then fund the WETH reserve AFTER deployment (WETH
        //     cannot be minted — R0.4; order matters per faucet-contract.md §6).
        DemoFaucet faucet = new DemoFaucet(IERC20(address(weth)), usdc, dai, wbtc);
        require(weth.transfer(address(faucet), FAUCET_WETH_RESERVE), "DeployDemoSepolia: weth->faucet failed");

        vm.stopBroadcast();

        // 6. Log all deployed addresses (consumable by frontend sync-deploy.ts).
        console.log("=== Sepolia Demo Deployment Complete ===");
        console.log("Factory:", address(factory));
        console.log("Router02:", address(router));
        console.log("WETH9:", address(weth));
        console.log("USDC:", address(usdc));
        console.log("DAI:", address(dai));
        console.log("WBTC:", address(wbtc));
        console.log("PairWETHUSDC:", pairWethUsdc);
        console.log("PairWETHDAI:", pairWethDai);
        console.log("Faucet:", address(faucet));
        console.log("Deployer:", deployer);

        // Sanity: read back reserves.
        (uint112 r0, uint112 r1,) = UniswapV2Pair(pairWethUsdc).getReserves();
        console.log("WETH/USDC reserve0:", r0);
        console.log("WETH/USDC reserve1:", r1);
        (uint112 d0, uint112 d1,) = UniswapV2Pair(pairWethDai).getReserves();
        console.log("WETH/DAI reserve0:", d0);
        console.log("WETH/DAI reserve1:", d1);
        console.log("LPProvider:", LP_PROVIDER);
        console.log("Swapper:", SWAPPER);
    }
}
