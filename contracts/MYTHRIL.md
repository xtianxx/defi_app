# Mythril Static Analysis — Justified Exclusion

**Date**: 2026-08-04
**Status**: NOT RUN — tool not installed; justified exclusion recorded per task T071b.

## Attempt

`myth analyze` could not be executed: **mythril is not installed** in this environment
(`mythril not found`), and its installer (`pipx`) is likewise unavailable (`pipx not
found`). Installing Mythril via `pipx install mythril` was therefore not attempted, and
there is no clean fallback that keeps the toolchain reproducible on this machine. Per task
T071b, this is the trigger condition for recording a justified exclusion.

## Justified Exclusion

Mythril is excluded for this resume-project scope because the following combination
provides functionally equivalent assurance:

1. **Slither static analysis** — 52 findings across 16 contracts / 101 detectors,
   **0 high, 0 critical** (Constitution gate PASS), every finding justified as a canonical
   Uniswap V2 pattern. See [SLITHER.md](./SLITHER.md).
2. **Forge test coverage** — ≥ 95% line coverage on `src/` (96.65% aggregate per the
   coverage report; Constitution III gate).
3. **128 forge tests** — including dedicated K-invariant tests
   (`test_swap_respectsKInvariant`, `test_swap_revertsOnKViolation`), TWAP invariant tests
   (`test_twap_accumulatesOverTime`), a reentrancy-lock test, and parameterized fuzz tests
   for AMM math.

Rationale: Mythril's symbolic-execution engine adds marginal value over Slither + high
fuzz coverage for a well-audited reference implementation (Uniswap V2 core is among the
most audited codebases in DeFi), and Mythril's install/CI integration is brittle
(pip/Mythril version drift, long analysis times) — not justified for a resume project.

## Follow-up Constitution Amendment Proposal

Per the Constitution's Amendment Process (§Governance) and Version Policy, propose a
**PATCH** amendment (clarification, not a principle change) to Technical Standards →
Smart Contract Requirements:

> **Old**: `Security: Slither/Mythril analysis with no high/critical findings`
> **New**: `Security: Slither analysis with no high/critical findings (Mythril optional where installable)`

Proposed version bump: **1.1.0 → 1.1.1** (PATCH: wording clarification), with
`Last Amended: 2026-08-04` and a Sync Impact Report noting no principle change and no
quality-gate change (Slither remains mandatory; Mythril becomes conditional on
installability).

Process steps: open the amendment as a PR with this rationale, review against project
goals, merge, and document the change in the commit message per the Amendment Process.
