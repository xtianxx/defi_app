<!--
Sync Impact Report
==================

Version Change: 1.0.0 → 1.1.0 (MINOR - Frontend framework change)

Modified Principles:
- None (no principle changes)

Modified Sections:
- Technical Standards → Frontend Requirements (Vite → Next.js 15 App Router; React 18+ → React 19)
  - Rationale: explicit user instruction (`/speckit.plan` arg: "前端部分使用next.js/react")
  - Trade-offs: adds SSR/Route Handlers for SC-004 < 3s portfolio load; the existing Vite
    scaffold contained only the default template (no product code), so the migration
    cost is a scaffold replacement, not a rewrite.
  - Veto gate (Principle I, security) is unaffected — all other gates PASS.
- Quality Gates → added `tsc --noEmit` and `next build` to pre-commit chain
- Version Policy footer bumped to 1.1.0; Last Amended 2026-07-27

Templates Requiring Updates:
- ✅ .specify/templates/plan-template.md - Constitution Check section still aligns
- ✅ .specify/templates/spec-template.md - No change required
- ✅ .specify/templates/tasks-template.md - Frontend setup tasks now reference Next.js 15
  (T004: next@15, react@19, ethers@6, tailwindcss, @radix-ui/*, lucide-react,
  @tanstack/react-query; T005–T006: Vitest + Playwright + scaffolded src/app/ tree)

Follow-up TODOs:
- Plan.md already records this amendment with full justification in its
  "Constitution Amendment (Vite → Next.js)" section.

Notes:
- MINOR bump per Version Policy: framework change, no breaking core-principle change.
- Smart contract standards unchanged: Solidity ^0.8.19, Foundry, ≥95% coverage, slither/mythril.
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

- React 19 with TypeScript
- **Next.js 15 (App Router) for build tooling and routing** *(amended 2026-07-27, see Sync Impact Report above — supersedes the original "Vite" requirement per plan.md)*
- ethers.js v6 for Web3 integration
- Responsive design with mobile-first approach
- Error handling for network switching and transaction failures
- Wallet-interacting components MUST use the `'use client'` directive
- Read-only RPC calls SHOULD run in Server Components / Route Handlers via a `JsonRpcProvider` for performance (SC-004: portfolio < 3s)

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
- `forge coverage` - ≥ 95% line coverage (Constitution III)
- `forge snapshot --check` - Gas baseline regression
- `tsc --noEmit` - TypeScript strict mode (noUnusedLocals, noUnusedParameters, erasableSyntaxOnly, verbatimModuleSyntax)
- `npm run lint` - ESLint 10 flat config (js + tseslint + react-hooks + react-refresh)
- `next build` - Next.js production build (catches route-level errors)

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

**Version**: 1.1.0 | **Ratified**: 2026-07-23 | **Last Amended**: 2026-07-27
