// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IUniswapV2Factory} from "./interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "./interfaces/IUniswapV2Pair.sol";
import {UniswapV2Pair} from "./UniswapV2Pair.sol";

/// @title Uniswap V2 Factory — CREATE2 pair deployer + fee governance.
/// @notice Deploys UniswapV2Pair contracts via CREATE2 (deterministic addresses) and
///         tracks every pair in `getPair` / `allPairs`. Also holds the protocol-fee
///         governance: `feeTo` (fee recipient) and `feeToSetter` (its administrator).
/// @dev Pair addresses are deterministic — `CREATE2` with salt
///      `keccak256(abi.encodePacked(token0, token1))` — so the Router can compute them
///      off-chain from the pair init-code hash without any registry lookups.
contract UniswapV2Factory is IUniswapV2Factory {
    /// @notice Protocol fee recipient; when non-zero, the Pair mints 1/6 of the 0.3%
    ///         swap fee to this address. `address(0)` disables the protocol fee.
    address public feeTo;

    /// @notice The only account allowed to call `setFeeTo` / `setFeeToSetter`
    ///         (`onlyFeeToSetter` access control).
    address public feeToSetter;

    /// @notice Pair registry: `getPair[tokenA][tokenB]` returns the pair address for the
    ///         two tokens (order-independent — both orderings are written), or
    ///         `address(0)` if no pair exists yet.
    mapping(address => mapping(address => address)) public getPair;

    /// @notice Ordered list of all pairs ever created (index 0 = first pair).
    address[] public allPairs;

    /// @notice Deploys the factory and sets the initial fee-governance admin.
    /// @param _feeToSetter The account granted `onlyFeeToSetter` access.
    constructor(address _feeToSetter) {
        feeToSetter = _feeToSetter;
    }

    /// @notice Total number of pairs created by this factory.
    /// @return The length of the `allPairs` array.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Deploys a new pair for `tokenA` / `tokenB` and registers it in the
    ///         factory's pair registry and `allPairs` list.
    /// @param tokenA First token of the pair (arguments are order-independent).
    /// @param tokenB Second token of the pair (arguments are order-independent).
    /// @return pair The address of the newly created UniswapV2Pair.
    /// @dev Tokens are sorted so `token0 < token1` in the pair. Reverts with
    ///      "UniswapV2: IDENTICAL_ADDRESSES" if `tokenA == tokenB`, "UniswapV2:
    ///      ZERO_ADDRESS" if either token is `address(0)`, and "UniswapV2: PAIR_EXISTS"
    ///      if the pair was already created. The CREATE2 salt is
    ///      `keccak256(abi.encodePacked(token0, token1))`, which makes the resulting
    ///      pair address deterministic for a given token pair.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "UniswapV2: PAIR_EXISTS");
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        UniswapV2Pair pairContract = new UniswapV2Pair{salt: salt}();
        pairContract.initialize(token0, token1);
        pair = address(pairContract);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /// @notice The init-code hash of the UniswapV2Pair used for off-chain CREATE2
    ///         address derivation.
    /// @return `keccak256` of the pair's creation code.
    /// @dev The Router reads this dynamically via `IUniswapV2Factory(factory)
    ///      .pairCodeHash()` (R0.4) instead of hard-coding the deployed hash.
    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(type(UniswapV2Pair).creationCode);
    }

    /// @notice Alias of `pairCodeHash()` kept for interface parity with the canonical
    ///         Uniswap V2 factory.
    /// @return `keccak256` of the pair's creation code.
    function INIT_CODE_PAIR_HASH() external pure returns (bytes32) {
        return keccak256(type(UniswapV2Pair).creationCode);
    }

    /// @notice Sets the protocol fee recipient.
    /// @param _feeTo New fee recipient; `address(0)` disables the protocol fee.
    /// @dev Reverts with "UniswapV2: FORBIDDEN" unless `msg.sender` is `feeToSetter`
    ///      (onlyFeeToSetter access control).
    function setFeeTo(address _feeTo) external {
        require(msg.sender == feeToSetter, "UniswapV2: FORBIDDEN");
        feeTo = _feeTo;
    }

    /// @notice Transfers fee governance to a new admin.
    /// @param _feeToSetter New `feeToSetter` account.
    /// @dev Reverts with "UniswapV2: FORBIDDEN" unless `msg.sender` is the current
    ///      `feeToSetter`. Use with care — the new setter can change `feeTo` at will.
    function setFeeToSetter(address _feeToSetter) external {
        require(msg.sender == feeToSetter, "UniswapV2: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }
}
