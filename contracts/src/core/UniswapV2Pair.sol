// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";
import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2ERC20} from "./interfaces/IUniswapV2ERC20.sol";
import {UniswapV2ERC20} from "./UniswapV2ERC20.sol";
import {Math} from "./libraries/Math.sol";
import {UQ112x112} from "./libraries/UQ112x112.sol";
import {SafeMath} from "./libraries/SafeMath.sol";

/// @title Uniswap V2 Pair — AMM vault (swap/mint/burn) + TWAP accumulators.
/// @notice Inherits UniswapV2ERC20 for the LP token interface. The Pair itself implements
///         the IUniswapV2Pair AMM surface; ERC-20 functions come from the base. It enforces
///         the constant-product invariant `x * y >= k`, charges a 0.3% swap fee (1/6 of
///         which accrues to the factory's `feeTo` when set), and maintains two cumulative
///         price accumulators for TWAP oracles.
/// @dev All state-mutating entrypoints (`mint` / `burn` / `swap` / `skim` / `sync`) are
///      guarded by the `lock` reentrancy modifier. Per FR-011 there is NO flash-swap
///      callback — `swap` takes no `bytes data` parameter.
contract UniswapV2Pair is UniswapV2ERC20 {
    using SafeMath for uint256;
    using UQ112x112 for uint224;

    /// @notice Minimum LP supply locked forever at `address(0)` on first mint, which
    ///         prevents the first depositor from draining the pool via tiny deposits
    ///         (dust inflation attack).
    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;
    bytes4 private constant SELECTOR = bytes4(keccak256("transfer(address,uint256)"));

    /// @notice The UniswapV2Factory that deployed this pair (set in the constructor).
    address public factory;
    /// @notice The pair's first token (`token0 < token1`), sorted by address.
    address public token0;
    /// @notice The pair's second token (`token1 > token0`), sorted by address.
    address public token1;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    /// @notice Cumulative price of `token0` denominated in `token1`, updated on every
    ///         reserve change (TWAP oracle accumulator — see `_update`).
    uint256 public price0CumulativeLast;
    /// @notice Cumulative price of `token1` denominated in `token0`, updated on every
    ///         reserve change (TWAP oracle accumulator — see `_update`).
    uint256 public price1CumulativeLast;
    /// @notice Cached `reserve0 * reserve1` from the last `mint` / `burn`; used by
    ///         `_mintFee` to accrue the protocol fee (1/6 of swap fees) to `feeTo`.
    uint256 public kLast;

    uint256 private unlocked = 1;

    /// @notice Reentrancy guard: reverts with "UniswapV2: LOCKED" if a call is re-entered
    ///         while an outer call is still executing (set-and-clear flag pattern).
    modifier lock() {
        require(unlocked == 1, "UniswapV2: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    /// @notice Deploys the pair and records the deploying factory.
    /// @dev Sets `factory = msg.sender` (the factory contract) at construction. The Pair
    ///      is deployed via CREATE2 from the factory, so `msg.sender` here is the factory
    ///      address — this is what makes the `initialize` factory-gate work.
    constructor() {
        factory = msg.sender;
    }

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    /// @notice Sets the pair's tokens. Factory-only: reverts with "UniswapV2: FORBIDDEN"
    ///         unless `msg.sender` is the factory recorded in the constructor.
    /// @param _token0 The pair's lower-address token.
    /// @param _token1 The pair's higher-address token.
    /// @dev Callable exactly once, immediately after CREATE2 deployment (`createPair`).
    function initialize(address _token0, address _token1) external {
        require(msg.sender == factory, "UniswapV2: FORBIDDEN");
        token0 = _token0;
        token1 = _token1;
    }

    /// @notice The pair's current reserves and the timestamp of the last update.
    /// @return _reserve0 Current reserve of `token0`.
    /// @return _reserve1 Current reserve of `token1`.
    /// @return _blockTimestampLast `block.timestamp` of the last `_update` (in seconds).
    /// @dev Auto-generated public getter. Note: ERC-20 balances held by the pair can
    ///      exceed these reserves if tokens were transferred directly — `sync`/`skim`
    ///      exist to reconcile that.
    function getReserves() public view returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    /// @notice Transfers `value` of `token` to `to` via a low-level call using the ERC-20
    ///         `transfer(address,uint256)` selector.
    /// @dev Reverts with "UniswapV2: TRANSFER_FAILED" if the call fails or returns `false`
    ///      (missing return data — e.g. USDT-style tokens — is treated as success).
    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(SELECTOR, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "UniswapV2: TRANSFER_FAILED");
    }

    /// @notice Reconciles the pair's reserves with its actual token balances and accrues
    ///         the TWAP price accumulators.
    /// @param balance0 Actual balance of `token0` held by the pair.
    /// @param balance1 Actual balance of `token1` held by the pair.
    /// @param _reserve0 Previous reserve of `token0`.
    /// @param _reserve1 Previous reserve of `token1`.
    /// @dev Reverts with "UniswapV2: OVERFLOW" if either balance exceeds `uint112.max`.
    ///      Accumulates `price0CumulativeLast` / `price1CumulativeLast` — the TWAP oracle
    ///      data points — as `encodedReserve * timeElapsed` only when at least one second
    ///      has elapsed and both reserves are non-zero. Emits `Sync`.
    function _update(uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "UniswapV2: OVERFLOW");
        uint32 timeElapsed = uint32(block.timestamp) - blockTimestampLast;
        if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
            price0CumulativeLast += uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) * timeElapsed;
            price1CumulativeLast += uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) * timeElapsed;
        }
        // forge-lint: disable-next-line(unsafe-typecast)
        reserve0 = uint112(balance0);
        // forge-lint: disable-next-line(unsafe-typecast)
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp);
        emit Sync(reserve0, reserve1);
    }

    /// @notice Mints the accumulated protocol fee (1/6 of the 0.3% swap fee) to the
    ///         factory's `feeTo` recipient, based on growth of `k` since `kLast`.
    /// @param _reserve0 Current reserve of `token0`.
    /// @param _reserve1 Current reserve of `token1`.
    /// @return feeOn True if the protocol fee is enabled (`feeTo != address(0)`).
    /// @dev The remaining 5/6 of swap fees stays in the pool (captured as `k` growth).
    ///      When the fee is off, `kLast` is reset to 0 so it cannot be retroactively
    ///      claimed if `feeTo` is set later.
    function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
        address _feeTo = IUniswapV2Factory(factory).feeTo();
        feeOn = _feeTo != address(0);
        uint256 _kLast = kLast;
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK = Math.sqrt(uint256(_reserve0) * _reserve1);
                uint256 rootKLast = Math.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _mint(_feeTo, liquidity);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }

    /// @notice Deposits tokens into the pair and mints LP tokens to `to`. The caller must
    ///         have transferred the tokens to the pair beforehand (the Router does this via
    ///         `TransferHelper`), so amounts are measured as balance deltas.
    /// @param to Recipient of the minted LP tokens.
    /// @return liquidity The amount of LP tokens minted to `to`.
    /// @dev Reverts with "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED" if no liquidity is
    ///      minted (e.g. no tokens deposited). On the FIRST mint, `MINIMUM_LIQUIDITY`
    ///      (1000 wei) is permanently locked at `address(0)` and the minted amount is
    ///      `sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY`; on subsequent mints, LP tokens
    ///      are proportional to the smaller of the two deposit ratios. Accrues protocol
    ///      fees via `_mintFee` before computing the share, and updates `kLast` when the
    ///      fee is on. Reentrancy-protected by `lock`.
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IUniswapV2ERC20(token0).balanceOf(address(this));
        uint256 balance1 = IUniswapV2ERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply;
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min((amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1);
        }
        require(liquidity > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1;
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burns LP tokens held by the pair and transfers the proportional token
    ///         amounts to `to`. The caller must have transferred the LP tokens to the pair
    ///         beforehand (the Router does this via `TransferHelper`).
    /// @param to Recipient of the withdrawn `token0` / `token1` amounts.
    /// @return amount0 The amount of `token0` transferred to `to`.
    /// @return amount1 The amount of `token1` transferred to `to`.
    /// @dev Reverts with "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED" if the computed
    ///      amounts are zero. Accrues protocol fees via `_mintFee` before computing the
    ///      share, then re-syncs reserves and updates `kLast` when the fee is on.
    ///      Reentrancy-protected by `lock`.
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IUniswapV2ERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IUniswapV2ERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply;
        amount0 = (liquidity * _reserve0) / _totalSupply;
        amount1 = (liquidity * _reserve1) / _totalSupply;
        require(amount0 > 0 && amount1 > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);

        balance0 = IUniswapV2ERC20(_token0).balanceOf(address(this));
        balance1 = IUniswapV2ERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1;
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Executes a swap: sends up to `amount0Out` / `amount1Out` to `to` and
    ///         charges the input (balance delta after transfers), enforcing the
    ///         constant-product invariant with the 0.3% fee deducted.
    /// @param amount0Out Amount of `token0` to send to `to` (0 for pure token1 swaps).
    /// @param amount1Out Amount of `token1` to send to `to` (0 for pure token0 swaps).
    /// @param to Recipient of the output tokens; MUST NOT be `token0` or `token1`.
    /// @dev The caller must have transferred the input tokens to the pair beforehand (the
    ///      Router does this via `TransferHelper`); inputs are measured as balance deltas.
    ///      Reverts with "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT" if both outputs are 0,
    ///      "UniswapV2: INSUFFICIENT_LIQUIDITY" if an output exceeds its reserve,
    ///      "UniswapV2: INVALID_TO" if `to` is one of the pair's tokens, "UniswapV2:
    ///      INSUFFICIENT_INPUT_AMOUNT" if no input was paid, and "UniswapV2: K" if the
    ///      fee-adjusted constant-product invariant `balance0Adjusted * balance1Adjusted
    ///      >= k * 1000^2` is violated. Per FR-011 there is NO flash-swap callback — no
    ///      `bytes data` parameter is accepted. Reentrancy-protected by `lock`.
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external lock {
        require(amount0Out > 0 || amount1Out > 0, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        require(amount0Out < _reserve0 && amount1Out < _reserve1, "UniswapV2: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "UniswapV2: INVALID_TO");
            if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out);
            if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out);
            balance0 = IUniswapV2ERC20(_token0).balanceOf(address(this));
            balance1 = IUniswapV2ERC20(_token1).balanceOf(address(this));
        }

        uint256 amount0In = balance0 > _reserve0 - amount0Out ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > _reserve1 - amount1Out ? balance1 - (_reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "UniswapV2: INSUFFICIENT_INPUT_AMOUNT");

        uint256 balance0Adjusted = balance0.mul(1000) - amount0In.mul(3);
        uint256 balance1Adjusted = balance1.mul(1000) - amount1In.mul(3);
        require(
            balance0Adjusted.mul(balance1Adjusted) >= uint256(_reserve0).mul(_reserve1).mul(1000 ** 2), "UniswapV2: K"
        );

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Sends any `token0` / `token1` balance in excess of the recorded reserves to
    ///         `to`. Used to reclaim tokens that were transferred to the pair directly
    ///         (donations / stuck funds) instead of through a swap.
    /// @param to Recipient of the skimmed surplus.
    /// @dev The pair keeps exactly `reserve0` / `reserve1` after the skim. Reentrancy-
    ///      protected by `lock`.
    function skim(address to) external lock {
        address _token0 = token0;
        address _token1 = token1;
        _safeTransfer(_token0, to, IUniswapV2ERC20(_token0).balanceOf(address(this)) - reserve0);
        _safeTransfer(_token1, to, IUniswapV2ERC20(_token1).balanceOf(address(this)) - reserve1);
    }

    /// @notice Reconciles the recorded reserves with the pair's actual token balances.
    ///         Call this after a direct token transfer to the pair so that `getReserves`
    ///         and the TWAP accumulators reflect the real state.
    /// @dev Reverts with "UniswapV2: OVERFLOW" if a balance exceeds `uint112.max`.
    ///      Reentrancy-protected by `lock`.
    function sync() external lock {
        _update(
            IUniswapV2ERC20(token0).balanceOf(address(this)),
            IUniswapV2ERC20(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }
}
