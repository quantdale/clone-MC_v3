# Spec: release-readiness

## Contract

This spec governs the **release-readiness decision** made by change 250, recorded at
`openspec/evidence/release-readiness.md`. It defines the decision procedure, the deterministic
readiness criteria, and the required decision document. It makes the program-completion condition
"final release-readiness decision" testable: a reviewer must be able to determine `READY` vs
`NOT READY` without guessing.

The decision is documentation-only. Change 250 MUST NOT create or modify any production code or
test file.

## Definitions

- **Readiness criterion** — one checkable condition from the RR-2 list. A criterion is `PASS` or
  `FAIL`; there is no partial result.
- **Verdict** — the decision output ∈ { `READY`, `NOT READY` }.
- **Decision document** — `openspec/evidence/release-readiness.md`.
- **Critical finding** — a security, data-loss, corruption, determinism, compatibility, or
  regression blocker (as defined by `final-parity-audit`).

## Invariants

- The decision document exists and records the verdict, the date, one result row per readiness
  criterion, and a rationale.
- The verdict is `READY` iff every readiness criterion is `PASS`; otherwise it is `NOT READY`.
- Every criterion result is derivable from an existing artifact (checklist, archive, audit, suite
  record, program state); no result is asserted without evidence.

## Requirements

### Requirement: RR-1 — Decision document and procedure

The change SHALL create `openspec/evidence/release-readiness.md`. The document SHALL record the
verdict, the decision date, the evaluating authority, one `PASS`/`FAIL` row per readiness
criterion, and a non-empty rationale. The procedure SHALL evaluate each criterion from the
completed checklist, evidence archive, final parity audit, and final suite record, and SHALL derive
the verdict as `READY` iff every criterion is `PASS`.

#### Scenario: RR-1.1 — Decision document present and complete
- **GIVEN** a completed change 250
- **WHEN** a reviewer reads `openspec/evidence/release-readiness.md`
- **THEN** the document records the verdict, date, evaluating authority, a `PASS`/`FAIL` row for
  every readiness criterion, and a rationale
- **AND** the verdict matches the criterion results (READY iff all PASS)

#### Scenario: RR-1.2 — Missing decision document rejected
- **GIVEN** a change 250 with no `openspec/evidence/release-readiness.md`
- **WHEN** a reviewer validates the release decision
- **THEN** no release-readiness decision exists
- **AND** the program cannot be marked complete without it

### Requirement: RR-2 — Readiness criteria

The readiness decision SHALL evaluate exactly these criteria, each checkable as `PASS`/`FAIL`:

- **RC-1 — Checklist complete.** Every planned numbered change 001–250 is classified `VERIFIED` or
  `DEFERRED` with an explicit product decision (no `UNCLASSIFIED` row). **PASS** iff no
  `UNCLASSIFIED` row remains.
- **RC-2 — No unresolved mandatory requirement.** No `VERIFIED` change carries a failed/unverified
  MUST/SHALL requirement, and every `DEFERRED` change's waiver is recorded with an explicit product
  decision. **PASS** iff the checklist records no unresolved mandatory requirement.
- **RC-3 — Evidence archive complete.** Every planned change 001–250 has a provenance-backed
  evidence record and the archive's completeness statement holds. **PASS** iff `evidence-archive`
  EVA-1..EVA-4 pass.
- **RC-4 — Final parity audit passes.** `openspec/evidence/parity/final-parity-audit.md` records
  result `PASS` (no matrix discrepancy or critical finding is `open`). **PASS** iff
  `final-parity-audit` FPA-1..FPA-3 pass.
- **RC-5 — Final regression and performance suites pass.** The suite record records `PASS` for the
  baseline gate and release performance gate (every command and budget passes or is a valid
  documented exception). **PASS** iff `final-regression-suite` FRS-1..FRS-3 pass.
- **RC-6 — Parity matrix accurate.** `PARITY_MATRIX.md` accurately records supported behavior and
  known differences; any inaccuracy is dispositioned and none is `open`. **PASS** iff no `open`
  matrix discrepancy remains.
- **RC-7 — Durable state marked COMPLETE.** `PROGRAM_STATE.json` reports status `COMPLETE`,
  `completionPercentage` `100`, `mandatoryRequirementsPass` `true`, `requiredTestsPass` `true`,
  and a 250 `validationResults` entry. **PASS** iff the state fields hold these values.
- **RC-8 — No critical blocker.** No `open` critical finding (security/data-loss/corruption/
  determinism/compatibility/regression) remains. **PASS** iff the audit records no `open` critical
  finding.
- **RC-9 — Final state published and reviewable.** The final commit is published to `origin/main`
  and its head is recorded and independently reviewable from GitHub. **PASS** iff the published
  head is verified on the remote.

A verdict of `READY` SHALL be issued if and only if every criterion RC-1..RC-9 is `PASS`.

