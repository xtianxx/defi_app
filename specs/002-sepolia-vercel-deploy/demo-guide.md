# 面试演示指南 (Demo Guide) — Sepolia

**Feature**: `002-sepolia-vercel-deploy` | **状态**: 草稿（DRAFT — T002）

> 本文档为面试官准备的演示脚本（中文为主）。**尚未最终化**：
> - 密钥/余额待 T018 打款后填入（T019）
> - 完整演示脚本与预期结果待 T031 最终化
> - 最终版结构见 tasks.md T031：演示前准备 → 账户与余额 → 合约与代币地址 + 已建池 → 逐步演示脚本 → 补充流程 → 故障排查

---

## 账户草稿（T002 — 地址已生成，密钥见 `contracts/.env`，gitignored）

> 三个账户均为 `cast wallet new` 生成的全新 Sepolia 测试网密钥（**绝不复用 anvil 的公开已知密钥** — plan D5）。

| 角色 | 地址 | 密钥存放 | 用途 |
|---|---|---|---|
| master（主账户） | `0x4B2B759583297528B0f5616cC43924A772eCd43c` | `contracts/.env` → `SEPOLIA_DEPLOYER_KEY`（**永不记录在任何文档**） | 部署者 + 打款源（faucet 注入后负责给演示账户补 ETH） |
| LP provider（流动性提供者） | `0x55a5818d1F4b21C5D2F4b898Ff986cA29934A984` | `contracts/.env` → `SEPOLIA_LP_PROVIDER_KEY` | 预置 USDC/DAI/WBTC/WETH + 测试 ETH；演示添加/移除流动性（T019 起密钥写入本文档 — 测试网密钥为已接受风险） |
| swapper（交易者） | `0x61e223dA8bafd9f39e749685CB7653Cf1C3b8096` | `contracts/.env` → `SEPOLIA_SWAPPER_KEY` | 预置 USDC/DAI/WBTC/WETH + 测试 ETH；演示交换 |

**余额**：待部署后由 T018 `sepolia-deploy.sh fund-demo-accounts` 填充并记录（FR-004）。
**打款流程**：master `cast send` 主路径（≤5 分钟，SC-003）；公共 faucet 清单为回退（research.md R0.1）。

<!-- T019/T031 将在此续写：已打款余额表、池子重注流程、逐步演示脚本（含每步预期屏幕结果）、故障排查 -->
