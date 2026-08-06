// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IUniswapV2Factory — pair registry + CREATE2 deployer interface.
/// @notice Defines the factory surface consumed by the Pair, the Router and off-chain
///         tooling: pair creation, pair lookup, pair enumeration and fee governance.
interface IUniswapV2Factory {
    /// @notice Emitted when a new pair is created.
    /// @param token0 The pair's lower-address token.
    /// @param token1 The pair's higher-address token.
    /// @param pair The address of the newly created pair.
    /// @param pairCount Total number of pairs after this creation (1-based index).
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    /// @notice Deploys a pair for `tokenA` / `tokenB` (order-independent).
    /// @param tokenA First token of the pair.
    /// @param tokenB Second token of the pair.
    /// @return pair The address of the newly created UniswapV2Pair.
    function createPair(address tokenA, address tokenB) external returns (address pair);

    /// @notice Looks up the pair for two tokens (order-independent).
    /// @param tokenA First token of the pair.
    /// @param tokenB Second token of the pair.
    /// @return pair The pair address, or `address(0)` if it does not exist.
    function getPair(address tokenA, address tokenB) external view returns (address pair);

    /// @notice Returns the pair at a 0-based `index` in creation order.
    /// @return pair The pair address at that index.
    function allPairs(uint256) external view returns (address pair);

    /// @notice Total number of pairs created by this factory.
    /// @return The length of the `allPairs` array.
    function allPairsLength() external view returns (uint256);

    /// @notice The protocol fee recipient (`address(0)` = fee disabled).
    /// @return The current fee recipient.
    function feeTo() external view returns (address);

    /// @notice The account allowed to change `feeTo` / `feeToSetter`.
    /// @return The current fee governance admin.
    function feeToSetter() external view returns (address);

    /// @notice Sets the protocol fee recipient to `_feeTo` (`address(0)` disables the
    ///         protocol fee).
    /// @dev Only callable by `feeToSetter`.
    function setFeeTo(address) external;

    /// @notice Transfers fee governance to the new admin `_feeToSetter`.
    /// @dev Only callable by the current `feeToSetter`.
    function setFeeToSetter(address) external;

    /// @notice The pair init-code hash used for off-chain CREATE2 address derivation.
    /// @return `keccak256` of the pair's creation code.
    function pairCodeHash() external pure returns (bytes32);

    /// @notice Alias of `pairCodeHash()` for canonical-interface parity.
    /// @return `keccak256` of the pair's creation code.
    function INIT_CODE_PAIR_HASH() external view returns (bytes32);
}
