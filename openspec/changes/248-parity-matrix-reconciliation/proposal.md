# Proposal: 248-parity-matrix-reconciliation

## Problem

`MINECRAFT_PARITY_MASTER_PLAN.md` (§2.3) requires that "Every Minecraft feature should be tracked
as one of" five parity categories — exact-behavior, equivalent-behavior, approximation, deferred,
and out of scope — and mandates that a `PARITY_MATRIX.md` be maintained with "feature, reference
behavior, local implementation, tests, known differences, and status." As of change 248 the
sequence has implemented and VERIFIED changes 001–247, each producing a narrow feature, yet no
single authoritative document reconciles the *whole planned feature set* against the actual
implementation and the recorded verification evidence. Without it there is no program-level answer
to "which planned features match Java exactly, which differ, which were approximated, which are
deferred, and which are out of scope, and on what evidence." A feature could be assumed implemented
when it was only partially built, or categorized on assertion instead of evidence.

## Goals

- Produce the single authoritative `PARITY_MATRIX.md` (documentation artifact only) that
  categorizes **every planned feature** from `MINECRAFT_PARITY_MASTER_PLAN.md` and
  `CHANGE_SEQUENCE.md` (001–250) as exactly one of `exact`, `equivalent`, `approx`, `deferred`, or
  `out-of-scope`.
- Make every category assignment **evidence-backed and auditable**: each non-deferred,
  non-out-of-scope row MUST cite an existing, VERIFIED verification record (a requirement-evidence
  row, a named test, or a recorded command result), never fabricated evidence.
- Make the categorization **testable**: a reviewer must be able to independently re-derive each
  row's category from its cited evidence using the documented category decision rules.
- Additive documentation only: no production code and no test files are created or modified by
  this change.

## Non-goals

- Changing or implementing any gameplay/network/worldgen behavior (this change records the current
  implementation; it does not alter it).
- Categorizing *sub-features* beyond the planned-feature granularity defined by the change
  sequence narrow outcomes and the master-plan sections (see design).
- Re-running or fabricating verification; the matrix consumes existing VERIFIED evidence.
- Deciding the release-ready verdict (that is change 250); 248 produces the categorized matrix,
  250 consumes it.

## Preconditions

- The immediately preceding change in the sequence (`247-performance-release-gate`) is VERIFIED and
  advancement is allowed, per `CHANGE_SEQUENCE.md` ordering contract.
- Every change whose features this matrix categorizes (001–247) has its `verification.md`
  available and, where applicable, VERIFIED at implementation time.
- Baseline gate green at the entry commit: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e` (used as the regression guard proving this change does not
  alter production behavior).

## Dependencies

- `MINECRAFT_PARITY_MASTER_PLAN.md` — the source of the planned feature set and the category
  taxonomy names.
- `CHANGE_SEQUENCE.md` — the canonical ordered narrow outcomes that define the primary feature
  granularity (001–250).
- `openspec/PROGRAM_STATE.json` / `PROGRAM_STATE.md` — authoritative record of which changes are
  VERIFIED and the completion/advancement state used to bound evidence validity.
- Each implemented change's `verification.md` — the evidence source for category assignment.
- No dependency on the contents of concurrent sibling change directories (246/247). Those changes'
  verification records are consumed as evidence by the implementing agent only after they are
  themselves VERIFIED; this package describes its own contracts precisely and relies on the final
  reconciliation step.

## Proposed change

Create `PARITY_MATRIX.md` at the repository root (adjacent to `MINECRAFT_PARITY_MASTER_PLAN.md`,
matching the name the master plan mandates). The document contains:

1. A header declaring a matrix schema version, generation date, and the source-of-truth documents
   it derives from.
2. The five-category taxonomy with normative definitions and the **category decision rules**
   (exact vs equivalent vs approx; deferred vs out-of-scope), so assignments are reproducible.
3. One row per planned feature: `FeatureId`, `Feature`, `Change` (implementing change number, or
   `—` for master-plan-only features), `MasterPlan §`, `Category`, `Reference behavior`, `Local
   implementation`, `Evidence`, `Known differences`, `Status`.
4. Summary statistics (per-category counts) and a coverage statement tying every planned feature
   to exactly one row and every VERIFIED change to at least one row.

The categorization contract (row schema, taxonomy, decision rules, evidence requirements,
missing/contradictory-evidence handling, and coverage invariants) is specified in the capability
specs `parity-matrix` and `parity-evidence`.

## Compatibility and migration

Additive documentation only. No public data, save format, network protocol, module, or symbol is
added or changed. Existing `verification.md` and `PROGRAM_STATE.*` files are unchanged by the
artifact itself (the standard end-of-change state update still applies). No migration.

## Risks

- **Evidence drift** — the matrix could cite a verification record that later changes. Mitigation:
  each citation is a specific, locatable artifact (file + row/test name), and the spec requires the
  evidence to exist and belong to a VERIFIED change at implementation time.
- **Subjectivity in categories** — without a deterministic decision rule the five categories blur.
  Mitigation: the spec fixes crisp boundary rules (exact vs equivalent on Java-core-rule match;
  equivalent vs approx on whether the difference is a browser/render/resource constraint; deferred
  vs out-of-scope on roadmap intent) and requires category-boundary validation.
- **Silent scope creep** — touching production code. Mitigation: this change is declared
  documentation-only; the regression gate and a scope check (no `src/`, no `tests/` diffs) are
  part of the final gate.

## Rollback strategy

Revert the commit. `PARITY_MATRIX.md` is an additive documentation file with no production
consumers yet; rollback is a no-op for runtime behavior.

## Definition of Done

- `PARITY_MATRIX.md` exists at the repository root and declares its schema version and taxonomy.
- Every planned feature in the catalog appears in exactly one row with a valid category.
- Every row categorized `exact`/`equivalent`/`approx` cites at least one existing, VERIFIED
  evidence artifact; every `deferred`/`out-of-scope` row carries a documented rationale.
- Every VERIFIED change 001–247 maps to at least one feature row.
- No row's category contradicts its cited evidence, and every category assignment satisfies the
  documented decision rule (category-boundary, missing-evidence, and contradictory-evidence checks
  pass).
- No production code or test file is added or modified.
- Full baseline gate green; 248 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must all pass
(unchanged from the pre-change baseline, proving no production behavior changed), the matrix passes
the spec's validation checks, and no `src/` or `tests/` file is modified.
