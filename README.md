# Uniswap V2-style AMM DEX built from scratch

中文 | [English](README.en.md)

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

```text
Solidity · Foundry · Next.js · ethers v6

Constant Product AMM · Liquidity Pools · LP Tokens
0.3% Swap Fee · Protocol Fee · TWAP · CREATE2

Sepolia Live Demo · Verified Contracts · CI · E2E
```

> **A Uniswap V2-inspired constant-product AMM implemented from scratch with Solidity and Foundry.**
>
> 本项目**重新实现核心 AMM 机制，而不是 import / fork Uniswap 合约**：`Factory` / `Pair` /
> LP `ERC20` / `Router02` / `WETH9` 均为手写实现（含恒定乘积 invariant、0.3% 手续费编码、
> LP 会计、TWAP 累加器、`MINIMUM_LIQUIDITY`、reentrancy lock）。

| 入口 | 链接 |
|---|---|
| 🌐 Live Demo | <https://defi-app-three.vercel.app/> |
| ⛓ Network | Sepolia（chainId `11155111`），MetaMask 切换即可交互 |
| ✅ Contracts | Factory / Router02 / WETH9 / Faucet / 4 tokens，均已在 Etherscan 验证（地址见[线上部署](#线上-sepolia-部署)） |
| 📖 Demo 指南 | [demo-guide.md](specs/002-sepolia-vercel-deploy/demo-guide.md)（演示账户与余额） |
| ⚙️ Actions | [test.yml](.github/workflows/test.yml) |

> 📸 产品截图：`docs/screenshots/swap.png`（TODO：用 1440px 浏览器打开线上 Demo 的 `/swap` 截一屏提交到该路径；
> 在此之前先看 Live Demo）。

## 我做了什么

- **从零实现 Uniswap V2 核心**：`contracts/`（Foundry）手写 `Factory`、`Pair`、LP `ERC20`，以及简化版
  外围 `Router02`、`WETH9`、`UniswapV2Library`、`TransferHelper`。
- **完整 DEX 闭环**：`frontend/`（Next.js 15 App Router + ethers v6）支持 Swap、Add/Remove Liquidity、
  基于链上 TWAP 的 Portfolio 持仓视图，MetaMask 直连。
- **公共 Demo 已上线**：Sepolia 合约已验证 + Vercel 前端，可直接用测试币体验兑换与做市。
- **工程化**：Foundry 单测 + fuzz、前台 Vitest + Playwright、CI 门禁、一键本地/线上部署脚本。

## 核心特性

- 恒定乘积做市（`x·y=k`），直接交易对兑换
- 0.3% swap fee（编码进 invariant，无需单独记账）
- LP token 会计：几何平均首发 + 按比例增发/销毁，`MINIMUM_LIQUIDITY` 永久锁定
- TWAP 预言机：`UQ112x112` 累计价格 + `blockTimestampLast`
- Protocol fee：基于 `√k` 增长 mint LP（fee-on 时 1/6 归协议）
- `CREATE2` 确定性 Pair 地址，library 可离线推导
- DemoFaucet：测试币水龙头，支撑公共 Demo 体验

## Engineering Highlights

| Challenge | Implementation | Why it matters |
|---|---|---|
| AMM 定价 | 恒定乘积 invariant | 无需许可的做市 |
| Swap 手续费 | Fee-adjusted invariant（`1000/3`） | 0.3% 收费无需单独会计 |
| LP 会计 | 几何平均 + 按比例份额 | 公平的流动性所有权 |
| Pair 部署 | CREATE2 | 确定性地址，可离线推导 |
| 预言机 | UQ112x112 累计价格 | 链上 TWAP |
| 协议费 | `kLast` / `√k` 增长 mint LP | 无需逐笔结算协议收入 |
| 重入 | Pair 级 `lock` | 保护所有状态变更 AMM 路径 |
| 全栈集成 | Router + Next.js + 钱包 | 完整 DEX 生命周期 |

## 架构

```text
contracts/  (Foundry, Solidity ^0.8.19)
  src/core/     Factory · Pair · ERC20 (LP) · Math · SafeMath · UQ112x112
  src/router/   Router02 · WETH9 · UniswapV2Library · TransferHelper
  src/faucet/   DemoFaucet（测试币水龙头，支撑公共 Demo）
  script/       DeployDemo.s.sol（Factory + Router + WETH9 + 4 tokens + 2 seeded pairs）

Foundry 部署产物（out/ ABIs + broadcast/ 各链地址）
          ↓  sync-deploy（npm run sync-deploy，无参数多链）
          ↓  生成的 ABI + 地址绑定
Next.js dApp（/swap · /liquidity · /portfolio · /debug）
```

两个包仅通过生成产物耦合（ABI + 部署地址），无根级 workspace。完整约定见 `specs/` 设计文档。

## Core AMM Mechanics

一次完整 swap 的生命周期：

```text
User
  ↓
Router（校验 deadline / slippage，算出报价）
  ↓
transfer tokenIn → Pair
  ↓
Pair 计算实际 amountIn（balance-delta：当前余额 − 储备）
  ↓
apply 0.3% fee
  ↓
enforce：
  balance0Adjusted × balance1Adjusted ≥ reserve0 × reserve1 × 1000²
  ↓
update reserves
  ↓
update TWAP accumulator（_update）
```

报价公式（`UniswapV2Library.getAmountOut`）：

```text
amountOut =
  amountIn × 997 × reserveOut
  /
  (reserveIn × 1000 + amountIn × 997)
```

关键在：Pair 不信任 Router 传进来的数字，而是用**到账后的余额减去储备**算出真实输入，再用 fee-adjusted
invariant 卡住每一笔 swap（`contracts/src/core/UniswapV2Pair.sol:swap`）。

## 为什么不是简单的 `x × y = k`

很多 README 只写一句 `x·y=k`。真正执行时检查的是**把 0.3% fee 编码进 invariant**：

```text
(balance0 × 1000 − amount0In × 3)
×
(balance1 × 1000 − amount1In × 3)
≥
reserve0 × reserve1 × 1000²
```

含义：先把输入的 0.3% 扣掉（`×997/1000`），剩下的才需要满足 `k` 不变。手续费因此**不需要单独转账记账**，
直接沉淀为 `k` 的增长反哺所有 LP。这是从"知道公式"到"实现过 AMM"的分水岭。

## Liquidity & LP Accounting

初始流动性（第一次 mint）：

```text
liquidity = sqrt(amount0 × amount1) − MINIMUM_LIQUIDITY
```

后续添加：

```text
liquidity = min(
  amount0 × totalSupply / reserve0,
  amount1 × totalSupply / reserve1
)
```

移除流动性（burn，按比例）：

```text
amount0 = liquidity × reserve0 / totalSupply
amount1 = liquidity × reserve1 / totalSupply
```

`MINIMUM_LIQUIDITY = 1000`（wei）在第一次 mint 时永久锁定到零地址。
这防止了首个流动性过小导致的 pathological 份额操纵，保护 LP 份额会计不被"粉尘攻击"扭曲
（`contracts/src/core/UniswapV2Pair.sol:mint/burn`）。

## TWAP Oracle

Pair 维护两个累计价格：

```text
price0CumulativeLast
price1CumulativeLast
```

每次 `mint / burn / swap / sync` 都会经 `_update` 累加：

```text
spot price
   ↓
reserve1 / reserve0（UQ112x112 定点数编码）
   ↓
price × timeElapsed
   ↓
cumulative price
```

取 TWAP：

```text
TWAP =
  (cumulativePrice(t1) − cumulativePrice(t0))
  /
  (t1 − t0)
```

这个点同时体现 DeFi、定点数运算、预言机、Solidity 时间加权——简历含金量很高
（`contracts/src/core/UniswapV2Pair.sol:_update`，`UQ112x112`）。

## CREATE2 Deterministic Pair

```text
tokenA + tokenB
      ↓
sort tokens（token0 < token1）
      ↓
salt = keccak256(token0, token1)
      ↓
CREATE2
      ↓
deterministic Pair address
```

意义：`Router` / library 可**不查 Factory 存储、离线推导 Pair 地址**（`pairFor`）。
本仓库的 init-code hash 从 Factory 动态读取（而非硬编码常量），Factory 测试覆盖
CREATE2 推导一致性。这是典型的 Solidity 面试知识点。

## Protocol Fee

实现的不只是"每笔收 0.3%"：

```text
Swap fee：0.30%

fee off（feeTo == 0）：100% → LPs
fee on（feeTo != 0）： 5/6 → LPs，1/6 → protocol
```

关键区别：协议费**不是每笔 swap 转 token**，而是通过 `√k` 增长给 `feeTo` mint LP
（`_mintFee`：`liquidity = totalSupply×(√k−√kLast)/(√k×5+√kLast)`，`kLast` 跟踪）。
无逐笔结算、无额外会计，和 Uniswap V2 的 fee-on 设计一致。

## Testing & Invariants

先说验证了什么，再说命令。测试按 `core / router / faucet / mocks / utils` 分类
（`contracts/test/` 共 11 个文件）：

```text
Core
├─ Factory / CREATE2（含 library 推导一致性）
├─ Pair initialization（仅 Factory 可初始化）
├─ Mint / burn（含 MINIMUM_LIQUIDITY 锁定）
├─ Swap invariant（含 fee-adjusted K 检查）
├─ Fee accounting（_mintFee / kLast）
├─ TWAP（cumulative + timeElapsed）
└─ sync / skim

Router
├─ Add / remove liquidity（含 permit 变体）
├─ Token → Token swap（直接对）
├─ ETH / WETH 路径
└─ Slippage / deadline

Edge cases
├─ insufficient liquidity / output / input
├─ zero input / output
├─ invalid recipient
├─ reentrancy lock（LOCKED）
└─ reserve overflow（uint112）
```

Fuzz / invariant 现状（诚实披露）：现有 2 个 `testFuzz_*`（`Math.sqrt` 下界、faucet 时间窗），
**尚无状态化 invariant handler**。AMM 最适合补的 invariant（路线图，按性价比排序）：

```text
reserve0 × reserve1 计入 fee 后不减少（swap 后）
LP mint/burn 保持按比例所有权
swap 输出永不超过储备
totalSupply / LP 会计内部一致
CREATE2 地址 == library 推导地址
handler：addLiquidity / swap0For1 / swap1For0 / removeLiquidity / sync 随机执行数千次
```

前端：19 个 Vitest 单测（含 hooks/组件/绑定）+ 3 个 Playwright e2e + load 只读压测。
命令（与 CI 一致，完整循环见脚本）：

```bash
./scripts/test-unit.sh                  # forge test + vitest（两个包）
./scripts/test-e2e.sh                   # 全新 anvil → 部署 → 同步 → forge + vitest → 构建 + Playwright
cd contracts && forge test -vvv && forge test --coverage
cd frontend && npx tsc --noEmit && npm run lint && npm run test
```

CI（`.github/workflows/test.yml`）：合约 `fmt --check` → `build --sizes`（Router02 守 24KB 上限）→
`forge test`；前端 `tsc` → `lint` → `vitest` → `build`。e2e（Playwright）在本地经脚本运行。

## Security Properties

- 每笔 swap 后强制恒定乘积 invariant（含 fee-adjusted 检查）
- `mint / burn / swap / skim / sync` 全加 Pair 级重入锁
- 初始 `MINIMUM_LIQUIDITY` 永久锁定，防首个流动性操纵
- 储备限制在 `uint112`，溢出直接 revert
- `initialize` 仅 Factory 可调
- 先校验 fee-adjusted 余额，再更新储备
- `_safeTransfer` 兼容无返回值 token；`permit` 带 deadline + 签名校验

## 线上 Sepolia 部署

公共 Demo **已上线**（测试网代币，无真实资金）：

| 合约 | Sepolia 地址 |
|---|---|
| Factory | [0xc32bc046beafd48827f3d55356568476df322dde](https://sepolia.etherscan.io/address/0xc32bc046beafd48827f3d55356568476df322dde) |
| Router02 | [0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4](https://sepolia.etherscan.io/address/0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4) |
| WETH9 | [0xd1647800688ccb78c1f378329110fd10791b8af9](https://sepolia.etherscan.io/address/0xd1647800688ccb78c1f378329110fd10791b8af9) |
| DemoFaucet | [0xcba03ecf90db02aae02fa02dbba6e55b6431b9db](https://sepolia.etherscan.io/address/0xcba03ecf90db02aae02fa02dbba6e55b6431b9db) |
| USDC / DAI / WBTC | [0xf20503…5566](https://sepolia.etherscan.io/address/0xf205032b263672b814d26c81fa6b1c2697855566) / [0xfa30fb…7a97](https://sepolia.etherscan.io/address/0xfa30fbba942e92afe1bcfaed35698f360d9f7a97) / [0x1ea6c4…23df](https://sepolia.etherscan.io/address/0x1ea6c4954ab3632dfccdc676db96a3ec1c6023df) |

- 预置交易对：WETH/USDC、WETH/DAI（Pair 地址由 library 运行时推导，不提交写死）。
- 体验：打开 <https://defi-app-three.vercel.app/>，MetaMask 切 Sepolia 即可兑换、加/撤流动性、看持仓；
  测试币走应用内 faucet，演示账户见 demo-guide。
- 地址源：`frontend/src/lib/contracts/addresses.ts`（`DEPLOYMENTS`，anvil 31337 + Sepolia 11155111），
  由 Foundry `broadcast/` 经 `npm run sync-deploy` 生成并提交。

## 快速开始

本地开发（一键，推荐）：

```bash
./scripts/dev-deploy.sh --dev
# 全新 anvil → 部署完整 AMM（Factory/Router/WETH9/4 tokens/2 pairs）
# → 同步 ABI+地址绑定 → 验证可兑换 → 启动前端 http://localhost:3000
```

完整手动步骤 → [specs/001 quickstart](specs/001-uniswap-v2-resume/quickstart.md)。

复现线上部署（一键 + 文档）：

```bash
./scripts/sepolia-deploy.sh
```

完整 6 步（≤30 分钟，密钥/faucet/验证/Vercel/补款）→
[specs/002 quickstart](specs/002-sepolia-vercel-deploy/quickstart.md)。
环境变量模板见 `contracts/.env.example`（`SEPOLIA_RPC_URL` 仅服务端读取，绝不加 `NEXT_PUBLIC_`）。

## Tech Stack

| 层 | 技术 |
|---|---|
| 合约 | Solidity ^0.8.19，Foundry，viaIR + optimizer 200 runs |
| 前端 | Next.js 15 App Router，React 19，TS 严格模式，ethers v6，react-query，Tailwind + shadcn/ui |
| 测试 | Foundry（单测 + fuzz）· Vitest · Playwright · load 只读压测 |
| 部署 | Anvil（31337）· Sepolia（11155111）· Vercel · Etherscan 验证 |
| 绑定 | `sync-deploy`：broadcast/out → 生成的 ABI + 地址绑定 |

前端页面：`/swap` 兑换 · `/liquidity` 加/撤流动性 · `/portfolio` TWAP 持仓视图 · `/faucet` 测试币水龙头 · `/debug` 调试。
协议 70%，dApp 30%：页面是协议的展示层，核心是链上 AMM 会计。

## Scope / Non-goals

- 无闪电兑换（`swap` 无 `bytes data` 回调参数）。
- 无多跳路由：所有 swap 路径限定直接对（`path.length == 2`，否则 `DirectPairOnly`）。
- `Router02` 为子集实现（含 `removeLiquidityWithPermit`），未搬运 fee-on-transfer 兼容变体。
- 公共 Demo 仅测试网 + faucet 资产，不涉及真实资金。

## 文档

- 本地可运行指南：[specs/001 quickstart](specs/001-uniswap-v2-resume/quickstart.md)
- Sepolia 部署指南：[specs/002 quickstart](specs/002-sepolia-vercel-deploy/quickstart.md)
- 演示叙事与账户：[specs/002 demo-guide](specs/002-sepolia-vercel-deploy/demo-guide.md)
- Faucet / 前端 API 契约：[specs/002 contracts](specs/002-sepolia-vercel-deploy/contracts/)
- 研究与数据模型：[specs/002 research](specs/002-sepolia-vercel-deploy/research.md) ·
  [data-model](specs/002-sepolia-vercel-deploy/data-model.md)

## 许可证

MIT License. Copyright (c) 2026 Ray Tian.
