# Proposal: 250-final-program-verification

## Problem

Changes 001–249 have implemented, verified, and reconciled the Minecraft-parity program feature
by feature, but no single program-level pass confirms the whole program is complete and
release-ready. As of change 249 the repository holds 249 per-change `verification.md` records,
a program state file whose `validationResults` schema has evolved over time, a `PARITY_MATRIX.md`
(change 248) categorizing every planned feature, and the whole-codebase adversarial audit report
(change 249) — but nothing yet:

- asserts that **every** planned numbered change 001–250 is `VERIFIED` or intentionally
  `DEFERRED` by an explicit product decision;
- consolidates all verification evidence into a single, reviewable, non-fabricated archive;
- executes the **final parity audit pass** and the final **regression/performance suite run**;
- re-checks **parity-matrix accuracy** against actual implementation and recorded evidence;
- and issues a **release-readiness decision** (`READY` / `NOT READY`) against checkable criteria.

`openspec/AUTONOMOUS_GOAL.md` defines program completion as exactly these conditions. This change
turns each completion condition into a checkable contract, produces the consolidated evidence
archive, executes the final audit/suites, makes the release-readiness decision, marks durable
program state `COMPLETE`, and leaves the final state independently reviewable from `origin/main`.

## Goals

- Produce a **final verification checklist** that covers every planned numbered change 001–250 and
  records each as exactly one of `VERIFIED` or `DEFERRED` (an unclassified change is a failure).
  Every `DEFERRED` change carries an explicit product decision and rationale.
- Assemble a **complete evidence archive** that consolidates all verification evidence (per-change
  records, command/suite results, the audit report, the parity matrix) into one reviewable
  location, with an explicit completeness statement and provenance.
- Run the **final parity audit pass** and re-check **parity-matrix accuracy** (`PARITY_MATRIX.md`
  from change 248), recording any discrepancy and its disposition.
- Run the **final regression and performance suites** (typecheck, lint, unit, build, e2e, and the
  release performance gate from change 247) and record results.
- Make the **release-readiness decision** against deterministic, reviewer-checkable criteria and
  record the verdict (`READY` or `NOT READY`) with rationale.
- Mark durable program state `COMPLETE` and ensure the final state is published to `origin/main`
  and independently reviewable from GitHub.
- Documentation and state only: no production code and no test files are created or modified.

## Non-goals

- Implementing or changing any gameplay/network/worldgen/render behavior.
- Re-running the whole-codebase adversarial audit itself (that is change 249; 250 consumes and
  disposes of its findings).
- Re-categorizing features in `PARITY_MATRIX.md`; 250 checks accuracy and records dispositions
  only, leaving re-categorization to the change that identifies a discrepancy.
- Fabricating, re-running, or inventing verification evidence for prior changes; the archive
  consolidates existing recorded evidence and never synthesizes results.
- Deciding feature scope, roadmap, or product deferral policy; 250 records product decisions, it
  does not create them. If a change lacks an explicit product decision it is `NOT READY`.

## Preconditions

- The immediately preceding change in the sequence (`249-whole-codebase-adversarial-audit`) is
  `VERIFIED` and advancement is allowed, per `CHANGE_SEQUENCE.md` ordering contract.
- Every planned numbered change 001–249 has a `verification.md` and, where applicable, a `VERIFIED`
  status at the entry commit, so the checklist has a non-empty status to record for every change.
- `PARITY_MATRIX.md` (change 248) exists at the repository root and categorizes every planned
  feature.
