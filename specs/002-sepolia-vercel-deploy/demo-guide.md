# 面试演示指南 (Demo Guide) — Sepolia

**Feature**: `002-sepolia-vercel-deploy` | **状态**: 已完成（T019 + T031 最终化，2026-08-10）

> 本文档为面试官准备的演示脚本（中文为主，可直接照着念/点）。余额为 **2026-08-10 T018 执行后的实测值**；所有地址均已部署并在 Etherscan 验证。测试网密钥写入本文档为已接受风险（plan D6 — 余额均为 faucet/mock 代币）。

---

## 1. 演示前准备

**环境**：Chrome + MetaMask 插件（已登录），访问已部署的 Vercel 站点（URL 见部署环境配置）。

1. **添加 Sepolia 网络**（MetaMask → 网络 → 添加网络，若未内置）：
   - 网络名称: `Sepolia` · 链 ID: `11155111` · 货币符号: `ETH`
   - RPC URL: 使用公共钱包 RPC（如 `https://rpc.sepolia.org` 或 Alchemy/Infura 免费端点）— 注意与服务器端专用的 `SEPOLIA_RPC_URL`（`contracts/.env`）不同，此 RPC 仅用于 MetaMask 客户端
   - 区块浏览器: `https://sepolia.etherscan.io`
2. **导入两个演示账户私钥**（MetaMask → 账户 → 导入账户，粘贴 §2 的私钥）：
   - 导入后账户名建议改为 `LP Provider` / `Swapper`，便于演示时辨认
3. **master 补款说明**：master 仅作打款源（密钥永不记录），当前余额 ~0.017 ETH 低于 `fund-demo-accounts` 的 0.05 ETH 门槛；若需重新执行打款/重注脚本，先用公共 Sepolia faucet 给 master 补款（research.md R0.1 阶梯：Chainstack / Google Cloud Web3 faucet 0.05 ETH/24h / ethfaucet）。
4. **部署指南**：完整 Sepolia 部署流程（~30 分钟，合约部署 → 种子池 → 打款 → 前端同步）见 `specs/002-sepolia-vercel-deploy/quickstart.md` §Setup: Full Sepolia Deployment。

---

## 2. 账户与余额

三个账户均为 `cast wallet new` 生成的独立 Sepolia 测试网密钥（**绝不复用 anvil 的公开已知密钥** — plan D5）。余额为 2026-08-10 T018 实测值（含初始部署发放 + T018 追加）。

| 角色 | 地址 | 私钥（仅演示账户） | 用途 |
|---|---|---|---|
| **master**（打款源） | `0x4B2B759583297528B0f5616cC43924A772eCd43c` | **永不记录**（`contracts/.env` → `SEPOLIA_DEPLOYER_KEY`） | 部署者 + 打款源。余额 ~**0.017 ETH**（T018 打款后剩余）— 低于 `fund-demo-accounts` 的 0.05 ETH 门槛；重新执行前需经公共 faucet 补款（research.md R0.1） |
| **LP provider** | `0x55a5818d1F4b21C5D2F4b898Ff986cA29934A984` | `0xb1c3ad1c7a34fc9b4909d9fe904e790cd68e4ee968834e3541f466d238d18e48`（`contracts/.env` → `SEPOLIA_LP_PROVIDER_KEY`） | ETH **0.04** · WETH **0.02** · USDC **40.0** · DAI **40.0** · WBTC **0.4**；演示添加流动性 |
| **swapper** | `0x61e223dA8bafd9f39e749685CB7653Cf1C3b8096` | `0x202a70922f45673f3e3cf3facd76bc382774b5f69ef0f82b555ffad61569b31a`（`contracts/.env` → `SEPOLIA_SWAPPER_KEY`） | ETH **0.04** · WETH **0.02** · USDC **40.0** · DAI **40.0** · WBTC **0.4**；演示交换 |

> 说明：两演示账户余额为**叠加式补款**（初始发放 + T018 追加）；ETH 用于 gas。`fund-demo-accounts` 为 additive top-up，可安全重复执行。

---

## 3. 合约与代币地址 + 已建池