#### Scenario: RR-2.1 — All criteria pass, verdict READY
- **GIVEN** a checklist with no `UNCLASSIFIED` row, a complete provenance-backed archive, a
  passing final parity audit with no `open` critical finding, passing final suites, an accurate
  parity matrix, `PROGRAM_STATE.json` marked `COMPLETE`, and a published final head
- **WHEN** the readiness criteria are evaluated
- **THEN** every criterion RC-1..RC-9 is `PASS`
- **AND** the verdict is `READY`

#### Scenario: RR-2.2 — One criterion fails, verdict NOT READY
- **GIVEN** any single criterion that is `FAIL` (e.g. a failed baseline-gate command, an `open`
  critical finding, an `UNCLASSIFIED` checklist row, or `PROGRAM_STATE.json` not marked `COMPLETE`)
- **WHEN** the readiness criteria are evaluated
- **THEN** the verdict is `NOT READY`
- **AND** the decision document names the failing criterion in its rationale

#### Scenario: RR-2.3 — Criterion result without evidence rejected
- **GIVEN** a criterion recorded `PASS` that is not derivable from an existing artifact (e.g. a
  suite result not present in the suite record)
- **WHEN** a reviewer validates the decision
- **THEN** the criterion result is rejected as unevidenced
- **AND** the verdict is re-derived from the actual artifacts, which prevents `READY` where evidence
  is missing

### Requirement: RR-3 — Recorded release decision with rationale

The decision document SHALL record a verdict (`READY` or `NOT READY`), a non-empty rationale that
summarizes the evidence per criterion and, where `NOT READY`, names each failing criterion. When the
verdict is `READY` despite any `DEFERRED` change, the rationale SHALL cite the recorded product
decisions that authorize the deferral.

#### Scenario: RR-3.1 — NOT READY with failing criteria named
- **GIVEN** a `NOT READY` decision document
- **WHEN** a reviewer reads the rationale
- **THEN** the rationale names each failing criterion and its evidence
- **AND** the verdict is consistent with the criterion results

#### Scenario: RR-3.2 — READY with deferrals justified
- **GIVEN** a `READY` decision that includes one or more `DEFERRED` changes
- **WHEN** a reviewer reads the rationale
- **THEN** the rationale cites the recorded product decisions authorizing each deferral
- **AND** each cited decision exists in the checklist/evidence record

### Requirement: RR-4 — Final state published and reviewable

The change SHALL publish the final state to `origin/main` per `openspec/REVIEW_HANDOFF.md` and SHALL
record the published head so that the program's terminal state is independently reviewable from
GitHub.

#### Scenario: RR-4.1 — Final state on origin/main
- **GIVEN** a completed change 250 with a `READY` or `NOT READY` decision
- **WHEN** the session publishes its checkpoint
- **THEN** the final commit is pushed to `origin/main`
- **AND** the published head is recorded and verified on the remote
- **AND** the archive, checklist, audit, suite record, decision document, and `PROGRAM_STATE.*`
  are reviewable in that commit

#### Scenario: RR-4.2 — Unpublished final state
- **GIVEN** a change 250 whose intended final state exists only locally
- **WHEN** the session ends
- **THEN** RC-9 is `FAIL`
- **AND** the session reports the exact blocker rather than claiming a reviewable terminal state

## Error and failure behavior

- A missing decision document is an RR-1 failure.
- A verdict that does not match the criterion results is an RR-1/RR-2 inconsistency failure.
- A criterion `PASS` without derivable evidence is an RR-2.3 failure and prevents `READY`.
- A `READY` decision that cites a nonexistent deferral decision is an RR-3 failure.
- An unpublished final state leaves RC-9 `FAIL` (RR-4).
- Any `src/`/`tests/` modification is a hard failure of the documentation-only constraint.

## Performance and resource bounds

No runtime performance applies. The decision document is bounded by the fixed nine-criterion list
plus rationale; the fixed criteria make the decision reproducible.

## Compatibility and migration

Additive documentation and state only. No public data, save format, protocol, module, or symbol
changes; no migration. The decision document consumes, never rewrites, the checklist, archive,
audit, suite record, and `PROGRAM_STATE.*`.

## Security and integrity

The decision's integrity property is that the verdict is derived from recorded evidence, never
asserted: no criterion may be marked `PASS` without a supporting artifact, and an `open` critical
finding must force `NOT READY`.

## Observability

The decision document's per-criterion `PASS`/`FAIL` rows and verdict give reviewers and release
gatekeepers an unambiguous, reproducible answer to "is the program release-ready?", and RC-9 makes
the published head observable.

## Verification mapping

Reviewers verify RR-1–RR-4 by reading `openspec/evidence/release-readiness.md` and re-deriving
each criterion result from the checklist, archive, audit, suite record, and `PROGRAM_STATE.json`.
Results are recorded in change 250's `verification.md` under `Requirement evidence` (one row per
requirement) and `Edge/adversarial validation` (all-pass/READY, one-fail/NOT-READY,
unevidenced-criterion, deferral-citation, and unpublished-state cases).
