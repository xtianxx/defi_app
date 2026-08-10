# Uniswap V2 风格去中心化交易所 — 简历项目

中文 | [English](README.en.md)

![CI](https://github.com/xtianxx/defi_app/actions/workflows/test.yml/badge.svg)

一个 Uniswap V2 风格的去中心化交易所（DEX），作为**简历/作品集项目**开发：链上
AMM 采用恒定乘积定价（`x·y=k`）、0.3% 交易手续费、TWAP 价格预言机，并配有通过
MetaMask 连接合约的完整 Web dApp。

本仓库是包含两个独立包的 monorepo：

- **`contracts/`** — Foundry 项目，重新实现了 Uniswap V2 核心（`Factory`、`Pair`、
  LP `ERC20`）和简化版外围（`Router02`、`WETH9`、`UniswapV2Library`、
  `TransferHelper`），不含闪电兑换和多跳路由（FR-011）。
- **`frontend/`** — Next.js 15（App Router）dApp：兑换、添加/移除流动性，以及基于
  链上 TWAP 价格的持仓视图。ethers v6、React 19、Tailwind + shadcn/ui、Vitest +
  Playwright。

开发循环部署在本地 `anvil`（chainId 31337，确定性），全程不涉及真实资金；公共演示
环境部署在 Sepolia 测试网并由 Vercel 托管（见下文"Sepolia 测试网 / Vercel 部署"）。

## 架构

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ contracts/  (Foundry, Solidity ^0.8.19, viaIR + optimizer 200 runs)      │
│                                                                          │
│   src/core/     Factory · Pair · ERC20 (LP) · Math · SafeMath · UQ112x112│
│   src/router/   Router02 · WETH9 · UniswapV2Library · TransferHelper     │
│   script/       DeployDemo.s.sol (Factory + Router + WETH9 + 4 tokens,   │
│                 2 seeded pairs)                                          │
│                                                                          │
│   forge build ──► out/ (ABIs + build artifacts)                          │
│   forge script --broadcast ──► broadcast/<chainId>/run-latest.json       │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │                               │
                │ out/ ABIs                     │ broadcast/ addresses
                ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ frontend/scripts/sync-deploy.ts   (node scripts/sync-deploy.ts <json> <id>)│
│   regenerates src/lib/contracts/{addresses,abis,tokens}.ts                │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ frontend/  (Next.js 15 App Router)                                       │
│   src/lib/contracts/addresses.ts   per-chain DEPLOYMENTS (anvil)         │
│   src/lib/contracts/abis.ts        ABI bindings for the dApp             │
│   src/app/  /swap · /liquidity · /portfolio · /debug                     │
└──────────────────────────────────────────────────────────────────────────┘
```

两个包仅通过生成产物耦合：`contracts/out/` 导出的 ABI，以及 `broadcast/` 运行文件
中的各链部署地址。没有根级 workspace 工具——两个包相互独立（完整结构见
`AGENTS.md`）。

## 环境要求

- **Foundry**（forge、cast、anvil）：
  `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **Node.js ≥ 20** 及包管理器（npm/pnpm/bun）
- **MetaMask**（或任意 EIP-1193 钱包）用于浏览器流程

## 快速开始 — 本地 anvil（主要开发循环）

完整的可运行指南见 [specs/001-uniswap-v2-resume/quickstart.md](specs/001-uniswap-v2-resume/quickstart.md)；
标准开发循环如下：

```bash
# A.1 — 启动本地链（保持此终端开启）
anvil --chain-id 31337 --port 8545

# A.2 — 部署演示环境（Factory、Router02、WETH9、4 个代币、2 个预置交易对）
cd contracts
forge install                                   # 若 contracts/lib 为空
forge build
forge script script/DeployDemo.s.sol:DeployDemo \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  -vvv

# A.3 — 将部署地址 + ABI 同步到前端
cd ../frontend
node scripts/sync-deploy.ts ../contracts/broadcast/31337/run-latest.json 31337

# A.4 — 启动前端
npm install
npm run dev                                     # http://localhost:3000

# A.5 — 浏览器验证（手动，SC-001）
#   将 MetaMask 连接到 anvil（chainId 31337，RPC http://127.0.0.1:8545），
#   在 /swap 用 WETH 兑换 USDC，approve 并确认；检查 USDC/DAI 空池边界
#   情况；在 /liquidity 添加流动性；在 /portfolio 验证持仓与手续费（SC-004，< 3 秒）。

# A.6 — 自动化验证（与 CI 一致）
cd ../contracts
forge fmt --check
forge build --sizes
forge test -vvv
forge test --coverage
forge snapshot
cd ../frontend
npm run lint
npm run test
npm run test:e2e
```

### 一条命令快速启动（部署脚本）

除手动步骤外，也可以直接用部署脚本一条命令启动完整本地环境：

```bash
# 启动全新 anvil → 部署演示 → 同步地址 → 验证可兑换
# （保持 anvil 运行，前端才能连接）
./scripts/dev-deploy.sh

# 同上，另自动启动前端 dev server（Ctrl+C 全部停止）
./scripts/dev-deploy.sh --dev
```

`dev-deploy.sh` 是快速部署脚本：重启干净的 anvil（chainId 31337，端口 8545）、
部署演示环境（Factory、Router02、WETH9、4 个代币、2 个预置交易对）、通过
`sync-deploy.ts` 重新生成前端绑定，并验证部署账户可以完成兑换。结束后运行
`cd frontend && npm run dev`（除非使用了 `--dev`），打开 http://localhost:3000。

`./scripts/test-e2e.sh --dev` 和 `./scripts/test-e2e-phase5.sh --dev` 是相同的
anvil + 部署 + 同步 + dev-server 流程的替代快速入口（不跑测试）。

## 部署目标

- **本地开发/测试** — anvil（chainId 31337，确定性开发循环），见上方"快速开始"。
- **公共演示** — Sepolia 测试网（chainId 11155111）+ Vercel 托管，见下方。

## Sepolia 测试网 / Vercel 部署（公共演示）

公共演示环境（feature 002）：合约部署在 **Sepolia 测试网**（chainId 11155111）并
在 Etherscan 上验证，前端由 **Vercel** 公开托管（FR-010/FR-013）。面试演示脚本、
演示账户与已部署地址见 [specs/002-sepolia-vercel-deploy/demo-guide.md](specs/002-sepolia-vercel-deploy/demo-guide.md)；
完整验证场景（VS-1..VS-5：公开访问、演示账户、应用内 faucet、本地回归、可复现性）
见 [specs/002-sepolia-vercel-deploy/quickstart.md](specs/002-sepolia-vercel-deploy/quickstart.md)。

按以下 6 步可在 **≤ 30 分钟**内完整复现整个部署（FR-010/SC-005）：

| # | 步骤 | 时间预算 |
|---|---|---|
| 1 | 生成 3 个全新演示账户密钥（master / LP provider / swapper）：`cast wallet new`，记录地址（绝不复用 anvil 公开密钥 — plan D5） | ~3 min |
| 2 | 通过公共 Sepolia faucet 给 master 注资（0.25–0.5 ETH；faucet 阶梯见 research.md R0.1） | ~5 min |
| 3 | 一键部署 + 播种 + 验证：`forge script script/DeployDemoSepolia.s.sol --broadcast --verify --slow`（先导出 `SEPOLIA_RPC_URL` / `ETHERSCAN_API_KEY`） | ~10 min |
| 4 | 重新生成前端绑定并提交：`node frontend/scripts/sync-deploy.ts`（无参数、多链）→ `git add` + commit | ~2 min |
| 5 | Vercel 导入仓库：Root Directory = `frontend/`，环境变量 `SEPOLIA_RPC_URL`（Production + Preview） | ~5 min |
| 6 | 演示账户补款（FR-005 主路径）：`./scripts/sepolia-deploy.sh fund-demo-accounts` | ~5 min |

合计约 30 分钟。

```bash
# 1. 生成演示账户密钥（× 3）
cast wallet new

# 2. 用公共 Sepolia faucet 给 master 注资（阶梯见 research.md R0.1）

# 3. 一键部署 + 播种 + Etherscan 验证（在 contracts/ 下；--verify 自动解码构造参数 — R0.3）
export SEPOLIA_RPC_URL=... ETHERSCAN_API_KEY=...
forge script script/DeployDemoSepolia.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast \
  --verify --etherscan-api-key "$ETHERSCAN_API_KEY" --slow -vvv

# 4. 重新生成前端绑定（无参数、多链）并提交
node frontend/scripts/sync-deploy.ts
git add frontend/src/lib/contracts/addresses.ts frontend/src/lib/contracts/tokens.ts && git commit

# 5. Vercel：导入仓库 → Root Directory: frontend/ → env SEPOLIA_RPC_URL (Production + Preview) → Deploy

# 6. 演示账户补款（主路径，FR-005）
./scripts/sepolia-deploy.sh fund-demo-accounts
```

部署完成后：步骤 3 的所有合约地址均可在 `sepolia.etherscan.io` 上查看已验证源码
（SC-002）；全新浏览器打开 Vercel URL，连接 MetaMask（已添加 Sepolia 网络）即可
加载真实链上余额与价格。

`./scripts/sepolia-deploy.sh`（无子命令）可一条命令完成部署全程：preflight 检查
（`contracts/.env`、工具链、master 余额）→ `forge build` → 对线上 Sepolia 的
dry-run 模拟（不广播）→ `--broadcast --verify --slow` → `sync-deploy.ts` 同步 →
打印部署地址与验证状态汇总。

### 环境变量（仅服务端，绝不加 `NEXT_PUBLIC_` 前缀）

| 变量 | 用途 | 说明 |
|---|---|---|
| `SEPOLIA_RPC_URL` | Sepolia RPC 端点（Alchemy/Infura 免费档） | 部署时供 forge 使用；前端 `/api/reserves` 服务端读取（`createServerProvider()`）—— **仅服务端使用，绝不能加 `NEXT_PUBLIC_` 前缀**；Vercel 上需在 Production + Preview 中配置 |
| `ETHERSCAN_API_KEY` | 免费 Etherscan API key | 供 `--verify` 验证合约源码（R0.3） |
| `SEPOLIA_DEPLOYER_KEY` | master 部署账户私钥 | 部署者 + 打款源；**永不记录在任何文档**（demo-guide.md 只记录演示账户地址） |

全部存放在 **gitignored** 的 `contracts/.env`（模板见 `contracts/.env.example`），
由 `sepolia-deploy.sh` 读取，只经变量引用、绝不内联进命令行或提交记录。前端规则
相同：环境变量仅供服务端 route handlers 读取，客户端不依赖任何环境变量。

## 合约地址

部署地址由 `scripts/sync-deploy.ts` 生成到
`frontend/src/lib/contracts/addresses.ts`，为按链组织的 `DEPLOYMENTS` 记录
（anvil 31337 + Sepolia 11155111），数据来自部署脚本的 Foundry `broadcast/` run-latest JSON。任何
重新部署后请重新运行 `sync-deploy.ts` —— `broadcast/` 已被 gitignore，生成文件
是纳入版本管理的。

部署脚本：`contracts/script/DeployDemo.s.sol`（主演示）、
`contracts/script/core/DeployFactory.s.sol`、`contracts/script/router/DeployRouter.s.sol`。

## 测试

**合约**（在 `contracts/` 下）：

```bash
forge fmt --check        # 格式检查（宪法 IV）
forge build --sizes      # Router02 必须低于 EIP-170 的 24 KB 上限
forge test -vvv          # 全部测试通过
forge test --coverage    # ≥ 95% 行覆盖率（宪法 III）
forge snapshot           # gas 基线；CI 用 --check 对比
```

**前端**（在 `frontend/` 下）：

```bash
npm run lint             # ESLint
npx tsc --noEmit         # TypeScript 严格模式
npm run test             # Vitest 单元 + 组件测试
npm run build            # Next.js 生产构建
npm run test:e2e         # Playwright 针对本地 anvil 链的端到端测试
```

**根级脚本**（标准开发循环）：

| 脚本 | 用途 |
|---|---|
| `./scripts/test-unit.sh` | forge test + vitest（两个包） |
| `./scripts/test-e2e.sh` | 全新 anvil → DeployDemo → 同步 → forge test → vitest → 构建 + Playwright |
| `./scripts/test-e2e-phase5.sh` | US3（移除流动性）循环，带 LP 就绪检查 |
| `./scripts/dev-deploy.sh` | **快速部署**：全新 anvil → 部署 → 同步 → 验证；保持 anvil 运行供前端使用（`--dev` 另启动 `npm run dev`） |

## CI

GitHub Actions（`.github/workflows/test.yml`）在每次 push/PR 时运行：合约
`forge fmt --check` → `forge build --sizes` → `forge test -vvv`（存在产物时另跑
覆盖率和 gas snapshot），前端 `tsc --noEmit` → `npm run lint` → `npm run test` →
`npm run build`。

## 仓库结构

```text
contracts/      Foundry 项目（core + router + DeployDemo 脚本 + 测试）
frontend/       Next.js 15 App Router dApp（页面、hooks、生成的绑定）
scripts/        test-unit.sh · test-e2e.sh · test-e2e-phase5.sh · dev-deploy.sh · sepolia-deploy.sh
specs/          权威功能文档（spec、plan、tasks、quickstart）
.github/        CI 工作流（test.yml）
```

完整结构、约定与注意事项见 `AGENTS.md`。

## 许可证

MIT License. Copyright (c) 2026 Ray Tian.
