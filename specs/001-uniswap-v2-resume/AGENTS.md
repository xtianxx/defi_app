# FEATURE SPEC — 001-uniswap-v2-resume

**Generated:** 2026-07-27

## OVERVIEW
Authoritative spec + plan + tasks for the Uniswap V2 resume feature. Markdown docs — NOT code.

## STRUCTURE
```
specs/001-uniswap-v2-resume/
├── spec.md              # Feature spec — swap, liquidity, portfolio (160 ln)
├── plan.md              # Architecture + decisions (207 ln)
├── tasks.md             # Task breakdown (330 ln)
├── research.md          # Technical research (228 ln)
├── data-model.md        # Data model design (211 ln)
├── quickstart.md        # Quick start guide (156 ln)
├── checklists/
│   └── requirements.md  # Requirements checklist
└── contracts/
    ├── smart-contract-interfaces.md  # Solidity interface specs (~10K)
    └── frontend-module-api.md        # Frontend API specs (~10K)
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| What to build | spec.md | Swap, liquidity, portfolio |
| How to build | plan.md | Architecture, structure decisions |
| Task list | tasks.md | Dependency-ordered |
| Contract interfaces | contracts/smart-contract-interfaces.md | IUniswapV2* |
| Frontend API | contracts/frontend-module-api.md | Hook/component contracts |
| Project principles | ../../.specify/memory/constitution.md | 5 principles v1.0.0 |

## NOTES
- **AUTHORITATIVE**: This `specs/` copy is the source of truth. `.omo/specs/001-uniswap-v2-resume/`
  is a PARTIAL mirror (missing spec.md, tasks.md, checklists/) and `plan.md` DIVERGES —
  always edit here, never `.omo/specs/`.
- **Compiler version**: plan.md specifies Solidity ^0.8.19 (constitution); current Counter.sol
  uses ^0.8.13 — bump when real contracts land.
- **Frontend migration**: plan.md specifies Next.js 15 App Router; current frontend is still Vite.
