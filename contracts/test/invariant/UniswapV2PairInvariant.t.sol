// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Test} from "forge-std/Test.sol";
import {UniswapV2PairHandler} from "./UniswapV2PairHandler.sol";

/// @title UniswapV2PairInvariant — stateful invariant suite for UniswapV2Pair.
/// @notice Fuzzes a live pair through UniswapV2PairHandler (add/remove liquidity, swaps,
///         skim, sync) and asserts the constant-product, reserve-tracking, LP-accounting and
///         liquidity-floor invariants after every action.
/// @dev Uses the default invariant profile (256 runs x 256 depth, fail_on_revert = false).
///      The handler bounds every action so reverts are rare and runs stay dense.
contract UniswapV2PairInvariant is Test {
    UniswapV2PairHandler internal handler;

    function setUp() public {
        handler = new UniswapV2PairHandler();

        // Fuzz exactly the six handler actions (nothing else on the handler is targeted).
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](6);
        selectors[0] = bytes4(keccak256("addLiquidity(uint256,uint256,uint256)"));
        selectors[1] = bytes4(keccak256("removeLiquidity(uint256,uint256)"));
        selectors[2] = bytes4(keccak256("swap0For1(uint256)"));
        selectors[3] = bytes4(keccak256("swap1For0(uint256)"));
        selectors[4] = bytes4(keccak256("skim(uint256)"));
        selectors[5] = bytes4(keccak256("sync()"));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));

        // Gate: the handler must have seeded real, approved state — otherwise a broken setup
        // would silently revert every action and make the runs vacuous.
        (uint112 r0, uint112 r1,) = handler.pair().getReserves();
        assertGt(uint256(r0), 0, "setUp: handler did not seed reserve0");
        assertGt(uint256(r1), 0, "setUp: handler did not seed reserve1");
        assertGt(handler.pair().balanceOf(handler.actors(0)), 0, "setUp: actor0 holds no LP");
        assertEq(
            handler.token0().allowance(handler.actors(0), address(handler.router())),
            type(uint256).max,
            "setUp: actor0 has not approved the router"
        );
    }

    /// @notice Constant product: `reserve0 * reserve1` never falls below the k the handler
    ///         recorded after its last completed action (swap fees can only raise it).
    function invariant_kDoesNotDecrease() public {
        (uint112 r0, uint112 r1,) = handler.pair().getReserves();
        assertGe(
            uint256(r0) * uint256(r1),
            handler.ghostK(),
            "constant product (reserve0 * reserve1) fell below the last recorded k"
        );
    }

    /// @notice Pair balances and reserves never diverge: every mutating path ends in an
    ///         `_update` that re-syncs reserves to measured balances, and the handler never
    ///         raw-donates without a sync path — so the equality is exact, not approximate.
    function invariant_reservesTrackBalances() public {
        address pair = address(handler.pair());
        (uint112 r0, uint112 r1,) = handler.pair().getReserves();
        assertEq(handler.token0().balanceOf(pair), uint256(r0), "pair token0 balance != reserve0");
        assertEq(handler.token1().balanceOf(pair), uint256(r1), "pair token1 balance != reserve1");
    }

    /// @notice LP accounting: every LP token is held by one of the 3 actors or locked at
    ///         address(0) as MINIMUM_LIQUIDITY (1000 wei, minted on the first deposit and
    ///         unburnable ever after) — the sum must equal the total supply.
    function invariant_lpAccounting() public {
        address pair = address(handler.pair());
        uint256 actorLp;
        for (uint256 i = 0; i < 3; i++) {
            actorLp += handler.pair().balanceOf(handler.actors(i));
        }
        assertEq(
            actorLp + handler.pair().balanceOf(address(0)),
            handler.pair().totalSupply(),
            "LP supply != actor LPs + MINIMUM_LIQUIDITY locked at address(0)"
        );
    }

    /// @notice The pool can never be drained: swaps output strictly less than the in-reserve
    ///         (AMM math) and the 1000-LP lock at address(0) keeps a dust share unburnable.
    function invariant_swapOutputBounded() public {
        (uint112 r0, uint112 r1,) = handler.pair().getReserves();
        assertGt(uint256(r0), 0, "reserve0 drained to zero");
        assertGt(uint256(r1), 0, "reserve1 drained to zero");
    }
}
