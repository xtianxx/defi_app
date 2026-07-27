// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract UniswapV2ERC20Test is Test {
    UniswapV2Factory internal factory;
    UniswapV2Pair internal pair;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        tokenA = new MockERC20("TokenA", "TKA", 18);
        tokenB = new MockERC20("TokenB", "TKB", 18);
        factory = new UniswapV2Factory(address(this));
        pair = UniswapV2Pair(factory.createPair(address(tokenA), address(tokenB)));

        // Seed the pair with reserves so we can call mint.
        tokenA.mint(address(pair), 1e18);
        tokenB.mint(address(pair), 1e18);
        pair.mint(alice);
    }

    function test_metadata() public view {
        assertEq(pair.name(), "Uniswap V2");
        assertEq(pair.symbol(), "UNI-V2");
        assertEq(pair.decimals(), 18);
    }

    function test_initialMint_lockedMinimumLiquidity() public view {
        // First mint locks 1000 LP to address(0)
        assertEq(pair.balanceOf(address(0)), 1000);
    }

    function test_transfer_works() public {
        uint256 bal = pair.balanceOf(alice);
        vm.prank(alice);
        pair.transfer(bob, bal / 2);
        assertEq(pair.balanceOf(bob), bal / 2);
        assertEq(pair.balanceOf(alice), bal - bal / 2);
    }

    function test_transferFrom_withAllowance() public {
        uint256 bal = pair.balanceOf(alice);
        vm.prank(alice);
        pair.approve(bob, bal);
        vm.prank(bob);
        pair.transferFrom(alice, bob, bal);
        assertEq(pair.balanceOf(bob), bal);
        assertEq(pair.balanceOf(alice), 0);
    }

    function test_approve_setsAllowance() public {
        vm.prank(alice);
        pair.approve(bob, 100);
        assertEq(pair.allowance(alice, bob), 100);
    }

    function test_permit_validSignature() public {
        uint256 privateKey = 0xA11CE;
        address owner = vm.addr(privateKey);

        // Deploy a fresh pair so the owner can mint LP first.
        MockERC20 tA2 = new MockERC20("TKA2", "TKA2", 18);
        MockERC20 tB2 = new MockERC20("TKB2", "TKB2", 18);
        UniswapV2Factory f2 = new UniswapV2Factory(address(this));
        UniswapV2Pair p3 = UniswapV2Pair(f2.createPair(address(tA2), address(tB2)));
        tA2.mint(address(p3), 1e18);
        tB2.mint(address(p3), 1e18);
        p3.mint(owner);

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    p3.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(p3.PERMIT_TYPEHASH(), owner, bob, 1e18, 0, block.timestamp))
                )
            )
        );
        p3.permit(owner, bob, 1e18, block.timestamp, v, r, s);
        assertEq(p3.allowance(owner, bob), 1e18);
    }

    function test_permit_expiredReverts() public {
        uint256 privateKey = 0xB0B;
        address owner = vm.addr(privateKey);
        vm.warp(block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            privateKey,
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    pair.DOMAIN_SEPARATOR(),
                    keccak256(abi.encode(pair.PERMIT_TYPEHASH(), owner, bob, 1, 0, block.timestamp - 1))
                )
            )
        );
        vm.expectRevert(bytes("UniswapV2: EXPIRED"));
        pair.permit(owner, bob, 1, block.timestamp - 1, v, r, s);
    }
}