全部合约已在 Etherscan (Sepolia) 验证；两个交易对中 **WETH 均为 token0**。

**核心合约**

| 合约 | 地址 |
|---|---|
| UniswapV2Factory | `0xc32bc046beafd48827f3d55356568476df322dde` |
| UniswapV2Router02 | `0xb3cafdd61bdb7d1c24b8ec683002d1fc92401cd4` |
| WETH9 | `0xd1647800688ccb78c1f378329110fd10791b8af9` |
| DemoFaucet | `0xcba03ecf90db02aae02fa02dbba6e55b6431b9db` |

**Mock 代币（ERC20）**

| 代币 | 地址 | 精度 |
|---|---|---|
| USDC | `0xf205032b263672b814d26c81fa6b1c2697855566` | 6 |
| DAI | `0xfa30fbba942e92afe1bcfaed35698f360d9f7a97` | 18 |
| WBTC | `0x1ea6c4954ab3632dfccdc676db96a3ec1c6023df` | 8 |

**已建池（种子储备）**

| 交易对 | Pair 地址 | 储备 | 隐含价格 |
|---|---|---|---|
| WETH/USDC | `0x182020df7D32fbECCc68E91b3B2613dEAFFdAaC7` | 0.1 WETH + 200 USDC | ≈ 2000 USDC/WETH |
| WETH/DAI | `0x2203FEf7f2D54413d8A7fCA0f1a0043c50123318` | 0.1 WETH + 200 DAI | ≈ 2000 DAI/WETH |

**DemoFaucet 参数**：每次领取 **0.1 WETH + 200 USDC + 200 DAI + 0.01 WBTC**；每钱包 **24h 限领一次**；当前 WETH 储备 **0.2 WETH = 可领 2 次**（`reseed-pools` 会补回 0.2 WETH 目标）。

---

## 4. 逐步演示脚本

> 建议顺序：先用 **swapper** 演示 swap，再用 **LP provider** 演示流动性（两个账户交替可展示多账户能力）；faucet 领取后余额变化最直观。每步标注**预期 UI 反馈**。

### Step 1 — 连接钱包

- **操作**：打开站点首页 → 点击右上角 **Connect** → MetaMask 弹窗 → 选择 **Swapper** 账户（先切到 Sepolia 网络）→ 签名确认连接。
- **预期**：按钮变为已连接状态，显示 swapper 地址缩写（`0x61e2…8096`）与当前网络（Sepolia）；页面可读到各代币余额。

### Step 2 — 选择 Sepolia 网络

- **操作**：MetaMask 中确认当前网络为 **Sepolia**（链 ID `11155111`）；若 dApp 提示网络不匹配，按提示点击切换。
- **预期**：网络徽章/下拉显示 Sepolia；若已内置网络可直接切换，无需重复添加（§1 已添加）。

### Step 3 — /swap：WETH → USDC

- **操作**：进入 **/swap** → 选择 WETH → USDC → 输入 **0.001 WETH** → 查看报价 → 首次需先 **Approve** WETH（MetaMask 签名）→ 点击 **Swap** → MetaMask 确认交易。
- **预期**：
  - 报价显示 ≈ **1.97 USDC**（按 ≈2000 USDC/WETH，扣 0.3% 手续费；金额越大滑点越明显 — 池子小）
  - 确认后出现**成功 toast**（含交易哈希，可点击 Etherscan 查看）
  - 余额变化：WETH −0.001，USDC +~1.97（`/portfolio` 或钱包中可见）

### Step 4 — /liquidity：添加流动性

- **操作**：切换到 **LP provider** 账户（或继续用 swapper）→ 进入 **/liquidity** → 选择 **WETH/USDC** 交易对 → 输入 **0.01 WETH**（USDC 自动按池内比例算 ≈ **20 USDC**）→ 查看预览 → 分别 Approve WETH 与 USDC → 确认添加。
- **预期**：
  - 预览面板显示新增流动性 ≈ 池份额 **~9%**、对应 LP 代币数量与预估价值
  - 确认后**成功 toast**；流动性列表出现 WETH/USDC 仓位（`/portfolio` 可见）

### Step 5 — /portfolio：查看仓位与余额

