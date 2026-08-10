// Minimal ABI fragments for the contracts we interact with from the frontend.
// sync-deploy.ts regenerates full ABIs from contracts/out/ once a build exists.
// Spec: contracts/frontend-module-api.md §9, research.md R0.9.

export const IERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

export const IWETH_ABI = [
  ...IERC20_ABI,
  "function deposit() payable",
  "function withdraw(uint256 wad)",
] as const;

export const IUniswapV2Factory_ABI = [
  "function createPair(address tokenA, address tokenB) returns (address pair)",
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
  "function feeTo() view returns (address)",
  "function feeToSetter() view returns (address)",
  "function pairCodeHash() pure returns (bytes32)",
  "function INIT_CODE_PAIR_HASH() view returns (bytes32)",
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount)",
] as const;

export const IUniswapV2Pair_ABI = [
  ...IERC20_ABI,
  "function mint(address to) returns (uint256 liquidity)",
  "function burn(address to) returns (uint256 amount0, uint256 amount1)",
  "function swap(uint256 amount0Out, uint256 amount1Out, address to)",
  "function skim(address to)",
  "function sync()",
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function nonces(address owner) view returns (uint256)",
  "function price0CumulativeLast() view returns (uint256)",
  "function price1CumulativeLast() view returns (uint256)",
  "function kLast() view returns (uint256)",
  "event Mint(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
] as const;

// Phase 3 — placeholder for the Router ABI. Filled in by sync-deploy after Phase 3 lands.
export const IUniswapV2Router02_ABI = [
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
  "function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) returns (uint256 amountToken, uint256 amountETH)",
  "function removeLiquidityWithPermit(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) returns (uint256 amountA, uint256 amountB)",
  "function removeLiquidityETHWithPermit(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline, bool approveMax, uint8 v, bytes32 r, bytes32 s) returns (uint256 amountToken, uint256 amountETH)",
] as const;

// DemoFaucet — 24h rate-limited test-token faucet (002-sepolia-vercel-deploy).
// Curated fragments for the /faucet page: grant-table constants, claim, eligibility views.
export const DemoFaucet_ABI = [
  "function WINDOW() view returns (uint256)",
  "function WETH_AMOUNT() view returns (uint256)",
  "function USDC_AMOUNT() view returns (uint256)",
  "function DAI_AMOUNT() view returns (uint256)",
  "function WBTC_AMOUNT() view returns (uint256)",
  "function lastRequestAt(address) view returns (uint256)",
  "function nextEligibleTime(address who) view returns (uint256)",
  "function request()",
  "event Requested(address indexed wallet, uint256 timestamp)",
] as const;
