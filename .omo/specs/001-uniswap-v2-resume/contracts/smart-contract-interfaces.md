# Interface Contract — Smart Contracts (On-chain ABI surface)

> Defines the on-chain interfaces this dApp exposes. Format: Solidity interface signatures + the
> canonical Foundry ABI that the frontend consumes (see [frontend-module-api.md](./frontend-module-api.md)).
> Aligns with Principles I (security) & II (DeFi compliance). Solidity `^0.8.19`.

---

## Module map

```text
contracts/src/core/
  UniswapV2Factory.sol        -- pair registry / CREATE2 deployer / fee governance
  UniswapV2Pair.sol           -- AMM vault (swap/mint/burn/sync/skim) + TWAP accumulators + reentrancy lock
  UniswapV2ERC20.sol          -- LP token (ERC-20; EIP-2612 permit included for ABI parity)
  interfaces/
    IUniswapV2Factory.sol
    IUniswapV2Pair.sol
    IUniswapV2ERC20.sol
  libraries/
    Math.sol                  -- min, Babylonian sqrt
    UQ112x112.sol             -- fixed-point price encoding
    SafeMath.sol              -- kept for explicit intent under 0.8 unchecked

contracts/src/router/
  UniswapV2Router02.sol       -- periphery; direct-pair only (no multi-hop)
  WETH9.sol                   -- canonical Wrapped ETH
  interfaces/
    IUniswapV2Router02.sol
    IERC20.sol
    IWETH.sol
  libraries/
    UniswapV2Library.sol      -- pairFor (dynamic init hash), getReserves, getAmountOut/In
    TransferHelper.sol        -- safeTransfer / safeTransferFrom / safeTransferETH
```

---

## IUniswapV2Factory

```solidity
interface IUniswapV2Factory {
    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function allPairs(uint) external view returns (address pair);
    function allPairsLength() external view returns (uint);

    function feeTo() external view returns (address);
    function feeToSetter() external view returns (address);
    function setFeeTo(address) external;             // feeToSetter only
    function setFeeToSetter(address) external;        // feeToSetter only

    // R0.4 addition (dynamic init hash; ABI-compatible)
    function pairCodeHash() external pure returns (bytes32);
    // Legacy constant for ABI parity with canonical Uniswap V2 reads
    function INIT_CODE_PAIR_HASH() external view returns (bytes32);
}
```

**Access control**: `setFeeTo`/`setFeeToSetter` revert unless `msg.sender == feeToSetter` (Constitution I, access control).
**CREATE2 salt**: `keccak256(abi.encodePacked(token0, token1))` where `token0 < token1`.
**Determinism**: deployment yields the same pair address for any `(WETH, USDC)` unordered set across runs.

---

## IUniswapV2Pair

```solidity
interface IUniswapV2Pair {
    event Mint(address indexed sender, uint amount0, uint amount1);
    event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint amount0In, uint amount1In,
        uint amount0Out, uint amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    function name() external pure returns (string memory);   // "Uniswap V2"
    function symbol() external pure returns (string memory); // "UNI-V2"
    function decimals() external pure returns (uint8);        // 18
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);
    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
    function permit(address owner, address spender, uint value, uint deadline,
                    uint8 v, bytes32 r, bytes32 s) external;

    // AMM ops -- callable only via the Router (lock/sk pattern), NOT directly by users
    function mint(address to) external returns (uint liquidity);
    function burn(address to) external returns (uint amount0, uint amount1);
    function swap(uint amount0Out, uint amount1Out, address to /*, bytes calldata data -- REMOVED per FR-011 */) external;
    function skim(address to) external;
    function sync() external;

    // State
    function factory() external view returns (address);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function price0CumulativeLast() external view returns (uint);
    function price1CumulativeLast() external view returns (uint);
    function kLast() external view returns (uint);
}
```

**Security/Simplification notes (Constitution I + FR-011)**:
- `swap` signature drops the `bytes data` flash-callback parameter. No flash swaps. Reentrancy surface eliminated beyond the standard send-before-check balance update (still guarded by the `lock` flag).
- Direct calls to `mint`/`burn` by users are useless without the Router's `transferFrom` first — the Router is the trusted entrypoint that pulls funds before minting.

---

## IUniswapV2Router02 (direct-pair subset)