- **操作**：进入 **/portfolio**，查看当前账户持仓。
- **预期**：显示各代币余额（ETH/WETH/USDC/DAI/WBTC）与流动性仓位列表（LP 份额、占比、可移除按钮）；数据与 Step 3/4 操作后的余额一致。

### Step 6 — /faucet：领取测试代币

- **操作**：进入 **/faucet** → 点击 **领取 (Claim)** → MetaMask 确认。
- **预期**：
  - 成功提示：列出领取明细（0.1 WETH + 200 USDC + 200 DAI + 0.01 WBTC），并可显示**下一次可领取倒计时（24h）**
  - 余额增加：对应代币 +0.1/+200/+200/+0.01（可回 /portfolio 验证）
  - 若已领过：按钮置灰显示倒计时（此时换另一个演示账户演示，见 §6）

### Step 7 — /debug：状态页

- **操作**：进入 **/debug**，查看运行状态。
- **预期**：显示当前链（Sepolia）、连接账户、各合约地址（Factory/Router/WETH9/Faucet）、交易对储备与价格等只读状态；可作面试问答环节的数据支撑。

---

## 5. 补充流程（各 ≤5 分钟）

| 场景 | 命令 | 前置条件 | 说明 |
|---|---|---|---|
| 演示账户补款 | `./scripts/sepolia-deploy.sh fund-demo-accounts` | master ≥ **0.05 ETH** | additive top-up：给两演示账户补 gas ETH + 代币；可安全重复执行 |
| 池子重注 | `./scripts/sepolia-deploy.sh reseed-pools` | master ≥ **~0.5 ETH**（需 wrap WETH） | 恢复 WETH/USDC + WETH/DAI 种子储备（0.1 WETH + 200 代币）；**池子已达标时 no-op**；同时把 faucet WETH 储备补回 **0.2 WETH** |
| faucet WETH 补充 | 同上 `reseed-pools` 的 faucet 部分 | master ≥ ~0.5 ETH | faucet WETH 目标 **0.2 WETH**（= 2 次完整领取），转移式补足，不增发 LP |

> master 余额检查与补款路径：公共 faucet 清单见 `research.md` R0.1（Chainstack one-shot 至 0.5 / Google Cloud Web3 faucet 0.05 ETH/24h / ethfaucet 补充）。

---

## 6. 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| RPC 慢/挂起 | 钱包 RPC 或服务端 RPC 不稳定 | `/api/reserves` 返回 **502** + `Retry-After: 2`（路由级；UI 走钱包 provider，表现为页面空态/加载态，不是 JSON 错误）— 用 `curl "/api/reserves?pair=…&account=…&chainId=11155111"` 区分；RPC 持续故障则换免费端点（quickstart.md EC-1） |
| `/api/reserves` 返回 **500** `"rpc not configured"` | `SEPOLIA_RPC_URL` 缺失（仅 `chainId=11155111` 可达） | 服务器配置问题，与运行时故障 502 刻意区分；在 Vercel 环境变量 + `contracts/.env` 配置后重新部署 |
| 交易失败 | ETH gas 不足 / 未先 Approve | 检查账户 ETH 余额（≥0.04 ETH 演示足够）；swap/添加流动性前先完成 Approve 签名；查看失败 toast 中的错误码（如 `INSUFFICIENT_OUTPUT_AMOUNT` 为滑点过小） |
| faucet 显示倒计时无法领取 | 每钱包 24h 限领 | 换另一个演示账户（LP provider ↔ swapper）领取；或等倒计时结束 |
| 页面提示未连接钱包 | 未连接或网络不匹配 | 各页面均有 Connect 提示：连接 MetaMask 并确认 Sepolia 网络；若钱包在本地 anvil（链 31337）需切换网络 |
| 地址/网络 选择错误 | MetaMask 切到主网或其他链 | 确认网络徽章为 Sepolia（`11155111`）；本演示全部交互仅发生在 Sepolia |

> 更多边界情况（RPC 慢/无钱包设备/已有代币余额）见 `specs/002-sepolia-vercel-deploy/quickstart.md` §Edge Cases **EC-1..EC-3**。
