// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Vm} from "forge-std/Vm.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Router02} from "../../src/router/UniswapV2Router02.sol";
import {IERC20} from "../../src/router/interfaces/IERC20.sol";
import {WETH9} from "../../src/router/WETH9.sol";

/// @title UniswapV2PairHandler — stateful fuzzing actor for the UniswapV2Pair invariant suite.
/// @notice Drives a live pair through the canonical user flows — Router02 `addLiquidity` /
///         `removeLiquidity` / `swapExactTokensForTokens` as three LP actors, plus the pair's
///         `skim` and `sync` maintenance paths. The constant-product state is shadowed in the
///         `ghostK` ghost, updated to `reserve0 * reserve1` after every action.
/// @dev Deliberately inherits only `StdUtils` (for `bound`), never `Test`: the handler is an
///      actor contract. Every action impersonates its intended caller via `vm.prank`.
contract UniswapV2PairHandler is StdUtils {
    /// @dev Cheatcode address (same trick forge-std's own bases use).
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// @notice Number of LP actors (size of the `actors` array).
    uint256 public constant ACTOR_COUNT = 3;

    /// @dev Per-call deposit cap (1% of the current reserve or this, whichever is smaller)
    ///      keeps reserves from ballooning toward the uint112 ceiling across a 256-deep run.
    uint256 private constant MAX_ADD = 1000 ether;
    /// @dev Initial liquidity seeded through the router (100,000 of each token).
    uint256 private constant SEED_LIQUIDITY = 100_000 ether;
    /// @dev Wallet funding per actor (top-ups make this mostly a head start).
    uint256 private constant ACTOR_FUNDING = 1_000_000 ether;
    /// @dev Wallet funding for the handler, which acts as the swap agent.
    uint256 private constant HANDLER_FUNDING = 10_000_000 ether;

    /// @notice token0 of the pair (lower address).
    MockERC20 public token0;
    /// @notice token1 of the pair (higher address).
    MockERC20 public token1;
    /// @notice The pair under test.
    UniswapV2Pair public pair;
    /// @notice Router used for every user-facing action (exercises the real TransferHelper path).
    UniswapV2Router02 public router;
    /// @notice Ghost: `reserve0 * reserve1` recorded at the end of every action.
    uint256 public ghostK;
    /// @notice The three LP actors.
    address[ACTOR_COUNT] public actors;

    constructor() {
        // Mirror script/DeployDemo.s.sol: two mocks sorted into token0/token1, a real WETH9
        // (unused by the ERC20 flows but required by the Router constructor), factory + router.
        MockERC20 tokenA = new MockERC20("TokenA", "TKA", 18);
        MockERC20 tokenB = new MockERC20("TokenB", "TKB", 18);
        (token0, token1) = address(tokenA) < address(tokenB) ? (tokenA, tokenB) : (tokenB, tokenA);

        // feeTo stays address(0), so the protocol fee is OFF: swap fees accrue to LPs.
        UniswapV2Factory factory = new UniswapV2Factory(address(this));
        router = new UniswapV2Router02(address(factory), address(new WETH9()));
        pair = UniswapV2Pair(factory.createPair(address(token0), address(token1)));

        actors[0] = address(0xA11CE);
        actors[1] = address(0xB0B);
        actors[2] = address(0xCA11);

        // Fund the actors + the handler (swap agent), and grant max approvals to the router
        // for both tokens and the LP token (removeLiquidity pulls LP from the caller).
        for (uint256 i = 0; i < actors.length; i++) {
            token0.mint(actors[i], ACTOR_FUNDING);
            token1.mint(actors[i], ACTOR_FUNDING);
            _approve(actors[i], address(token0));
            _approve(actors[i], address(token1));
            _approve(actors[i], address(pair)); // LP token
        }
        token0.mint(address(this), HANDLER_FUNDING);
        token1.mint(address(this), HANDLER_FUNDING);
        token0.approve(address(router), type(uint256).max);
        token1.approve(address(router), type(uint256).max);

        // Seed the pool through the router so reserves are nonzero (actor0 = first LP).
        vm.prank(actors[0]);
        router.addLiquidity(
            address(token0), address(token1), SEED_LIQUIDITY, SEED_LIQUIDITY, 0, 0, actors[0], block.timestamp
        );
        _updateGhost();
    }

    // ---------------------------------------------------------------------------------------------
    // Actions (fuzzed via targetSelector in UniswapV2PairInvariant)
    // ---------------------------------------------------------------------------------------------

    /// @notice Add liquidity as `actors[actorSeed]` via `router.addLiquidity`.
    /// @dev `amount0` / `amount1` are bounded to [floor, ~1% of the matching reserve]; the
    ///      router re-balances the deposit to the pool ratio and mints LP to the actor.
    function addLiquidity(uint256 actorSeed, uint256 amount0, uint256 amount1) external {
        address actor = _actor(actorSeed);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 cap0 = _depositCap(uint256(r0));
        uint256 cap1 = _depositCap(uint256(r1));
        if (cap0 < 1 ether || cap1 < 1 ether) return; // dust pool — skip rather than revert
        uint256 amt0 = bound(amount0, 1 ether, cap0);
        uint256 amt1 = bound(amount1, 1 ether, cap1);
        _ensureBalance(token0, actor, amt0);
        _ensureBalance(token1, actor, amt1);
        vm.prank(actor);
        router.addLiquidity(address(token0), address(token1), amt0, amt1, 0, 0, actor, block.timestamp);
        _updateGhost();
    }

    /// @notice Remove liquidity as `actors[actorSeed]` via `router.removeLiquidity`.
    /// @dev `liquidity` is bounded to the actor's current LP balance.
    function removeLiquidity(uint256 actorSeed, uint256 liquidity) external {
        address actor = _actor(actorSeed);
        uint256 lp = pair.balanceOf(actor);
        if (lp == 0) return; // nothing to withdraw
        // Floor of 1000 LP (or the full balance below it): at the max ~145:1 price skew a
        // run can reach, 24 LP still yields >= 1 wei out per side — 1000 is safely above
        // that rounding edge, so burns never revert on dust outputs.
        uint256 minLiq = lp < 1000 ? lp : 1000;
        uint256 liq = bound(liquidity, minLiq, lp);
        vm.prank(actor);
        router.removeLiquidity(address(token0), address(token1), liq, 0, 0, actor, block.timestamp);
        _updateGhost();
    }

    /// @notice Sell token0 for token1 (exact input, zero slippage bound).
    function swap0For1(uint256 amountIn) external {
        _swap(address(token0), address(token1), amountIn);
    }

    /// @notice Sell token1 for token0 (exact input, zero slippage bound).
    function swap1For0(uint256 amountIn) external {
        _swap(address(token1), address(token0), amountIn);
    }

    /// @notice Skim surplus tokens to `actors[actorSeed]`.
    /// @dev Guard: only callable when the pair's balance exceeds its reserve for either
    ///      token; through router-only flows the pair never accumulates a surplus, so this
    ///      action normally early-returns without touching the pair.
    function skim(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        address p = address(pair);
        (uint112 r0, uint112 r1,) = pair.getReserves();
        if (token0.balanceOf(p) <= uint256(r0) && token1.balanceOf(p) <= uint256(r1)) return;
        vm.prank(actor);
        pair.skim(actor);
        _updateGhost();
    }

    /// @notice Reconcile the pair's reserves with its token balances (no-op in the
    ///         router-only flows, kept as a fuzz target so the path is exercised).
    function sync() external {
        pair.sync();
        _updateGhost();
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    /// @dev Sell `tokenIn` for `tokenOut` via `router.swapExactTokensForTokens`; the handler
    ///      is the swap agent (msg.sender and output recipient).
    function _swap(address tokenIn, address tokenOut, uint256 amountIn) internal {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 reserveIn = tokenIn == address(token0) ? uint256(r0) : uint256(r1);
        // Bound the input to ~1% of the in-reserve: enough to move the price over a deep
        // run, too small to drain the pool. Skip dust pools instead of reverting.
        uint256 cap = reserveIn / 100;
        if (cap < 1 ether) return;
        uint256 amt = bound(amountIn, 1 ether, cap);
        _ensureBalance(MockERC20(tokenIn), address(this), amt);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        vm.prank(address(this));
        router.swapExactTokensForTokens(amt, 0, path, address(this), block.timestamp);
        _updateGhost();
    }

    /// @dev Grant a max allowance on `token` to the router, impersonating `owner`.
    function _approve(address owner, address token) internal {
        vm.prank(owner);
        IERC20(token).approve(address(router), type(uint256).max);
    }

    /// @dev Per-call deposit cap: 1% of the current reserve, itself capped by MAX_ADD.
    function _depositCap(uint256 reserve) internal pure returns (uint256) {
        uint256 pct = reserve / 100;
        return pct < MAX_ADD ? pct : MAX_ADD;
    }

    /// @dev Top up `who` when it is short, so a bounded action can never revert on an empty
    ///      wallet. MockERC20.mint is permissionless, and minting only inflates fake token
    ///      supply — no invariant tracks it (pair balances, reserves and LP supply untouched).
    ///      ponytail: open-mint mock only; a fixed-supply token would need real re-funding
    ///      or reverts tolerated via fail_on_revert = false.
    function _ensureBalance(MockERC20 token, address who, uint256 amount) internal {
        uint256 bal = token.balanceOf(who);
        if (bal < amount) token.mint(who, amount - bal);
    }

    /// @dev Record `reserve0 * reserve1` after an action — the k ghost the invariants check.
    function _updateGhost() internal {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        ghostK = uint256(r0) * uint256(r1);
    }

    /// @dev Pick the actor for a bounded seed.
    function _actor(uint256 actorSeed) internal view returns (address) {
        return actors[bound(actorSeed, 0, ACTOR_COUNT - 1)];
    }
}
