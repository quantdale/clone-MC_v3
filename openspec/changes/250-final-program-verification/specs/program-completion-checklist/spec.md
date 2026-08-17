# Spec: program-completion-checklist

## Contract

This spec governs the **final verification checklist** produced by change 250. The checklist turns
the first two program-completion conditions in `openspec/AUTONOMOUS_GOAL.md` — "every planned
numbered change is `VERIFIED` or intentionally `DEFERRED` by an explicit product decision" and "no
unresolved mandatory requirement remains" — into a reviewer-checkable document. It classifies every
planned numbered change 001–250 and proves the program is complete (or fails loudly if it is not).

The checklist is documentation-only. It MUST NOT be accompanied by any production code or test
file, and change 250 MUST NOT modify any `src/` or `tests/` file.

## Definitions

- **Planned numbered change** — an entry in `openspec/CHANGE_SEQUENCE.md`, identified by its
  zero-padded number and slug, 001–250.
- **Status** — a change's checklist classification ∈ { `VERIFIED`, `DEFERRED`, `UNCLASSIFIED` }.
- **Product decision** — an explicit, recorded decision that a not-`VERIFIED` change is
  intentionally deferred for the release, with the deciding authority and a rationale.
- **Resolved mandatory requirement** — a MUST/SHALL requirement whose change's `verification.md`
  records it as passed (PASS) at archive time.

## Invariants

- Every planned numbered change 001–250 appears in exactly one checklist row.
- Every row has exactly one status from { `VERIFIED`, `DEFERRED`, `UNCLASSIFIED` }.
- A `VERIFIED` row exists only if the change's `verification.md` records it `VERIFIED` at archive
  time.
- A `DEFERRED` row exists only if a recorded explicit product decision and rationale exist.
- No row is both `VERIFIED` and `DEFERRED`; a row that is neither is `UNCLASSIFIED`.
- The checklist's `VERIFIED` set equals the `VERIFIED` set recorded in `PROGRAM_STATE.json`.

## Requirements

### Requirement: FPC-1 — Final verification checklist

The change SHALL create `openspec/evidence/checklist/final-verification-checklist.md` containing
one row per planned numbered change 001–250. Each row SHALL record the change number, slug, narrow
outcome, a `Status` from { `VERIFIED`, `DEFERRED`, `UNCLASSIFIED` }, the evidence record path, and
(for `DEFERRED`) the product decision and rationale. The checklist SHALL include a summary
statement of the counts of `VERIFIED`, `DEFERRED`, and `UNCLASSIFIED` changes.

#### Scenario: FPC-1.1 — Complete checklist over the catalog
- **GIVEN** `openspec/evidence/checklist/final-verification-checklist.md`
- **WHEN** a reviewer maps every planned numbered change 001–250 to a row
- **THEN** every planned change is found in exactly one row
- **AND** the summary lists the count of `VERIFIED`, `DEFERRED`, and `UNCLASSIFIED` changes

#### Scenario: FPC-1.2 — Verified row requires a VERIFIED source
- **GIVEN** a checklist row with `Status = VERIFIED`
- **WHEN** a reviewer opens the change's `verification.md`
- **THEN** that `verification.md` records the change as `VERIFIED`
- **AND** an evidence record exists at `openspec/evidence/changes/<NNN>.md` for that change

#### Scenario: FPC-1.3 — Unclassified row rejected
- **GIVEN** a checklist row whose `Status` is `UNCLASSIFIED`
- **WHEN** a reviewer validates the checklist
- **THEN** the checklist is rejected as incomplete for that change
- **AND** the program MUST NOT be marked `COMPLETE` until the row is `VERIFIED` or `DEFERRED`

#### Scenario: FPC-1.4 — Missing row rejected
- **GIVEN** a checklist that omits any planned numbered change 001–250
- **WHEN** a reviewer compares the checklist rows to the change sequence
- **THEN** the checklist is rejected as incomplete (the missing change is unaccounted for)

### Requirement: FPC-2 — Deferred change with explicit product decision

A planned numbered change that is not `VERIFIED` SHALL be classified `DEFERRED` only when an
explicit product decision and a non-empty rationale are recorded for it, both in the checklist row
and in `openspec/evidence/changes/<NNN>.md`. A change with no such recorded decision MUST be
classified `UNCLASSIFIED`, not `DEFERRED`.

#### Scenario: FPC-2.1 — Deferred change carries a decision
- **GIVEN** a checklist row with `Status = DEFERRED`
- **WHEN** a reviewer reads the row and the corresponding `changes/<NNN>.md`
- **THEN** both record the explicit product decision and a non-empty rationale
- **AND** the change's `verification.md` does not record it as `VERIFIED`

#### Scenario: FPC-2.2 — Deferral without a decision is rejected
- **GIVEN** a not-`VERIFIED` change whose row carries no recorded product decision and rationale
- **WHEN** a reviewer validates the checklist
- **THEN** the row MUST be classified `UNCLASSIFIED`, not `DEFERRED`
- **AND** the incomplete deferral prevents `READY`

