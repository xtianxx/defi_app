# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-26
**Commit:** f3f34ca
**Branch:** 001-uniswap-v2-resume

## OVERVIEW
Monorepo for a Uniswap V2–style DEX resume project. Two independent packages: `contracts/` (Solidity/Foundry) and `frontend/` (React/Vite). Currently a fresh scaffold; real implementation per `specs/001-uniswap-v2-resume/`.

## STRUCTURE
```
.
├── contracts/              # Foundry project — Solidity smart contracts
├── frontend/               # React 19 + TypeScript 6 + Vite 8
├── specs/                  # Feature specs (Uniswap V2 resume project)
├── .specify/               # Speckit planning framework (/speckit.* commands)
├── .opencode/              # OpenCode agent commands
└── .omo/                   # Agent artifacts (spec mirror, run-continuation)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Feature spec | specs/001-uniswap-v2-resume/spec.md | Swap, liquidity, portfolio |
| Implementation plan | specs/001-uniswap-v2-resume/plan.md | Architecture, structure decisions |
| Project constitution | .specify/memory/constitution.md | 5 core principles, v1.0.0 |
| CI workflow | contracts/.github/workflows/test.yml | ⚠️ Misplaced — needs root .github/workflows/ |
| Deployment scripts | contracts/script/ | forge script entry points |
| Agent commands | .opencode/commands/ | 15 speckit subcommands |
| Spec source of truth | specs/001-uniswap-v2-resume/ | NOT .omo/specs/ (mirror, diverges — missing spec.md/tasks.md/checklists/) |

## CONVENTIONS
- **Packages are independent** — no root workspace, no cross-package imports
- **TypeScript 6 strict**: noUnusedLocals, noUnusedParameters, erasableSyntaxOnly, verbatimModuleSyntax
- **ESLint 10 flat config**: js + tseslint + react-hooks + react-refresh
- **Solidity**: ^0.8.13, forge-std v1.16.2, CI: fmt→build→test
- **No Prettier, no editorconfig, no Docker** — none configured yet
- **No frontend test framework** — Vitest not installed
- **No Web3 library in frontend** — ethers/wagmi/viem not installed

## COMMANDS
### Frontend (`frontend/`)
- **Dev**: `npm run dev` | **Build**: `npm run build` (tsc -b && vite build)
- **Lint**: `npm run lint` | **Preview**: `npm run preview`

### Contracts (`contracts/`)
- **Build**: `forge build` | **Test**: `forge test` | **Format**: `forge fmt`
- **Deploy**: `forge script script/Counter.s.sol:CounterScript --rpc-url <rpc> --private-key <key>`
- **CI Order**: `forge fmt --check` → `forge build --sizes` → `forge test -vvv`

## NOTES
- **CI misplaced**: `contracts/.github/workflows/test.yml` won't execute; move to `.github/workflows/test.yml`
- **lib/ gitignored**: Run `forge install` after clone to fetch forge-std
- **OpenZeppelin** exists in contracts/lib/ but NOT in .gitmodules — may need re-install
- **Spec divergence**: `specs/` (8 entries, authoritative) and `.omo/specs/` (5 entries) diverge — `.omo/` missing spec.md, tasks.md, checklists/; plan.md differs between copies. Always edit in `specs/`
- **hooks/, interfaces/, libraries/ are empty scaffolds** — intended for Uniswap V2 implementation
- **Frontend migration planned**: Vite → Next.js 15 per plan.md constitution amendment

