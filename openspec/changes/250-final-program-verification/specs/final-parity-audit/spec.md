# Spec: final-parity-audit

## Contract

This spec governs the **final parity audit pass** executed by change 250, recorded at
`openspec/evidence/parity/final-parity-audit.md`. It makes the program-completion conditions "the
final parity audit passes" and "the parity matrix accurately records supported behavior and known
differences" testable. It re-checks the accuracy of `PARITY_MATRIX.md` (change 248) against actual
implementation and recorded evidence, and disposes of the findings from the whole-codebase
adversarial audit (change 249).

The audit is documentation-only. Change 250 MUST NOT create or modify any production code or test
file, and MUST NOT rewrite `PARITY_MATRIX.md` or any change's `verification.md` (it records
dispositions; re-categorization belongs to the change that identifies a discrepancy).

## Definitions

- **Parity matrix** — `PARITY_MATRIX.md` at the repository root, produced by change 248.
- **Matrix row** — a row of the parity matrix categorizing one planned feature as one of `exact`,
  `equivalent`, `approx`, `deferred`, `out-of-scope` with cited evidence.
- **Discrepancy** — a matrix row whose category contradicts its cited evidence or the actual
  implementation, whose evidence is missing, or whose feature is mis-assigned; or an audit finding
  that is unresolved.
- **Disposition** — the recorded outcome for a discrepancy ∈ { `resolved`, `accepted`, `open` }.
  `resolved` means corrected/closed in this change; `accepted` means a documented, authorized
  deviation; `open` means a blocker.
- **Critical finding** — a security, data-loss, corruption, determinism, compatibility, or
  regression blocker from the change-249 audit.

## Invariants

- The audit report exists and records the audit method, the catalog it covered, and the audit
  result.
- Every discrepancy identified during the audit has exactly one disposition.
- An `open` critical finding or an `open` matrix discrepancy prevents `READY`.
- The audit never rewrites `PARITY_MATRIX.md` or any `verification.md`.

## Requirements

### Requirement: FPA-1 — Final parity audit pass recorded

The change SHALL execute a final parity audit pass and SHALL record it in
`openspec/evidence/parity/final-parity-audit.md`. The report SHALL state the audit method (how rows
and findings were re-derived), the catalog covered, the number of rows/findings checked, the list
of discrepancies found with their dispositions, and an overall audit result of `PASS` or `FAIL`
(`PASS` iff no discrepancy is `open`).

#### Scenario: FPA-1.1 — Audit report present with method and result
- **GIVEN** a completed change 250
- **WHEN** a reviewer reads `openspec/evidence/parity/final-parity-audit.md`
- **THEN** the report states the audit method, the catalog covered, the checks performed, the
  discrepancies and their dispositions, and an overall `PASS`/`FAIL` result
- **AND** the result is `FAIL` if and only if any discrepancy is `open`

#### Scenario: FPA-1.2 — Missing audit report rejected
- **GIVEN** a change 250 with no `openspec/evidence/parity/final-parity-audit.md`
- **WHEN** a reviewer validates the final parity audit
- **THEN** the final parity audit is not recorded
- **AND** the program cannot be marked complete without it

### Requirement: FPA-2 — Parity-matrix accuracy re-check

The audit SHALL re-derive each parity-matrix row's category from its cited evidence using the
change-248 decision rules and SHALL verify the cited evidence still exists and belongs to a
`VERIFIED` change. A row whose category contradicts its evidence, whose evidence is missing, or
whose feature is mis-assigned SHALL be recorded as a discrepancy with a disposition. A matrix
discrepancy left `open` SHALL prevent `READY`.

#### Scenario: FPA-2.1 — Accurate rows pass
- **GIVEN** a matrix row whose category matches its cited evidence and whose cited evidence exists
  and belongs to a `VERIFIED` change
- **WHEN** the audit re-derives the category and checks the evidence
- **THEN** the row passes with no discrepancy
- **AND** it is not flagged

#### Scenario: FPA-2.2 — Inaccurate row recorded with disposition
- **GIVEN** a matrix row whose category contradicts its cited evidence, or whose cited evidence is
  missing, or whose feature is mis-assigned
- **WHEN** the audit inspects the row
- **THEN** the row is recorded as a discrepancy with a disposition of `resolved`, `accepted`, or
  `open`
- **AND** an `open` discrepancy is visible in the audit report and prevents `READY`

#### Scenario: FPA-2.3 — Missing matrix evidence
- **GIVEN** a matrix row categorized `exact`/`equivalent`/`approx` whose cited evidence record does
  not exist or does not belong to a `VERIFIED` change
- **WHEN** the audit validates the row's evidence
- **THEN** the row is a missing-evidence discrepancy
- **AND** it is dispositioned and an `open` disposition prevents `READY`

### Requirement: FPA-3 — Audit findings dispositioned

The audit SHALL consume the whole-codebase adversarial audit report from change 249 and SHALL
record a disposition for every finding. Any `open` critical finding SHALL prevent `READY`. The
disposition of non-critical findings SHALL be recorded so a reviewer can see each finding's
outcome.

#### Scenario: FPA-3.1 — All findings dispositioned
- **GIVEN** the change-249 audit report
- **WHEN** the final parity audit disposes of each finding
- **THEN** every finding has a disposition of `resolved`, `accepted`, or `open`
- **AND** the report lists each finding with its disposition

#### Scenario: FPA-3.2 — Open critical finding blocks READY
- **GIVEN** a change-249 finding classified as a critical finding (security, data-loss, corruption,
  determinism, compatibility, or regression blocker) with disposition `open`
- **WHEN** the release-readiness decision is evaluated
- **THEN** the program MUST NOT be `READY`
- **AND** the audit report records the open critical finding

## Error and failure behavior

- A missing audit report is an FPA-1 failure.
- A matrix discrepancy or critical finding left `open` is an FPA-2/FPA-3 failure and prevents
  `READY`.
- A matrix row or finding with no disposition is an incomplete-audit failure.
- Rewriting `PARITY_MATRIX.md` or any `verification.md` is a hard failure of the read-only audit
  contract.
- Any `src/`/`tests/` modification is a hard failure of the documentation-only constraint.

## Performance and resource bounds

No runtime performance applies. The audit is bounded by the matrix row count (≈ the planned feature
count) and the change-249 finding count; the report's catalog-coverage statement makes the checked
scope explicit. The audit is a one-off authoring step, not committed.

## Compatibility and migration

Additive documentation only. No public data, save format, protocol, module, or symbol changes; no
migration. The audit reads `PARITY_MATRIX.md` and the change-249 audit report; it does not rewrite
either.

## Security and integrity

The audit's integrity property is that dispositions are evidence-based and that no critical
finding is silently dropped: an `open` critical finding MUST be visible and MUST block `READY`.
The audit SHALL NOT fabricate a `resolved` or `accepted` disposition for a finding that remains
unresolved.

## Observability

The audit report's discrepancy list with per-item dispositions makes any inaccuracy or unresolved
finding visible, and the overall `PASS`/`FAIL` result is a single checkable signal for the release
decision.

## Verification mapping

Reviewers verify FPA-1–FPA-3 by inspecting `openspec/evidence/parity/final-parity-audit.md`
(method, catalog, discrepancy list, dispositions, overall result) and cross-checking it against
`PARITY_MATRIX.md` and the change-249 audit report. Results are recorded in change 250's
`verification.md` under `Requirement evidence` (one row per requirement) and
`Edge/adversarial validation` (accurate-row, inaccurate-row, missing-evidence, open-critical-
finding, and missing-report cases).
