# draft: init-deep-agents-hierarchy

# /init-deep — AGENTS.md hierarchy generation (UPDATE mode)

- **slug:** init-deep-agents-hierarchy
- **command:** `/init-deep`
- **intent:** CLEAR — user invoked the defined /init-deep workflow and asked to prepare; no genuine owner-decision forks
- **review_required:** false (no high-accuracy modifier)
- **status:** awaiting-approval
- **mode:** UPDATE (no `--create-new` passed; existing files read first, modify/refresh; create new only where warranted)
- **max-depth:** default (3)

## Working contract reminder

Prometheus is a PLANNER. This draft captures discovery + location decisions + exact
write/edit instructions. The actual file writes (Edit/Write of AGENTS.md) happen in a
SEPARATE worker session the user starts (e.g. `/start-work`) after switching to
execution mode. Prometheus does NOT write AGENTS.md product files.

## Discovery ledgers

### Existing AGENTS.md files (read in this session)
| path | lines | generated | verdict |
|------|-------|-----------|---------|
| `./AGENTS.md` | 57 | 2026-07-26 | accurate; UPDATE (minor refresh) |
| `./contracts/AGENTS.md` | 45 | 2026-07-26 | accurate; UPDATE (minor refresh) |
| `./frontend/AGENTS.md` | 54 | 2026-07-26 | accurate; UPDATE (minor refresh) |

### Project scale
- Total product files (contracts/ + frontend/, excl lib/node_modules/dist/cache/out): ~20
- Total product LOC: ~189 (all placeholder; no real product logic yet)
- Codegraph: indexed (~17 source files, mostly scaffold + .specify python tooling)
- LSP: typescript installed (frontend); no Solidity LSP; rust installed (unused). Active clients: 0.
- Monorepo: two independent packages, no root workspace

### Key deviations captured by the existing knowledge base (already documented)
- CI misplaced: `contracts/.github/workflows/test.yml` won't run (needs root `.github/workflows/`)
- OpenZeppelin in `contracts/lib/` but NOT in `contracts/.gitmodules`
- Spec duplication w/ divergence: `specs/001-uniswap-v2-resume/` (8 entries, authoritative) vs
  `.omo/specs/001-uniswap-v2-resume/` (5 entries; missing `spec.md`, `tasks.md`, `checklists/`)
- No frontend test framework (Vitest not installed)
- No Web3 library in frontend (ethers/wagmi/viem not installed)

## Location decision (AGENTS_LOCATIONS)

| path | action | score | reason |
|------|--------|-------|--------|
| `.` | UPDATE (exists) | root-always | project knowledge base; accurate |
| `contracts/` | UPDATE (exists) | ~16 | distinct Foundry/Solidity domain; own config |
| `frontend/` | UPDATE (exists) | ~16 | distinct React/Vite domain; own configs |
| `specs/001-uniswap-v2-resume/` | CREATE (new) | ~9 | distinct spec domain + spec/mirror divergence gotcha |
| `.specify/` | SKIP | <8 | vendored speckit framework tooling |
| `.opencode/` | SKIP | <8 | opencode command config (tooling) |
| `.omo/` | SKIP | <8 | agent artifact store (scratch/sessions) |
| `contracts/src/`, `contracts/src/interfaces/`, `contracts/src/libraries/` | SKIP | <8 | empty scaffold dirs; parent AGENTS.md documents them |
| `frontend/src/hooks/`, `frontend/src/`, `frontend/public/` | SKIP | <8 | empty scaffold; parent AGENTS.md documents them |

Net: 1 NEW file + 3 existing files verified/refreshed. No CODE MAP section added to any
file — the project is <10 real files and almost all indexed symbols are placeholder
tooling; a CODE MAP would be noise at this scaffold stage. Revisit once real contracts/hooks land.

## Precise write/edit instructions (for execution worker)

### 1) `./AGENTS.md` — UPDATE via Edit (file exists)
Existing content is accurate. Minor refresh only:
- OPTIONAL: bump/match the `**Generated:**` date if execution runs on a new day (else keep).
- OPTIONAL: add one row to WHERE TO LOOK: "Spec source of truth | specs/001-uniswap-v2-resume/ | NOT .omo/specs/ (mirror, diverges)".
- DO NOT add a CODE MAP section yet (placeholder-only symbols = noise).
- Keep within 50-150 lines; telegraphic.

### 2) `./contracts/AGENTS.md` — UPDATE via Edit (file exists)
Content accurate. Verifier-only pass:
- Re-verify the "CI misplaced" and "OpenZeppelin not in .gitmodules" notes still true (edit IF fixed since).
- No substantive changes expected.
- Keep within 50-150 lines.

### 3) `./frontend/AGENTS.md` — UPDATE via Edit (file exists)
Content accurate. Verifier-only pass:
- Re-verify "No test framework", "No Web3 library", "Migration to Next.js planned" still true (update IF added since).
- No substantive changes expected.
- Keep within 50-150 lines.

### 4) `./specs/001-uniswap-v2-resume/AGENTS.md` — CREATE via Write (new file)
~30-40 lines. Sections: OVERVIEW (1 line), STRUCTURE, WHERE TO LOOK, NOTES (gotchas).
Content to write (adapt; do NOT repeat parent's WHERE TO LOOK):
```
# FEATURE SPEC — 001-uniswap-v2-resume

**Generated:** {YYYY-MM-DD}

## OVERVIEW
Authoritative spec + plan + tasks for the Uniswap V2 resume feature. Markdown docs (NOT code).

## STRUCTURE
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

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| What to build | spec.md | swap, liquidity, portfolio |
| How to build | plan.md | architecture, structure decisions |
| Task list | tasks.md | dependency-ordered work |
| Contract interfaces | contracts/smart-contract-interfaces.md | IUniswapV2* |
| Frontend module API | contracts/frontend-module-api.md | hook/component contracts |
| Project principles | ../../.specify/memory/constitution.md | 5 principles v1.0.0 |

## NOTES
- AUTHORITATIVE: this `specs/` copy is the source of truth. `.omo/specs/001-uniswap-v2-resume/`
  is a PARTIAL mirror (missing spec.md, tasks.md, checklists/) and PLAN.MD DIVergES —
  always edit here, never `.omo/specs/`.
- plan.md specifies Solidity ^0.8.19 (constitution); current Counter.sol uses ^0.8.13 —
  bump when real contracts land.
- plan.md specifies Next.js 15 App Router migration; current frontend is still Vite.
```

## Anti-pattern guards (must hold)
- NO Write over an existing AGENTS.md. Root, contracts/, frontend/ → Edit. specs/... → Write (new).
- Child files never repeat parent's WHERE TO LOOK / CONVENTIONS verbatim.
- No generic "use good variable names" advice. Remove anything that applies to ALL projects.
- Telegraphic style. 30-80 lines for subdir files; 50-150 for root.

## Self-check before handoff
- [ ] Root within 50-150 lines, no CODE MAP (placeholder-only stage).
- [ ] contracts/AGENTS.md within 50-150 lines, no new false claims.
- [ ] frontend/AGENTS.md within 50-150 lines, no new false claims.
- [ ] specs/001-uniswap-v2-resume/AGENTS.md 30-40 lines, divergence gotcha captured.
- [ ] No file repeats parent content.
- [ ] No CODE MAP added until >=10 real (non-placeholder) symbols exist.

## Next workflow action
Wait for user to switch to execution mode and start the worker (e.g. `/start-work`).
On `review_required becoming true` later, run dual high-accuracy review (native momus + oracle).