#### Scenario: FPC-2.3 — Deferred change must not have unresolved MUST/SHALL required for release
- **GIVEN** a `DEFERRED` change whose deferral rationale claims it is not required for the release
- **WHEN** a reviewer checks whether any unresolved MUST/SHALL requirement is nonetheless mandatory
  for the release product decision
- **THEN** a requirement that the release decision does not waive keeps the program `NOT READY`
- **AND** the deferral rationale MUST name the release-scope basis for the waiver

### Requirement: FPC-3 — No unresolved mandatory requirement and COMPLETE state

The checklist SHALL record that no unresolved mandatory requirement remains: every planned change
is `VERIFIED` with all MUST/SHALL requirements passed, or `DEFERRED` with an explicit product
decision. The change SHALL update `openspec/PROGRAM_STATE.json` to mark the program `COMPLETE`
(status `COMPLETE`, `currentChange` = `250-final-program-verification`,
`currentChangeStatus` = `VERIFIED`, `completionPercentage` = `100`,
`mandatoryRequirementsPass` = `true`, `requiredTestsPass` = `true`, `advancementAllowed` = `true`,
`exceptionUsed` = `false`, `nextChange` absent or empty) and append a `validationResults` entry for
change 250, and SHALL update `openspec/PROGRAM_STATE.md` to reflect the completed program.

#### Scenario: FPC-3.1 — All changes verified and state marked COMPLETE
- **GIVEN** a checklist in which every planned change 001–250 is `VERIFIED` or `DEFERRED` with a
  decision, and the final suites pass
- **WHEN** the implementing agent updates `PROGRAM_STATE.json` and `PROGRAM_STATE.md`
- **THEN** `PROGRAM_STATE.json` reports status `COMPLETE`, `completionPercentage` `100`,
  `mandatoryRequirementsPass` `true`, and a 250 `validationResults` entry with the final gate
  results
- **AND** `PROGRAM_STATE.md` states the program is complete

#### Scenario: FPC-3.2 — Unresolved mandatory requirement blocks COMPLETE
- **GIVEN** a `VERIFIED` change whose `verification.md` records a failed or unverified MUST/SHALL
  requirement, with no deferral decision
- **WHEN** the checklist and program state are finalized
- **THEN** the program MUST NOT be marked `COMPLETE`
- **AND** the change is recorded `UNCLASSIFIED` (or `DEFERRED` with a decision) and the release
  decision is `NOT READY`

#### Scenario: FPC-3.3 — State/checklist inconsistency rejected
- **GIVEN** a checklist whose `VERIFIED` set differs from the `VERIFIED` set in
  `PROGRAM_STATE.json`
- **WHEN** a reviewer cross-checks the checklist against program state
- **THEN** the inconsistency is recorded and MUST be reconciled before the program is marked
  `COMPLETE`

## Error and failure behavior

- An `UNCLASSIFIED` row is a hard checklist failure (FPC-1.3) and prevents `COMPLETE` and `READY`.
- A `DEFERRED` row without a recorded product decision and rationale is treated as `UNCLASSIFIED`
  (FPC-2.2).
- A `VERIFIED` row whose originating `verification.md` does not record it `VERIFIED` is a missing-
  evidence failure (see `evidence-archive` EVA-4).
- A `VERIFIED` change with a failed/unverified MUST/SHALL and no deferral decision prevents
  `COMPLETE` (FPC-3.2).
- Any `src/`/`tests/` modification is a hard failure of the documentation-only constraint.

## Performance and resource bounds

No runtime performance applies (no production code). The checklist is bounded by the 250 change
rows plus a summary; the completeness and summary requirements make any growth visible. Validation
is a one-off authoring/audit step and is not committed.

## Compatibility and migration

Additive documentation and state only. No public data, save format, protocol, module, or symbol
changes; no migration. The checklist reads, never rewrites, the per-change `verification.md` files
and `PARITY_MATRIX.md`. The `PROGRAM_STATE.json` update is the standard end-of-change checkpoint
that also marks the terminal `COMPLETE` state.

## Security and integrity

Integrity of classification is the security-relevant property: every `Status` must be derivable
from an existing, locatable record, never asserted. The checklist SHALL NOT fabricate a `VERIFIED`
or `DEFERRED` classification and SHALL NOT alter any change's `verification.md`.

## Observability

The checklist summary counts (`VERIFIED`, `DEFERRED`, `UNCLASSIFIED`) surface the completeness
signal at a glance; any non-zero `UNCLASSIFIED` count is a visible blocker. `PROGRAM_STATE.json`
status `COMPLETE` and the appended 250 `validationResults` entry provide the machine-readable
terminal signal.

## Verification mapping

Reviewers verify FPC-1–FPC-3 by inspecting the checklist (catalog coverage, status validity,
deferral decisions, summary) and cross-checking it against the per-change `verification.md` files
and `PROGRAM_STATE.json`. Results are recorded in change 250's `verification.md` under
`Requirement evidence` (one row per requirement) and `Edge/adversarial validation` (missing-row,
unclassified-row, deferred-without-decision, unresolved-mandatory, and state-inconsistency cases).
