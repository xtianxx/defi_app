# Uniswap V2-style AMM DEX built from scratch

中文 | [English](README.en.md)

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

```text
Solidity · Foundry · Next.js · ethers v6

Constant Product AMM · Liquidity Pools · LP Tokens
0.3% Swap Fee · Protocol Fee · TWAP · CREATE2

Sepolia Live Demo · Verified Contracts · CI · E2E
```

| 入口 | 链接 |
|---|---|
| 🌐 Live Demo | <https://defi-app-three.vercel.app/> |
| ⛓ Network | Sepolia（chainId `11155111`），MetaMask 切换即可交互 |
| ✅ Contracts | Factory / Router02 / WETH9 / Faucet / 4 tokens，均已在 Etherscan 验证（地址见[线上 Sepolia 部署](#线上-sepolia-部署)） |
| 📖 Demo 指南 | [demo-guide.md](specs/002-sepolia-vercel-deploy/demo-guide.md)（演示账户与余额） |
| ⚙️ Actions | [test.yml](.github/workflows/test.yml) |

## 概览 Overview

**从零重新实现**（而非 import / fork）Uniswap V2 式
恒定乘积 AMM：`Factory` / `Pair` / LP `ERC20` /
`Router02` / `WETH9` 全部手写，含恒定乘积 invariant、
0.3% 手续费编码、LP 会计、TWAP 累加器、`MINIMUM_LIQUIDITY`、
reentrancy lock。

- **从零实现 Uniswap V2 核心**：`contracts/`（Foundry，
  Solidity ^0.8.19）手写 `Factory`、`Pair`、LP `ERC20`，
  及子集外围 `Router02`、`WETH9`、`UniswapV2Library`、
  `TransferHelper`。
- **完整 DEX 闭环**：`frontend/`（Next.js 15 App Router +
  ethers v6）支持 Swap、Add/Remove Liquidity、基于链上 TWAP
  的 Portfolio 持仓视图，MetaMask 直连。
- **公共 Demo 已上线**：Sepolia 合约已验证 + Vercel 前端，
  测试币即可体验兑换与做市。
- **工程化**：Foundry 单测 + fuzz、Vitest + Playwright、
  CI 门禁、一键本地/线上部署脚本。

核心特性：

- 恒定乘积做市（`x·y=k`），直接交易对兑换
- 0.3% swap fee 编码进 invariant——手续费无需单独记账
- 几何平均首发 + 按比例增发/销毁 LP，`MINIMUM_LIQUIDITY` 永久锁定
- UQ112x112 TWAP 预言机（`price0/1CumulativeLast` + `blockTimestampLast`）
- 协议费：基于 `√k` 增长 mint LP（fee-on 时 1/6 归协议）
- `CREATE2` 确定性 Pair 地址，library 可离线推导
- DemoFaucet：测试币水龙头，支撑公共 Demo 体验

## Demo

Live Demo · Sepolia（chainId `11155111`）· 合约已全部通过
Etherscan 验证（地址见[线上 Sepolia 部署](#线上-sepolia-部署)）。

<p align="center">
  <img src="docs/screenshots/swap.png" alt="Swap page — exchange tokens" width="720" />
</p>

<p align="center"><em>Swap — 兑换页面（占位）</em></p>

<p align="center">
  <img src="docs/screenshots/liquidity.png" alt="Liquidity page — add / remove liquidity" width="720" />
</p>

<p align="center"><em>Liquidity — 加/撤流动性页面（占位）</em></p>

<p align="center">
  <img src="docs/screenshots/portfolio.png" alt="Portfolio page — TWAP-backed position view" width="720" />
</p>

<p align="center"><em>Portfolio — TWAP 持仓视图（占位）</em></p>

Screenshots pending — placeholders; see Live Demo: <https://defi-app-three.vercel.app/>.

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

## 架构 Architecture

```text
contracts/  (Foundry, Solidity ^0.8.19, viaIR + optimizer 200 runs)
  src/core/     Factory · Pair · ERC20 (LP) · Math · SafeMath · UQ112x112
  src/router/   Router02 · WETH9 · UniswapV2Library · TransferHelper
  src/faucet/   DemoFaucet（测试币水龙头，支撑公共 Demo）
  script/       DeployDemo.s.sol（Factory + Router + WETH9 + 4 tokens + 2 seeded pairs）

Foundry 部署产物（out/ ABIs + broadcast/ 各链地址）
          ↓  sync-deploy（npm run sync-deploy，无参数多链）
          ↓  生成的 ABI + 地址绑定
Next.js dApp（React 19, ethers v6, Tailwind + shadcn/ui）— /swap · /liquidity · /portfolio · /faucet · /debug
```

两个包仅通过生成产物耦合（ABI + 部署地址），无根级
workspace；完整约定见 `specs/` 设计文档，包内细节见
`contracts/README.md` 与 `frontend/README.md`。

## Core AMM Mechanics

Pair 合约的六个核心机制，每个都有独立英文文档给出完整推导。
代码位置：`contracts/src/core/UniswapV2Pair.sol`、`UniswapV2Factory.sol`、
`contracts/src/router/libraries/UniswapV2Library.sol`。

- **Swap 生命周期** — Router 校验 deadline/slippage 并用 `getAmountOut` 报价
  （`amountIn × 997 × reserveOut / (reserveIn × 1000 + amountIn × 997)`）；Pair 以
  「到账后余额 − 储备」测量真实输入，扣 0.3% fee、校验 invariant 后更新储备与 TWAP
  累加器。[Docs](docs/amm-mechanics.md)
- **Fee-adjusted invariant** — 每笔 swap 实际执行的是编码了 0.3% fee 的检查：
  `balance0Adjusted × balance1Adjusted ≥ reserve0 × reserve1 × 1000²`，其中
  `balanceAdjusted = balance × 1000 − amountIn × 3`；手续费无需单独记账，直接沉淀为
  `k` 的增长。[Docs](docs/amm-mechanics.md)
- **LP 会计** — 首发流动性为几何平均 `sqrt(amount0 × amount1) − MINIMUM_LIQUIDITY`
  （1000 wei 永久锁到 `address(0)`）；后续增发/销毁按比例（取较小充值比），移除时按
  `liquidity × reserve / totalSupply` 兑出。[Docs](docs/amm-mechanics.md)
- **CREATE2 Pair 地址** — token 排序后用 `salt = keccak256(abi.encodePacked(token0,
  token1))` 部署；library 用 Factory 动态读出的 init-code hash 离线推导地址
  （`pairFor`）。[Docs](docs/amm-mechanics.md)
- **TWAP 预言机** — 两个 UQ112x112 累计价格累加器，`mint/burn/swap/sync` 都经
  `_update` 累加；[t0, t1] 区间 TWAP = 累计价差 ÷ 经过时间。[Docs](docs/twap.md)
- **协议费** — `feeTo` 设置后，`_mintFee` 按 `kLast` 以来的 `√k` 增长 mint LP
  （`totalSupply × (√k − √kLast) / (√k × 5 + √kLast)`）：swap fee 的 1/6 归协议，无逐笔
  转账。[Docs](docs/protocol-fee.md)

## Testing & Security

合约：`contracts/test/` 共 12 个测试文件，按
`core / router / faucet / invariant / mocks / utils` 分类，覆盖
Factory/CREATE2 推导、Pair 仅限 Factory 初始化、mint/burn 与
`MINIMUM_LIQUIDITY` 锁定、fee-adjusted swap invariant、
`_mintFee` / `kLast`、TWAP 累加器、边界情况与重入锁。除 2 个
`testFuzz_*` 外，还持续运行 **stateful invariant fuzzing
across randomized liquidity and swap sequences**（状态化不变量
模糊测试：随机流动性操作与 swap 序列）。前端测试在
`frontend/tests/`（`unit/` 为 Vitest、`e2e/` 为 Playwright）。

前端：19 个 Vitest 单测（hooks/组件/绑定）+ 3 个 Playwright
e2e（portfolio、remove-liquidity、responsive）+ 只读 load
压测（`frontend/tests/load/`）。命令与 CI 一致（完整循环
见脚本）：

```bash
./scripts/test-unit.sh                  # forge test + vitest（两个包）
./scripts/test-e2e.sh                   # 全新 anvil → 部署 → sync → 测试 → 构建 + Playwright
cd contracts && forge test -vvv && forge test --coverage
cd frontend && npx vitest run && npx tsc --noEmit && npm run lint
```

CI（`.github/workflows/test.yml`）：合约 `fmt --check` →
`build --sizes` → `forge test`；前端 `tsc` → `lint` →
`vitest` → `build`；e2e（Playwright）经
`./scripts/test-e2e.sh` 本地运行。

安全属性：

- 每笔 swap 后强制 fee-adjusted 恒定乘积 invariant
- `mint / burn / swap / skim / sync` 全加 Pair 级重入锁
- 首发 `MINIMUM_LIQUIDITY` 永久锁定
- 储备限制在 `uint112`，溢出直接 revert
- `initialize` 仅 Factory 可调
- `_safeTransfer` 兼容无返回值 token；`permit` 带 deadline
  + 签名校验

## 线上 Sepolia 部署

公共 Demo **已上线**（测试网代币，无真实资金）：

| 合约 | Sepolia 地址 |
|---|---|
| Factory | [0xc32bc046beafd48827f3d55356568476df322dde](https://sepolia.etherscan.io/address/0xc32bc046beafd48827f3d55356568476df322dde) |
| Router02 | [0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4](https://sepolia.etherscan.io/address/0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4) |
| WETH9 | [0xd1647800688ccb78c1f378329110fd10791b8af9](https://sepolia.etherscan.io/address/0xd1647800688ccb78c1f378329110fd10791b8af9) |
| DemoFaucet | [0xcba03ecf90db02aae02fa02dbba6e55b6431b9db](https://sepolia.etherscan.io/address/0xcba03ecf90db02aae02fa02dbba6e55b6431b9db) |
| USDC / DAI / WBTC | [0xf20503…5566](https://sepolia.etherscan.io/address/0xf205032b263672b814d26c81fa6b1c2697855566) / [0xfa30fb…7a97](https://sepolia.etherscan.io/address/0xfa30fbba942e92afe1bcfaed35698f360d9f7a97) / [0x1ea6c4…23df](https://sepolia.etherscan.io/address/0x1ea6c4954ab3632dfccdc676db96a3ec1c6023df) |

- 预置交易对：WETH/USDC、WETH/DAI（Pair 地址由 library
  运行时推导，不提交写死）。
- 体验：打开 <https://defi-app-three.vercel.app/>，MetaMask
  切 Sepolia 即可兑换、加/撤流动性、看持仓；测试币走应用内
  faucet，演示账户见 demo-guide。
- 地址源：`frontend/src/lib/contracts/addresses.ts`
  （`DEPLOYMENTS`，anvil 31337 + Sepolia 11155111），由
  Foundry `broadcast/` 经 `npm run sync-deploy` 生成并提交。

## 快速开始

全新 clone 后：在 `contracts/` 执行 `forge install`（外加
`forge install openzeppelin-contracts` —— 已在 `lib/` +
remappings，但不在 `.gitmodules`），在 `frontend/` 执行
`npm install`。

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
环境变量模板见 `contracts/.env.example`（`SEPOLIA_RPC_URL`
仅服务端读取，绝不加 `NEXT_PUBLIC_`）。

## Scope / Non-goals

- 无闪电兑换（`swap` 无 `bytes data` 回调参数）。
- 无多跳路由：所有 swap 路径限定直接对
  （`path.length == 2`，否则 `DirectPairOnly`）。
- `Router02` 为子集实现（含 `removeLiquidityWithPermit`），
  未搬运 fee-on-transfer 兼容变体。
- 公共 Demo 仅测试网 + faucet 资产，不涉及真实资金。

## 文档 Docs

- AMM 机制（swap 生命周期、fee-adjusted invariant、LP 会计、
  CREATE2，英文）：[docs/amm-mechanics.md](docs/amm-mechanics.md)
- TWAP 预言机（UQ112x112 累加器与 Δcumulative/Δt，英文）：
  [docs/twap.md](docs/twap.md)
- 协议费（`_mintFee` 的 `√k` 公式与 1/6 拆分，英文）：
  [docs/protocol-fee.md](docs/protocol-fee.md)
- 本地可运行指南：[specs/001 quickstart](specs/001-uniswap-v2-resume/quickstart.md)
- Sepolia 部署指南：[specs/002 quickstart](specs/002-sepolia-vercel-deploy/quickstart.md)
- 演示叙事与账户：[specs/002 demo-guide](specs/002-sepolia-vercel-deploy/demo-guide.md)
- Faucet / 前端 API 契约：[specs/002 contracts](specs/002-sepolia-vercel-deploy/contracts/)
- 研究与数据模型：[specs/002 research](specs/002-sepolia-vercel-deploy/research.md) ·
  [data-model](specs/002-sepolia-vercel-deploy/data-model.md)

## 许可证

MIT License. Copyright (c) 2026 Ray Tian.
