// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title ErrorSelectors — selectors for revert reasons emitted by the Uniswap V2 contracts.
/// @notice String-revert selectors are keccak256 of the full string; custom-error selectors
///         are the first 4 bytes of keccak256 of the custom error signature.
library ErrorSelectors {
    // String reverts (canonical Uniswap V2 require strings)
    bytes4 internal constant INSUFFICIENT_OUTPUT_AMOUNT = bytes4(keccak256("UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT"));
    bytes4 internal constant INSUFFICIENT_INPUT_AMOUNT = bytes4(keccak256("UniswapV2: INSUFFICIENT_INPUT_AMOUNT"));
    bytes4 internal constant INSUFFICIENT_LIQUIDITY = bytes4(keccak256("UniswapV2: INSUFFICIENT_LIQUIDITY"));
    bytes4 internal constant INSUFFICIENT_LIQUIDITY_MINTED =
        bytes4(keccak256("UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED"));
    bytes4 internal constant INSUFFICIENT_LIQUIDITY_BURNED =
        bytes4(keccak256("UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED"));
    bytes4 internal constant EXPIRED = bytes4(keccak256("UniswapV2: EXPIRED"));
    bytes4 internal constant INVALID_SIGNATURE = bytes4(keccak256("UniswapV2: INVALID_SIGNATURE"));
    bytes4 internal constant TRANSFER_FAILED = bytes4(keccak256("UniswapV2: TRANSFER_FAILED"));
    bytes4 internal constant K = bytes4(keccak256("UniswapV2: K"));
    bytes4 internal constant LOCKED = bytes4(keccak256("UniswapV2: LOCKED"));
    bytes4 internal constant FORBIDDEN = bytes4(keccak256("UniswapV2: FORBIDDEN"));
    bytes4 internal constant OVERFLOW = bytes4(keccak256("UniswapV2: OVERFLOW"));

    // Factory
    bytes4 internal constant IDENTICAL_ADDRESSES = bytes4(keccak256("UniswapV2: IDENTICAL_ADDRESSES"));
    bytes4 internal constant PAIR_EXISTS = bytes4(keccak256("UniswapV2: PAIR_EXISTS"));
    bytes4 internal constant ZERO_ADDRESS = bytes4(keccak256("UniswapV2: ZERO_ADDRESS"));

    // TransferHelper (Phase 3 placeholder for Router)
    bytes4 internal constant TRANSFER_FROM_FAILED = bytes4(keccak256("TransferHelper: TRANSFER_FROM_FAILED"));

    // Router custom error (Phase 3) — DIRECT_PAIR_ONLY
    bytes4 internal constant DIRECT_PAIR_ONLY = bytes4(keccak256("DirectPairOnly()"));
}