- The whole-codebase adversarial audit report (change 249) exists and is available for disposition.
- Baseline gate green at the entry commit: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e` (used as the pre-change baseline for the final gate).

## Dependencies

- `openspec/AUTONOMOUS_GOAL.md` — the source of the program-completion conditions this change makes
  testable.
- `openspec/CHANGE_SEQUENCE.md` — the canonical ordered list of planned numbered changes 001–250.
- `openspec/PROGRAM_STATE.json` / `PROGRAM_STATE.md` — the authoritative record of per-change
  status and the target state to mark `COMPLETE`.
- Every change 001–249 `verification.md` — the source of per-change verification evidence that the
  archive consolidates.
- `PARITY_MATRIX.md` (change 248) — the parity-matrix artifact whose accuracy the final audit
  re-checks.
- The whole-codebase adversarial audit report (change 249) — the audit findings the final audit
  pass disposes of.
- The release performance gate evidence (change 247) — the budget results the final performance
  run re-validates.
- No dependency on the contents of concurrent sibling change directories. Change 249's artifact is
  consumed as evidence only after it is itself `VERIFIED`; this package describes its contracts
  precisely and relies on the final reconciliation step.

## Proposed change

Create a consolidated evidence archive and a release-readiness decision, and mark the program
complete. Concretely:

1. `openspec/evidence/` — the single evidence archive:
   - `README.md` — manifest/index and the archive completeness statement;
   - `checklist/final-verification-checklist.md` — the final verification checklist covering
     001–250;
   - `changes/<NNN>.md` — one consolidated evidence record per `VERIFIED` change;
   - `parity/final-parity-audit.md` — the final parity audit pass report;
   - `suites/final-regression-suite.md` — the final regression/performance suite run record;
   - `release-readiness.md` — the release-readiness decision document.
2. `openspec/PROGRAM_STATE.json` / `PROGRAM_STATE.md` — update to mark the program `COMPLETE`,
   `currentChange = 250-final-program-verification`, completion 100%, and append the 250
   `validationResults` entry with the final gate evidence.
3. The change `verification.md` records the requirement evidence, commands, edge/adversarial
   validation, and the final decision.

The archive, checklist, audit, suite run, and decision are specified normatively in the capability
specs: `program-completion-checklist`, `evidence-archive`, `final-parity-audit`,
`final-regression-suite`, and `release-readiness`.

## Compatibility and migration

Additive documentation and state only. No public data, save format, network protocol, module, or
symbol is added or changed; no production code or test file is created or modified. The
`PARITY_MATRIX.md` schema version, per-change `verification.md` files, and existing
`PROGRAM_STATE.*` fields are unchanged by the archive (the standard end-of-change state update
still applies). No migration.

## Risks

- **Evidence drift / fabrication** — the archive could restate results that no run produced.
  Mitigation: each consolidated record is a citation of an existing, locatable record (a
  `verification.md` row, a named test, or a recorded command result); the evidence-archive spec
  requires provenance and forbids invented results.
- **Unclassifiable change** — a change that is neither `VERIFIED` nor carries an explicit product
  decision. Mitigation: the checklist spec makes any such change a hard failure that prevents
  `READY`.
- **Parity-matrix inaccuracy** — a matrix row contradicts the implementation or recorded evidence.
  Mitigation: the final parity audit re-checks every row against its cited evidence and records
  each discrepancy's disposition; any unresolved discrepancy prevents `READY`.
- **Failed final suite** — the regression or performance gate fails. Mitigation: a failed suite is
  a hard `NOT READY` unless the failure is a documented, authorized exception recorded in the suite
  record (see `final-regression-suite`).
- **Silent scope creep** — touching production code. Mitigation: this change is declared
  documentation-only; a scope check (no `src/`, no `tests/` diffs) is part of the final gate.

## Rollback strategy

Revert the commit(s). The evidence archive is additive documentation with no production consumers;
rolling back removes the archive and returns `PROGRAM_STATE.*` to the prior `ACTIVE` state. No
runtime behavior is affected.

## Definition of Done

- `openspec/evidence/` exists with all six required artifacts, and the `README.md` declares the
  archive complete over the catalog.
- The final verification checklist classifies every planned numbered change 001–250 as exactly one
  of `VERIFIED` or `DEFERRED`, and every `DEFERRED` change carries an explicit product decision and
  rationale.
- No unresolved mandatory requirement remains (no change is `VERIFIED` with a failed/unverified
  MUST/SHALL; every unresolved one is recorded as `DEFERRED` with a product decision or the program
  is `NOT READY`).
- The final parity audit ran and recorded dispositions for every discrepancy; the parity matrix is
  accurate or every inaccuracy is dispositioned.
- The final regression and performance suites ran and their results are recorded in the archive.
- A release-readiness decision is recorded with a verdict and rationale against checkable criteria.
- `PROGRAM_STATE.json` marks the program `COMPLETE`; `PROGRAM_STATE.md` reflects it.
- No production code or test file is added or modified.
- Full baseline gate green; 250 tasks 100%.

## Advancement gate

The program-completion checklist (FPC-1..FPC-3), the evidence archive (EVA-1..EVA-4), the final
parity audit (FPA-1..FPA-3), the final regression suite (FRS-1..FRS-3), and the release-readiness
decision (RR-1..RR-4) all pass; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run test:e2e` all pass; the release performance gate (247) passes or records a documented
deviation; and no `src/` or `tests/` file is modified. Change 250 is the final change in the
sequence; when its release decision is `READY` there is no subsequent change to advance to, and the
program state is marked `COMPLETE`.
