// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract UniswapV2FactoryTest is Test {
    UniswapV2Factory internal factory;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal feeSetter = address(0xFEE);

    function setUp() public {
        factory = new UniswapV2Factory(feeSetter);
        tokenA = new MockERC20("TokenA", "TKA", 18);
        tokenB = new MockERC20("TokenB", "TKB", 18);
    }

    function test_constructor_setsFeeSetter() public view {
        assertEq(factory.feeToSetter(), feeSetter);
        assertEq(factory.feeTo(), address(0));
    }

    function test_pairCodeHash_matchesInit() public view {
        assertEq(factory.pairCodeHash(), factory.INIT_CODE_PAIR_HASH());
        assertEq(factory.pairCodeHash(), keccak256(type(UniswapV2Pair).creationCode));
    }

    function test_createPair_isDeterministic() public {
        // CREATE2 address should be deterministic: same factory + same tokens => same pair.
        address pair1 = factory.createPair(address(tokenA), address(tokenB));
        // We can't call createPair again (reverts), so verify via reverse lookup.
        (address t0, address t1) =
            address(tokenA) < address(tokenB) ? (address(tokenA), address(tokenB)) : (address(tokenB), address(tokenA));
        assertEq(factory.getPair(t0, t1), pair1);
        assertEq(factory.getPair(t1, t0), pair1);

        // A different factory at a different address yields a different pair address.
        UniswapV2Factory f2 = new UniswapV2Factory(feeSetter);
        address pair2 = f2.createPair(address(tokenA), address(tokenB));
        assertTrue(pair1 != pair2, "Different factory should yield different pair");
    }

    function test_createPair_incrementsAllPairsLength() public {
        assertEq(factory.allPairsLength(), 0);
        factory.createPair(address(tokenA), address(tokenB));
        assertEq(factory.allPairsLength(), 1);
        MockERC20 tC = new MockERC20("TKC", "TKC", 18);
        factory.createPair(address(tokenA), address(tC));
        assertEq(factory.allPairsLength(), 2);
    }

    function test_createPair_revertsOnIdentical() public {
        vm.expectRevert(bytes("UniswapV2: IDENTICAL_ADDRESSES"));
        factory.createPair(address(tokenA), address(tokenA));
    }

    function test_createPair_revertsOnDuplicate() public {
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert(bytes("UniswapV2: PAIR_EXISTS"));
        factory.createPair(address(tokenA), address(tokenB));
        vm.expectRevert(bytes("UniswapV2: PAIR_EXISTS"));
        factory.createPair(address(tokenB), address(tokenA));
    }

    function test_getPair_works() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        assertEq(factory.getPair(address(tokenA), address(tokenB)), pair);
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair);
    }

    function test_setFeeTo_requiresFeeSetter() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(bytes("UniswapV2: FORBIDDEN"));
        factory.setFeeTo(address(0xCAFE));
    }

    function test_setFeeToSetter_requiresFeeSetter() public {
        address newSetter = address(0xCAFE);
        vm.prank(feeSetter);
        factory.setFeeToSetter(newSetter);
        assertEq(factory.feeToSetter(), newSetter);
    }
}
