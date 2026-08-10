# Feature Specification: Sepolia Testnet & Vercel Deployment for Interview Demo

**Feature Branch**: `002-sepolia-vercel-deploy`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "目前该项目只能在anvil中运行本地测试，所以我打算优化一些测试账户，将该项目后端部署到sepolia测试网上，而前端则是部署的vercal上，并且通过提供一些示例账户和测试币，来方便向面试官展示" (Currently the project only runs local tests on anvil; deploy the backend to the Sepolia testnet and the frontend to Vercel, and provide sample accounts and test tokens so the project can be demonstrated to interviewers)

## Clarifications

### Session 2026-08-10

- Q: 应用内水龙头（Faucet）是否纳入本次范围？→ A: 纳入，采用纯合约方式实现（时间窗口限流，如每钱包每 24 小时一次），不做后端服务
- Q: 面试演示指南（Demo Guide）用什么语言？→ A: 中文为主
- Q: 演示账户的测试 ETH 如何补充？→ A: 混合方案——部署时一次性从公共水龙头充值到主资金账户，补币以主账户 cast 命令转账为主（秒级到账），公共水龙头为兜底
- Q: RPC 节点和合约验证用哪个服务商？→ A: RPC 用 Alchemy/Infura 免费额度（公共 RPC 不可靠，用户实际使用该方案）；合约验证用 Etherscan 免费 API key

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicly Accessible DEX Demo on Sepolia (Priority: P1)

An interviewer opens the demo URL on their own machine. Without any local setup, they can browse the app, connect a wallet, and interact with a live testnet deployment of the DEX — swap, add/remove liquidity, and view portfolio data backed by real on-chain state.

**Why this priority**: The entire point of this feature is that the project is demonstrable anywhere. Nothing is demonstrable until the app runs on a public network reachable from a public URL, so this story is the foundation for all others.

**Independent Test**: Can be fully tested by opening the public URL from a fresh browser on any machine, connecting a Sepolia-capable wallet, and completing one swap and one liquidity add. Delivers "the interviewer can try the product themselves".

**Acceptance Scenarios**:

1. **Given** the public demo URL is open in a fresh browser, **When** the interviewer connects a wallet configured for the Sepolia network, **Then** the app recognizes the network and displays the DEX interface with balances and prices read from the deployed contracts
2. **Given** a connected Sepolia wallet, **When** the interviewer swaps between two listed tokens, **Then** the transaction is mined on Sepolia and the updated balances are reflected in the UI
3. **Given** the app is running against the Sepolia deployment, **When** the interviewer opens each core page (swap, liquidity, portfolio), **Then** every page loads live data without errors
4. **Given** a wallet on the wrong network, **When** the interviewer attempts an action, **Then** the app clearly explains the network requirement and how to switch

---

### User Story 2 - Ready-to-Use Demo Accounts with Test Tokens (Priority: P1)

The interviewer receives a small set of sample accounts (documented credentials) already holding test ETH (for gas) and project test tokens, with liquidity pools pre-seeded. They can start a full demo — including providing liquidity — in seconds without hunting for testnet faucets.

**Why this priority**: A demo fails if the first action errors on "insufficient balance" or runs out of gas. Pre-funded accounts and seeded pools remove the most common demo failure points, so this story is co-critical with the public deployment.

**Independent Test**: Can be fully tested by importing a sample account into a browser wallet and, without any external faucet, completing a swap, an add-liquidity, and a remove-liquidity flow. Delivers "the interviewer can demo value flows immediately".

**Acceptance Scenarios**:

1. **Given** the sample account credentials documented in the demo guide, **When** imported into a browser wallet and connected to Sepolia, **Then** the account shows balances of test ETH and the project's test tokens
2. **Given** a demo account with existing balances, **When** the user swaps, adds liquidity, and removes liquidity, **Then** all transactions succeed (gas covered, approvals in place or guided)
3. **Given** a demo session in which an account's test ETH runs low, **When** the replenishment process from the demo guide is followed, **Then** the account is usable again within 5 minutes
4. **Given** repeated demo sessions, **When** seeded liquidity is consumed or removed, **Then** a documented re-seeding process restores the pools to a demo-ready state

---

### User Story 3 - In-App Test Token Faucet (Priority: P1)