```solidity
interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);

    function addLiquidity(
        address tokenA, address tokenB,
        uint amountADesired, uint amountBDesired,
        uint amountAMin,   uint amountBMin,
        address to, uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);

    function addLiquidityETH(
        address token, uint amountTokenDesired,
        uint amountTokenMin, uint amountETHMin,
        address to, uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);

    function removeLiquidity(
        address tokenA, address tokenB, uint liquidity,
        uint amountAMin, uint amountBMin,
        address to, uint deadline
    ) external returns (uint amountA, uint amountB);

    function removeLiquidityETH(
        address token, uint liquidity, uint amountTokenMin, uint amountETHMin,
        address to, uint deadline
    ) external returns (uint amountToken, uint amountETH);

    // + permit variants (removeLiquidityWithPermit / removeLiquidityETHWithPermit)
    // + supportFeeOnTransferTokens variants (kept ABI for compat; out of scope tokens by whitelist)

    // Direct-pair swaps ONLY -- path.length must == 2 (asserted; reverts otherwise per FR-011)
    function swapExactTokensForTokens(
        uint amountIn, uint amountOutMin,
        address[] calldata path,    // REQUIRES path.length == 2
        address to, uint deadline
    ) external returns (uint[] memory amounts);

    function swapTokensForExactTokens(
        uint amountOut, uint amountInMax,
        address[] calldata path, address to, uint deadline
    ) external returns (uint[] memory amounts);

    // + swapExactETHForTokens / swapTokensForExactETH / swapExactTokensForETH / swapETHForExactTokens
    //   -- ETH pairs (path[0] = WETH or path[1] = WETH) -- wrapped via WETH9
}
```

**Removed** (FR-011 / R0.3):
- All multi-hop `getAmountsOut` / `getAmountsIn` internal helpers (re-implemented only with assertion `path.length == 2`).
- Flash swap helper entrypoints (none in canonical Router02 anyway).

**Validation in Router**:
- `require(deadline >= block.timestamp)` ("UniswapV2Router: EXPIRED")
- `require(amountAMin <= amountA && amountBMin <= amountB)` slippage
- `require(amountOutMin <= amounts[last])` slippage on swap
- `require(path.length == 2)` (custom error `UniswapV2Router: DIRECT_PAIR_ONLY`)

**Gas**: Router02 requires `viaIR=true`, `optimizer=true`, `optimizer_runs=200` (R0.2). Gas snapshots for the four canonical ops (`addLiquidity`, `removeLiquidity`, `swapExactTokensForTokens`, `createPair`) are committed and diff-checked on CI.

---

## IWETH9 (canonical)

```solidity
interface IWETH {
    function deposit() external payable;
    function withdraw(uint wad) external;
    function totalSupply() external view returns (uint);
    function balanceOf(address) external view returns (uint);
    function allowance(address, address) external view returns (uint);
    function approve(address, uint) external returns (bool);
    function transfer(address, uint) external returns (bool);
    function transferFrom(address, address, uint) external returns (bool);
}
```

---

## IERC20 (periphery reference)

Standard `name/symbol/decimals/totalSupply/balanceOf/transfer/approve/allowance/transferFrom` — used by `TransferHelper` and the frontend `useToken` hook.

---

## Error selectors (consumed by `lib/errors.ts`, R0.8)

| Selector (string) | Meaning | Mapped class |
|------------------|---------|--------------|
| `UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT` | slippage exceeded min | `slippage` |
| `UniswapV2: EXPIRED` | deadline passed | `deadline` |
| `UniswapV2: INSUFFICIENT_INPUT_AMOUNT` | zero input | `pool-empty`/`invalid` |
| `UniswapV2: INSUFFICIENT_LIQUIDITY` | pool has no reserves | `pool-empty` |
| `UniswapV2: INSUFFICIENT_B_AMOUNT` / `…A_AMOUNT` | slippage on liquidity | `slippage` |
| `UniswapV2Router: DIRECT_PAIR_ONLY` (custom) | multi-hop attempted (FR-011) | `invalid` |
| `TransferHelper: TRANSFER_FROM_FAILED` | allowance/balance insufficient | `allowance`/`insufficient-balance` |
| `UniswapV2: K` (invariant broken — fuzz/regression only) | K-invariant violation | `internal` (should never surface) |

Custom errors are emitted as `revert CustomError()` (Solidity 0.8.4+); the frontend decodes via `abis.ts` error map.

---

## Deployment interface (Forge scripts)

- `script/core/DeployFactory.s.sol` — `forge script ... --broadcast` — exposes constructor `feeToSetter` arg.
- `script/router/DeployRouter.s.sol` — constructor args `(factory, weth)`.
- `script/DeployDemo.s.sol` — one-shot anvil demo: deploys MockERC20 (4 tokens), WETH9, Factory, Router02, calls `createPair` × N, seeds initial liquidity. Plays through the Success Criteria validation scenarios in `quickstart.md`.

All scripts emit `console.log` address lines (consumable for `frontend/scripts/sync-deploy.ts`) and use `vm.startBroadcast()` for the deployer key.