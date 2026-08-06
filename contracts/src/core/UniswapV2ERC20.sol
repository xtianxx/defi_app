// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IUniswapV2ERC20} from "./interfaces/IUniswapV2ERC20.sol";

/// @title Uniswap V2 LP token base (ERC-20 with EIP-2612 permit).
/// @notice Mint/burn are internal; only the inheriting Pair contract exposes them
///         externally. The token implements the standard ERC-20 surface plus a
///         EIP-2612 `permit` for gasless approvals.
/// @dev `DOMAIN_SEPARATOR` is computed once in the constructor from the chain id and the
///      token address, so permit signatures are only valid on the deploying chain.
contract UniswapV2ERC20 is IUniswapV2ERC20 {
    /// @notice The LP token name ("Uniswap V2").
    string public constant name = "Uniswap V2";
    /// @notice The LP token symbol ("UNI-V2").
    string public constant symbol = "UNI-V2";
    /// @notice The LP token decimals (18).
    uint8 public constant decimals = 18;

    /// @notice Total amount of LP tokens in existence.
    uint256 public totalSupply;
    /// @notice Token balance of each account.
    mapping(address => uint256) public balanceOf;
    /// @notice Allowance granted by `owner` to `spender`.
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice EIP-712 domain separator for this contract, computed at deployment
    ///         (`keccak256("EIP712Domain(...)")` over name, version "1", chain id and
    ///         verifying contract).
    bytes32 public DOMAIN_SEPARATOR;
    /// @notice EIP-712 typehash of the `Permit` struct.
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    /// @notice Next unused nonce for each account (incremented per `permit` call).
    mapping(address => uint256) public nonces;

    /// @notice Deploys the token and computes the EIP-712 domain separator.
    /// @dev Reads the chain id via inline assembly (`chainid()`) so the separator is
    ///      correct on any chain this contract is deployed to.
    constructor() {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    /// @notice Mints `value` LP tokens to `to`.
    /// @param to Recipient of the minted tokens.
    /// @param value Amount of LP tokens to mint.
    /// @dev Internal — only callable by the inheriting Pair (e.g. from `mint` /
    ///      `_mintFee`), which is the sole holder of mint authority. Emits `Transfer`
    ///      from `address(0)`.
    function _mint(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    /// @notice Burns `value` LP tokens from `from`.
    /// @param from Account whose tokens are burned.
    /// @param value Amount of LP tokens to burn.
    /// @dev Internal — only callable by the inheriting Pair (e.g. from `burn`). Reverts
    ///      on underflow if `from` holds fewer than `value` tokens. Emits `Transfer` to
    ///      `address(0)`.
    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    /// @notice Sets `spender`'s allowance from `owner` to `value`.
    /// @dev Private helper shared by `approve` and `permit`. Emits `Approval`.
    function _approve(address owner, address spender, uint256 value) private {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    /// @notice Moves `value` tokens from `from` to `to`.
    /// @dev Private helper shared by `transfer` and `transferFrom`. Reverts on
    ///      underflow/overflow like the standard ERC-20. Emits `Transfer`.
    function _transfer(address from, address to, uint256 value) private {
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    /// @notice Sets the allowance granted to `spender` by the caller.
    /// @param spender Account allowed to spend the caller's tokens.
    /// @param value Allowance amount (use `type(uint256).max` for unlimited).
    /// @return True on success (standard ERC-20).
    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    /// @notice Transfers `value` tokens from the caller to `to`.
    /// @param to Recipient of the tokens.
    /// @param value Amount of tokens to transfer.
    /// @return True on success (standard ERC-20).
    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    /// @notice Transfers `value` tokens from `from` to `to` using `from`'s allowance to
    ///         the caller.
    /// @param from Account whose tokens are moved.
    /// @param to Recipient of the tokens.
    /// @param value Amount of tokens to transfer.
    /// @return True on success (standard ERC-20).
    /// @dev If the allowance is `type(uint256).max` it is treated as unlimited and not
    ///      decremented; otherwise it is reduced by `value` (reverts on underflow).
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    /// @notice EIP-2612 gasless approval: sets `spender`'s allowance from `owner` to
    ///         `value` based on an EIP-712 signed message.
    /// @param owner Account granting the allowance (must match the recovered signer).
    /// @param spender Account allowed to spend `owner`'s tokens.
    /// @param value Allowance amount (use `type(uint256).max` for unlimited).
    /// @param deadline Unix timestamp after which the signature is invalid.
    /// @param v EIP-712 signature `v` value.
    /// @param r EIP-712 signature `r` value.
    /// @param s EIP-712 signature `s` value.
    /// @dev Reverts with "UniswapV2: EXPIRED" if `deadline < block.timestamp` and
    ///      "UniswapV2: INVALID_SIGNATURE" if `ecrecover` does not yield `owner`. The
    ///      `nonces[owner]` is incremented atomically, making each signature single-use.
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        // forge-lint: disable-next-line(block-timestamp)
        require(deadline >= block.timestamp, "UniswapV2: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress == owner, "UniswapV2: INVALID_SIGNATURE");
        _approve(owner, spender, value);
    }
}
