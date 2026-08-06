// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title WETH9 — canonical Wrapped Ether.
/// @notice Minimal WETH used by the Router to wrap/unwrap ETH for ERC-20 pairs. ETH is
///         accepted 1:1 and credited as WETH on `deposit` (or plain sends); WETH is
///         burned 1:1 and paid out as ETH on `withdraw`.
/// @dev Canonical WETH9 behavior: every WETH is fully backed by ETH held in this
///      contract, and `totalSupply` equals `address(this).balance`.
contract WETH9 {
    /// @notice The token name ("Wrapped Ether").
    string public name = "Wrapped Ether";
    /// @notice The token symbol ("WETH").
    string public symbol = "WETH";
    /// @notice The token decimals (18).
    uint8 public decimals = 18;

    event Approval(address indexed src, address indexed guy, uint256 wad);
    event Transfer(address indexed src, address indexed dst, uint256 wad);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    /// @notice WETH balance of each account.
    mapping(address => uint256) public balanceOf;
    /// @notice Allowance granted by `src` to `guy`.
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Plain ETH transfers are automatically wrapped.
    /// @dev Equivalent to calling `deposit()` with the received `msg.value`.
    receive() external payable {
        deposit();
    }

    /// @notice Wraps the sent ETH into WETH, crediting `msg.sender`.
    /// @dev Credits `balanceOf[msg.sender] += msg.value` and emits `Deposit`. The ETH is
    ///      held by this contract as backing for the newly minted WETH.
    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Unwraps `wad` WETH back into ETH, sending it to `msg.sender`.
    /// @param wad Amount of WETH to burn/unwrap.
    /// @dev Reverts with "WETH9: INSUFFICIENT_BALANCE" if the caller holds fewer than
    ///      `wad` WETH. Burns the WETH and sends the equivalent ETH via `transfer`.
    function withdraw(uint256 wad) public {
        require(balanceOf[msg.sender] >= wad, "WETH9: INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= wad;
        payable(msg.sender).transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    /// @notice Total amount of WETH in existence.
    /// @return The ETH balance of this contract (every WETH is fully backed 1:1).
    function totalSupply() public view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Sets the allowance granted to `guy` by the caller.
    /// @param guy Account allowed to spend the caller's WETH.
    /// @param wad Allowance amount (use `type(uint256).max` for unlimited).
    /// @return True on success (standard ERC-20).
    function approve(address guy, uint256 wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    /// @notice Transfers `wad` WETH from the caller to `dst`.
    /// @param dst Recipient of the WETH.
    /// @param wad Amount of WETH to transfer.
    /// @return True on success (standard ERC-20).
    function transfer(address dst, uint256 wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    /// @notice Transfers `wad` WETH from `src` to `dst` using `src`'s allowance to the
    ///         caller (unless the caller is `src` itself).
    /// @param src Account whose WETH is moved.
    /// @param dst Recipient of the WETH.
    /// @param wad Amount of WETH to transfer.
    /// @return True on success (standard ERC-20).
    /// @dev Reverts with "WETH9: INSUFFICIENT_BALANCE" if `src` holds fewer than `wad`
    ///      WETH, and "WETH9: INSUFFICIENT_ALLOWANCE" if the allowance is insufficient.
    ///      An allowance of `type(uint256).max` is treated as unlimited and not
    ///      decremented.
    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        require(balanceOf[src] >= wad, "WETH9: INSUFFICIENT_BALANCE");
        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            require(allowance[src][msg.sender] >= wad, "WETH9: INSUFFICIENT_ALLOWANCE");
            allowance[src][msg.sender] -= wad;
        }
        balanceOf[src] -= wad;
        balanceOf[dst] += wad;
        emit Transfer(src, dst, wad);
        return true;
    }
}