Visitors (including the interviewer's own wallet) can request project test tokens directly from the app, making the demo self-service and resilient to third-party faucet outages.

**Why this priority**: Clarified in-scope for this feature (2026-08-10): implemented as a pure on-chain faucet contract with time-window rate limiting (e.g., one request per wallet per 24h) — no backend service, no server-held private keys. This is a self-service layer on top of the seeded accounts that survives unexpected balance drains.

**Independent Test**: Can be fully tested by connecting any wallet and requesting a token grant from the app; the balance should appear on-chain within one minute. Delivers "any visitor can obtain test tokens without leaving the app".

**Acceptance Scenarios**:

1. **Given** a connected wallet, **When** the user requests tokens from the faucet page, **Then** the tokens arrive on-chain and the UI confirms within one minute
2. **Given** a visitor who has not connected a wallet, **When** they open the faucet page, **Then** the app prompts them to connect a wallet before requesting
3. **Given** a rate limit on token requests, **When** the user requests more tokens than permitted, **Then** the app explains the limit and when they can request again

---

### User Story 4 - Interviewer Demo Guide (Priority: P3)

A concise, non-technical guide (demo script) tells the interviewer what to open, which account to use, what to click, and what result to expect — so a non-developer can run the demo without the candidate's help.

**Why this priority**: This is documentation polish. It maximizes the demo's effectiveness once the deployment and accounts exist, but it delivers no value on its own, so it is lowest priority.

**Independent Test**: Can be fully tested by handing the guide to someone unfamiliar with the project and watching them complete a swap and a liquidity flow unaided. Delivers "the interviewer can self-run the demo".

**Acceptance Scenarios**:

1. **Given** the demo guide, **When** a person unfamiliar with the project follows it step by step, **Then** they complete a swap and a liquidity flow without asking the developer for help
2. **Given** the demo guide, **When** the reader needs account credentials, token addresses, or pool information, **Then** they find them in the guide
3. **Given** the demo guide, **When** a step depends on the live deployment, **Then** the guide states the expected on-screen result so the reader can confirm success

---

### Edge Cases

- What happens when the testnet RPC endpoint is slow or unavailable? The app must keep working with visible loading/error states and a documented fallback endpoint rather than silently failing
- What happens when a demo account runs out of test ETH mid-demo? A documented ≤5-minute replenishment path (faucet + documented process) must exist
- What happens when a visitor connects with a wallet on mainnet or another testnet? The app must show a clear network-mismatch message with switch guidance, never a misleading error
- What happens when someone drains or removes the seeded liquidity? A documented re-seeding process restores demo state
- What happens when an interviewer's wallet already holds the same tokens? Balances, not grants, must be displayed; the app must never assume the connected account is a demo account
- What happens if the demo is run from a device without a wallet installed? The guide must note the wallet requirement and the app should surface a readable connect prompt
- What happens when token approvals are missing during a swap? The flow must guide the user through approval then swap (or use a documented approval pattern) instead of failing opaquely

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The DEX MUST be fully usable on the Sepolia testnet, with all core contracts (factory, router, pairs, WETH, and project tokens) deployed and functioning
- **FR-002**: The frontend MUST be accessible to anyone via a stable public URL
- **FR-003**: The frontend MUST operate against the Sepolia deployment, detecting the connected network and clearly guiding users to switch when the network is wrong
- **FR-004**: At least two demo accounts MUST be provided with documented credentials, each pre-funded with test ETH and a defined set of project test tokens (roles: liquidity provider and swapper)
- **FR-005**: A mechanism MUST exist to replenish test ETH and project test tokens for demo accounts, documented and executable within 5 minutes (primary path: transfer from a master funding account charged once via public Sepolia faucets; fallback: public faucets)
- **FR-006**: Liquidity pools MUST be pre-seeded on Sepolia so the swap, liquidity, and portfolio pages show realistic on-chain data at first load
- **FR-007**: All deployed contracts MUST be verified on Sepolia Etherscan (free API key), with source code and addresses publicly viewable
- **FR-008**: The project MUST provide an in-app faucet to grant project test tokens to any connected wallet, implemented as a pure on-chain faucet contract with time-window rate limiting (e.g., one request per wallet per 24h) and no backend service
- **FR-009**: The existing local development flow (local testnet) MUST keep working unchanged after this feature ships (regression requirement)
- **FR-010**: A developer MUST be able to reproduce the full deployment (contracts and frontend) from the documentation alone in under 30 minutes
- **FR-011**: The app MUST present human-readable errors for the common demo failure modes: wrong network, insufficient balance, failed transaction, and missing approval
- **FR-012**: A demo guide MUST document the sample accounts, token and contract addresses, seeded pools, replenishment process, and a step-by-step demo script with expected results
- **FR-013**: The README/project docs MUST include a deployment guide covering the testnet deployment and the public hosting setup

### Key Entities *(include if feature involves data)*

- **Demo Account**: A testnet EOA with a documented private key and funded balances; assigned a role (liquidity provider, swapper) mirroring the local testnet demo accounts
- **Test Token**: A fungible token deployed on Sepolia representing the project's standard set (WETH, USDC, DAI, WBTC equivalents), used by the swap and liquidity flows
- **Liquidity Pool**: A pair contract on Sepolia holding seeded reserves of two tokens; backs the swap, liquidity, and portfolio pages
- **Contract Deployment**: The set of on-chain addresses (factory, router, tokens, pairs) with verified source code on the public explorer
- **Faucet Grant**: A record of token disbursement to a wallet, enforced on-chain via a time-window rate limit (e.g., one request per wallet per 24h), ensuring fair and repeatable demo use

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can complete a swap within 2 minutes of opening the public URL (network connect + swap + balance update)
- **SC-002**: 100% of the core deployed contracts are verified and publicly viewable on the block explorer
- **SC-003**: A demo account with depleted test ETH can be replenished and used again within 5 minutes following the documented process
- **SC-004**: All core pages (swap, liquidity, portfolio) load live on-chain data without errors on the Sepolia deployment
- **SC-005**: The complete deployment (contracts + frontend) can be reproduced by a developer from documentation in 30 minutes or less
- **SC-006**: The local development workflow remains fully functional: all existing contract and frontend test suites still pass without modification
- **SC-007**: A person unfamiliar with the project can follow the demo guide and complete a swap and a liquidity flow without developer assistance

## Assumptions

- The target testnet is Sepolia; no mainnet deployment is in scope
- The interviewer connects with their own browser wallet (e.g., MetaMask) and can import a provided demo account; exposing testnet-only private keys is an accepted, documented risk
- Project test tokens are deployed on Sepolia mirroring the existing token set (WETH, USDC, DAI, WBTC); the demo does not depend on third-party token faucets
- Test ETH is funded once during setup via public Sepolia faucets into a master funding account; demo-account replenishment uses master-account transfers as the primary path (one `cast` command, seconds to confirm) with public faucets as fallback; the in-app faucet covers project tokens only
- Hosting uses a free/hobby tier with a standard public URL; no custom domain is required
- Sepolia RPC uses an Alchemy/Infura free-tier endpoint (API key recorded in setup docs); public RPCs were found unreliable and are not used
- The demo guide is in Chinese (primary), with account credentials and addresses published inside the guide
