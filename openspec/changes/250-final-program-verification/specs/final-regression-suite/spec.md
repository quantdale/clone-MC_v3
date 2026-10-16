# Spec: final-regression-suite

## Contract

This spec governs the **final regression and performance suite run** executed by change 250,
recorded at `openspec/evidence/suites/final-regression-suite.md`. It makes the program-completion
condition "regression and performance suites pass" testable by running the full baseline gate and
the release performance gate (change 247) one final time and recording per-command results.

The suite run is a verification activity of change 250; it does not create or modify production
code or test files.

## Definitions

- **Baseline gate** — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`.
- **Release performance gate** — the frame/tick/load/save/network budget checks introduced by
  change 247 and its recorded evidence.
- **Suite record** — `openspec/evidence/suites/final-regression-suite.md`.
- **Documented exception** — a failing command or budget whose failure is recorded in the suite
  record with an explicit, authorized justification demonstrating that the failure implements or
  verifies no MUST/SHALL requirement (mirroring the AGENTS.md 90–99.99% exception rule).

## Invariants

- The suite record exists and records the result of every baseline-gate command and every release
  performance budget.
- A command/budget result is `PASS` or `FAIL`; no result is omitted.
- A failure that is not a `documented exception` leaves the suite `FAIL`.
- A failed suite with no documented exception prevents `READY`.

## Requirements

### Requirement: FRS-1 — Final baseline regression gate

The change SHALL run the full baseline gate and SHALL record the result of each command in the
suite record. Every command MUST pass for the suite to be `PASS`. A failed command SHALL be
recorded and, if not a documented exception, SHALL prevent `READY`.

#### Scenario: FRS-1.1 — All baseline commands pass
- **GIVEN** a final run of the baseline gate
- **WHEN** the suite record is inspected
- **THEN** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e`
  each record `PASS` with their results and counts
- **AND** the suite is `PASS`

#### Scenario: FRS-1.2 — Failed baseline command
- **GIVEN** a baseline-gate command that fails (e.g. a unit test failure or a build error)
- **WHEN** the suite record is finalized
- **THEN** the command records `FAIL`
- **AND** the release-readiness decision is `NOT READY` unless the failure is a documented
  exception in the suite record

#### Scenario: FRS-1.3 — Missing command result rejected
- **GIVEN** a suite record that omits the result of any baseline-gate command
- **WHEN** a reviewer validates the suite record
- **THEN** the suite record is rejected as incomplete
- **AND** the suite cannot be judged `PASS`

### Requirement: FRS-2 — Final release performance gate

The change SHALL run the release performance gate from change 247 and SHALL record the result of
each budget in the suite record. A budget result is `PASS` (within its recorded budget) or `FAIL`
(over budget). A `FAIL` budget SHALL be recorded and, if not a documented exception, SHALL prevent
`READY`.

#### Scenario: FRS-2.1 — All performance budgets pass
- **GIVEN** a final run of the release performance gate
- **WHEN** the suite record is inspected
- **THEN** every frame/tick/load/save/network budget records `PASS` with its measured value
- **AND** the performance gate is `PASS`

#### Scenario: FRS-2.2 — Over-budget result recorded
- **GIVEN** a performance budget whose measured value exceeds its recorded budget
- **WHEN** the suite record is finalized
- **THEN** the budget records `FAIL`
- **AND** the release-readiness decision is `NOT READY` unless the failure is a documented
  exception

#### Scenario: FRS-2.3 — Performance gate evidence preserved
- **GIVEN** the release performance gate runs for change 250
- **WHEN** a reviewer compares the suite record to the change-247 budget definitions
- **THEN** each measured value is recorded alongside its budget
- **AND** the record shows which budget each value was checked against

### Requirement: FRS-3 — Suite record completeness

The suite record SHALL contain a summary stating the overall suite result (`PASS`/`FAIL`), the
date/head of the run, the per-command and per-budget results, and, where applicable, the documented
exceptions. The suite result is `PASS` iff every command and budget passes or has a documented
exception.

#### Scenario: FRS-3.1 — Complete suite record
- **GIVEN** a finished final suite run
- **WHEN** a reviewer reads the suite record
- **THEN** it states the run date/head, the overall `PASS`/`FAIL` result, every command and budget
  result, and any documented exceptions
- **AND** the overall result matches the individual results

#### Scenario: FRS-3.2 — Documented exception stated
- **GIVEN** a failing command or budget that is a documented exception
- **WHEN** a reviewer reads the suite record
- **THEN** the failure is recorded with an explicit, authorized justification showing it implements
  or verifies no MUST/SHALL requirement
- **AND** the record states that the failure is a documented exception rather than a `PASS`

## Error and failure behavior

- A failing command/budget that is not a documented exception makes the suite `FAIL` and prevents
  `READY` (FRS-1.2, FRS-2.2).
- A suite record missing any command/budget result is incomplete (FRS-1.3).
- A documented exception that cannot show it implements/verifies no MUST/SHALL requirement is
  invalid and does not allow `READY`.
- The suite run is a verification activity; it adds no production behavior and any `src/`/`tests/`
  modification is a hard failure of the documentation-only constraint.

## Performance and resource bounds

The suite run itself is bounded by the standard gate cost (same as any full baseline gate plus the
change-247 performance gate). The suite record is a small documentation file. No new hot paths are
introduced.

## Compatibility and migration

No public data, save format, protocol, module, or symbol changes; no migration. The suite record
references the change-247 budget definitions without modifying them.

## Security and integrity

The suite record must reflect actual run results: a result MUST NOT be recorded `PASS` when the
command/budget failed, and a documented exception MUST NOT be used to conceal a MUST/SHALL failure.

## Observability

The suite record's per-command and per-budget `PASS`/`FAIL` rows and its overall result give a
single checkable signal for the release decision, and its run date/head provide provenance.

## Verification mapping

Reviewers verify FRS-1–FRS-3 by running the final baseline gate and release performance gate and
inspecting `openspec/evidence/suites/final-regression-suite.md` for complete, accurate results.
Results are recorded in change 250's `verification.md` under `Requirement evidence` (one row per
requirement) and `Edge/adversarial validation` (failed-command, over-budget, missing-result, and
documented-exception cases).
