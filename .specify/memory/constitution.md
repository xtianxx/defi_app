<!--
Sync Impact Report
==================

Version Change: 0.0.0 → 1.0.0 (MAJOR - Initial constitution creation)

Modified Principles:
- None (initial creation)

Added Sections:
- Core Principles (5 principles)
- Technical Standards
- Quality Gates
- Governance

Removed Sections:
- None

Templates Requiring Updates:
- ✅ .specify/templates/plan-template.md - Constitution Check section aligns with new principles
- ✅ .specify/templates/spec-template.md - Requirements structure compatible
- ✅ .specify/templates/tasks-template.md - Task categories align with DeFi development workflow

Follow-up TODOs:
- None

Notes:
- Initial constitution created for Uniswap V2 resume project
- Principles focused on smart contract security, DeFi compliance, and professional standards
- Version set to 1.0.0 as initial release
-->

# Uniswap V2 Resume Project Constitution

## Core Principles

### I. Smart Contract Security First (NON-NEGOTIABLE)

All smart contracts MUST follow established security patterns and undergo rigorous testing before deployment. This includes:

- Reentrancy guards on all external calls that transfer value
- Integer overflow/underflow protection using Solidity 0.8+ built-in checks
- Access control with proper modifier patterns
- Input validation on all public/external functions
- Comprehensive test coverage including edge cases and failure scenarios

**Rationale**: DeFi protocols hold significant value; security vulnerabilities can lead to irreversible financial losses. This principle establishes the foundation for professional-grade smart contract development.

### II. DeFi Protocol Compliance

All implementations MUST adhere to Uniswap V2 protocol specifications and established DeFi standards:

- Correct implementation of constant product formula (x * y = k)
- Proper fee handling (0.3% swap fee distribution)
- LP token accounting and share calculations
- Price oracle implementation following TWAP (Time-Weighted Average Price) patterns
- Gas optimization for core operations

**Rationale**: Protocol correctness ensures compatibility with the broader DeFi ecosystem and demonstrates understanding of fundamental DeFi mechanics.

### III. Test-Driven Development

All features MUST follow TDD workflow:

1. Write failing tests that define expected behavior
2. Implement minimum code to make tests pass
3. Refactor while maintaining test coverage
4. Maintain >95% test coverage for smart contracts

**Rationale**: TDD ensures reliability, documents intent, and prevents regressions in financial-critical code.

### IV. Professional Code Quality

Code MUST meet professional standards suitable for resume demonstration:

- Comprehensive NatSpec documentation on all public functions
- Clear, descriptive naming following Solidity conventions
- Consistent formatting using `forge fmt`
- Modular architecture with separation of concerns
- Gas-efficient implementations with documented optimization decisions

**Rationale**: This project serves as a professional portfolio piece; code quality directly reflects developer competency.

### V. Documentation & Reproducibility

All aspects of the project MUST be fully documented and reproducible:

- Complete setup instructions in README
- Architecture decisions documented with rationale
- Deployment guides for testnet and mainnet
- API documentation for contract interfaces
- Frontend integration examples

**Rationale**: Demonstrates professional development practices and enables interviewers to understand technical decisions.

## Technical Standards

### Smart Contract Requirements

- Solidity version: ^0.8.19
- Framework: Foundry (forge, cast, anvil)
- Testing: Forge test with >95% coverage
- Gas optimization: Documented gas snapshots for key operations
- Security: Slither/Mythril analysis with no high/critical findings

### Frontend Requirements

- React 18+ with TypeScript
- Vite for build tooling
- ethers.js v6 for Web3 integration
- Responsive design with mobile-first approach
- Error handling for network switching and transaction failures

### Development Workflow

- Feature branches with descriptive names
- Pull request reviews before merging
- Conventional commits for version control
- Automated CI/CD pipeline (GitHub Actions)
- Dependency updates via Dependabot/Renovate

## Quality Gates

### Pre-Commit Checks

- `forge fmt` - Code formatting
- `forge build --sizes` - Build verification
- `forge test -vvv` - Test execution
- Gas snapshot comparison
- Linting (solhint for Solidity, ESLint for TypeScript)

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Gas optimization reviewed
- [ ] Security analysis completed
- [ ] NatSpec documentation complete
- [ ] Frontend integration tested
- [ ] Deployment scripts verified on forked network

## Governance

This constitution establishes the foundational principles for the Uniswap V2 resume project. All development decisions MUST align with these principles.

### Amendment Process

1. Propose changes via pull request with rationale
2. Review against project goals (resume demonstration)
3. Update version according to semantic versioning
4. Document changes in commit message

### Version Policy

- **MAJOR**: Breaking changes to core principles or architecture
- **MINOR**: New principles or significant expansions
- **PATCH**: Clarifications, wording improvements

### Compliance Review

- All pull requests must verify compliance with principles
- Security reviews required for smart contract changes
- Gas optimization reviews for core operations
- Documentation updates required for feature additions

**Version**: 1.0.0 | **Ratified**: 2026-07-23 | **Last Amended**: 2026-07-23
