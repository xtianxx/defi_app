# Feature Specification: Uniswap V2 Resume Project

**Feature Branch**: `001-uniswap-v2-resume`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "Build a Uniswap V2 clone as resume project with swap, liquidity management, and portfolio view"

## Clarifications

### Session 2026-07-26

- Q: Which Ethereum network(s) should the app target for demonstration? → A: Local anvil for development + Sepolia testnet for final deployment
- Q: Which tokens should be available for swap/liquidity by default? → A: Hardcoded demo tokens (WETH, USDC, DAI, WBTC)
- Q: How should token prices be displayed to users in the UI? → A: On-chain TWAP only
- Q: Which features should be explicitly OUT of scope for this resume project? → A: No flash swaps + No multi-hop routing
- Q: How detailed should error messages be when transactions fail? → A: Detailed error codes + human-readable messages

## Deployment Target

- **Development**: Local anvil instance for rapid iteration, zero gas costs, and full test control
- **Production Demo**: Sepolia testnet for public demonstration with real wallet UX
- **Contract Deployment**: Forge scripts targeting both anvil (local) and Sepolia (testnet)
- **RPC Configuration**: Anvil default (http://127.0.0.1:8545) for dev; Sepolia public RPC or user-configured provider for testnet

## Token Configuration

- **Token List**: Hardcoded set of demo tokens for development and demo consistency
- **Core Tokens**: WETH, USDC, DAI, WBTC
- **Pair Initialization**: Token pairs created during deployment script (anvil) or manual setup (Sepolia)
- **Decimals**: Standard ERC-20 decimals (WETH=18, USDC=6, DAI=18, WBTC=8)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Token Swap Execution (Priority: P1)

As a potential employer reviewing this resume project, I want to swap tokens on a decentralized exchange interface so that I can verify the implementation correctly handles token exchanges and follows standard DeFi mechanics.

**Why this priority**: Token swapping is the core functionality of decentralized exchanges and demonstrates fundamental DeFi mechanics. This is the most critical feature to showcase technical competency.

**Independent Test**: Can be fully tested by connecting a wallet, selecting token pairs, entering swap amounts, and executing a swap transaction. Delivers immediate value by demonstrating core DEX functionality.

**Acceptance Scenarios**:

1. **Given** user has connected a wallet with sufficient token balances, **When** user selects token pair and enters valid swap amount, **Then** system displays estimated output amount and fee before confirmation
2. **Given** user has approved token spending, **When** user confirms swap transaction, **Then** system executes swap and updates token balances correctly
3. **Given** user has insufficient token balance, **When** user attempts to swap, **Then** system displays clear error message and prevents transaction
4. **Given** network congestion or transaction failure, **When** swap transaction fails, **Then** system displays appropriate error and allows retry

---

### User Story 2 - Liquidity Provision (Priority: P2)

As a reviewer, I want to add liquidity to token pairs so that I can evaluate the implementation of liquidity pool mechanics and liquidity token accounting.

**Why this priority**: Liquidity provision is essential to understanding automated market maker mechanics and demonstrates knowledge of DeFi liquidity dynamics.

**Independent Test**: Can be tested by providing liquidity to a token pair and verifying liquidity token minting. Delivers value by showing understanding of liquidity pool economics.

**Acceptance Scenarios**:

1. **Given** user has selected a token pair and entered deposit amounts, **When** user provides liquidity, **Then** system mints correct liquidity tokens based on proportional deposit
2. **Given** user has existing liquidity positions, **When** user views liquidity page, **Then** system displays all active positions with current values and share percentages
3. **Given** user attempts to provide asymmetric liquidity, **When** deposit amounts are not proportional, **Then** system automatically adjusts to optimal ratio or displays clear guidance
4. **Given** token pair has no existing liquidity, **When** user provides initial liquidity, **Then** system initializes pool with correct initial price ratio

---

### User Story 3 - Liquidity Removal (Priority: P3)

As a reviewer, I want to remove liquidity from positions so that I can verify the implementation correctly handles liquidity token burning and asset recovery.

**Why this priority**: Liquidity removal completes the liquidity lifecycle and demonstrates understanding of exit mechanics.

**Independent Test**: Can be tested by removing liquidity from an existing position and verifying token returns. Delivers value by showing complete liquidity management flow.

**Acceptance Scenarios**:

1. **Given** user has existing liquidity position, **When** user selects percentage to remove, **Then** system displays estimated token returns before confirmation
2. **Given** user confirms liquidity removal, **When** transaction executes, **Then** system burns liquidity tokens and returns proportional share of pool assets
3. **Given** user wants to remove 100% of liquidity, **When** user confirms removal, **Then** system completely closes position and returns all underlying tokens

---

### User Story 4 - Portfolio & Analytics View (Priority: P4)

As a reviewer, I want to view my liquidity positions and portfolio summary so that I can assess the implementation's ability to aggregate and display DeFi portfolio data.

**Why this priority**: Portfolio view demonstrates data aggregation capabilities and provides comprehensive overview of user's DeFi activities.

**Independent Test**: Can be tested by viewing portfolio page after performing swap and liquidity operations. Delivers value by showing data visualization and aggregation skills.

**Acceptance Scenarios**:

1. **Given** user has performed various DeFi operations, **When** user views portfolio page, **Then** system displays aggregated liquidity positions with current values
2. **Given** user has liquidity positions, **When** user views position details, **Then** system shows share percentage, deposited amounts, and estimated fees earned
3. **Given** user has swap history, **When** user views analytics, **Then** system displays transaction history with amounts and timestamps

---

### Edge Cases

- What happens when user attempts to swap tokens with zero liquidity in pool?
- How does system handle extremely small swap amounts that may not meet minimum output requirements?
- What happens when user tries to provide liquidity with one token having zero balance?
- How does system handle network switching or wallet disconnection during active transaction?
- What happens when token pair has extreme price imbalance?
- How does system handle transaction failures due to gas price changes?
- How are transaction errors surfaced to users? → Detailed error codes with human-readable messages for all failure modes
- How does the system differentiate between user rejection, network failure, and contract revert errors?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support token swapping between any two tokens with displayed price impact and fees
- **FR-002**: System MUST calculate swap amounts using automated market maker formula with appropriate fee structure
- **FR-003**: System MUST allow users to provide liquidity to token pairs and receive proportional liquidity tokens
- **FR-004**: System MUST allow users to remove liquidity by burning liquidity tokens and receiving proportional pool assets
- **FR-005**: System MUST display estimated swap output and fees before transaction confirmation
- **FR-006**: System MUST show user's liquidity positions with share percentages and current values
- **FR-007**: System MUST support wallet connection and transaction signing via popular Web3 wallets
- **FR-008**: System MUST handle transaction failures gracefully with clear error messages
- **FR-009**: System MUST display real-time token prices and pool statistics
- **FR-010**: System MUST provide responsive design for both desktop and mobile interfaces
- **FR-011**: The following features are explicitly OUT OF SCOPE: flash swaps, multi-hop routing; swaps are direct pair swaps only

### Key Entities

- **Token Pair**: Represents two tokens that can be swapped or used for liquidity provision, with associated pool reserves and price relationship
- **Liquidity Pool**: System holding reserves of token pair, implementing automated market maker formula and fee distribution
- **Liquidity Token**: Token representing share of liquidity pool, minted on deposit and burned on withdrawal
- **Swap Transaction**: Exchange of one token for another through liquidity pool, with fee deduction and price impact calculation
- **Liquidity Position**: User's stake in liquidity pool, including deposited amounts, share percentage, and accrued fees

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete token swap in under 2 minutes from wallet connection to transaction confirmation
- **SC-002**: System accurately calculates swap amounts with minimal deviation from theoretical values
- **SC-003**: 95% of liquidity provision transactions complete successfully without errors
- **SC-004**: Portfolio view loads within 3 seconds and displays all user positions accurately
- **SC-005**: System handles 100 concurrent users without performance degradation
- **SC-006**: All core operations pass security review with no high/critical findings
- **SC-007**: Code achieves high test coverage with comprehensive test suite
- **SC-008**: Application works correctly on mainstream web browsers and mobile devices

## Assumptions

- Users have MetaMask or similar Web3 wallet installed and configured
- Target network has sufficient liquidity in token pairs for meaningful swaps
- Users understand basic DeFi concepts (swapping, liquidity provision)
- Project will use local anvil for development and Sepolia testnet for final demonstration to avoid real financial risk
- Existing decentralized exchange contract deployments will be used where possible for compatibility
- Frontend will be responsive and work on both desktop and mobile devices
- All transactions will be simulated (anvil) or performed on testnet (Sepolia) for resume demonstration
- Sepolia demo will use public RPC or user-configured provider; RPC reliability may vary
