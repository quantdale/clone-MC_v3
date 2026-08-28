# Spec: evidence-archive

## Contract

This spec governs the **evidence archive** produced by change 250 at `openspec/evidence/`. It
defines the archive's structure, the per-change evidence record schema, the completeness statement,
and the provenance rule that every recorded result is traceable to an existing record. It makes the
program-completion conditions "complete evidence archive" and "evidence is never fabricated"
testable and addresses the heterogeneity of `PROGRAM_STATE.json`'s `validationResults` by
consolidating evidence in a stable, reviewable form.

The archive is documentation-only. Change 250 MUST NOT create or modify any production code or
test file.

## Definitions

- **Evidence record** — `openspec/evidence/changes/<NNN>.md`, a consolidated record for one planned
  numbered change (001–250).
- **Source record** — an existing, locatable artifact an evidence record cites: a row in a
  change's `verification.md`, a named test, or a recorded command result.
- **Provenance** — for each recorded value, a citation to its source record (file path and, where
  applicable, row/test name) such that a reviewer can locate it.
- **Completeness statement** — a declaration in `openspec/evidence/README.md` that every planned
  numbered change 001–250 has exactly one evidence record and that the `VERIFIED` records match the
  `VERIFIED` set in `PROGRAM_STATE.json`.

## Invariants

- Every planned numbered change 001–250 has exactly one evidence record under
  `openspec/evidence/changes/`.
- Every recorded value in the archive has provenance to an existing source record; the archive
  contains no invented result.
- A `VERIFIED` record copies the recorded gate results verbatim from its source and never reports
  results that a run or record did not produce.
- A `DEFERRED` record contains a deferral decision and rationale and no fabricated evidence fields.
- The `README.md` completeness statement is present and true only when all records exist and the
  `VERIFIED` sets agree.

## Requirements

### Requirement: EVA-1 — Archive structure and manifest

The change SHALL create the directory `openspec/evidence/` containing `README.md` (the manifest
and completeness statement), `checklist/final-verification-checklist.md`,
`changes/<NNN>.md` for every planned numbered change 001–250, `parity/final-parity-audit.md`,
`suites/final-regression-suite.md`, and `release-readiness.md`. The `README.md` SHALL declare the
archive's purpose, the catalog it covers (001–250), the provenance rule, and the completeness
statement.

#### Scenario: EVA-1.1 — Required artifacts present
- **GIVEN** a completed change 250
- **WHEN** a reviewer lists `openspec/evidence/`
- **THEN** all six required artifacts (manifest, checklist, per-change records, parity audit, suite
  record, release decision) are present
- **AND** `README.md` declares the purpose, catalog, provenance rule, and completeness statement

#### Scenario: EVA-1.2 — Missing artifact rejected
- **GIVEN** an archive missing any required artifact (e.g. no `release-readiness.md`)
- **WHEN** a reviewer validates the archive structure
- **THEN** the archive is rejected as incomplete
- **AND** the completeness statement is not satisfied

### Requirement: EVA-2 — Per-change evidence record completeness

For every planned numbered change 001–250, the archive SHALL contain exactly one file
`openspec/evidence/changes/<NNN>.md`. A record for a `VERIFIED` change SHALL contain the fields
`change`, `status` (`VERIFIED`), the recorded `head`, per-gate results (`typecheck`, `lint`,
`unit` count+pass, `build`, `e2e` count+pass), a `note`, and the `source` path of the originating
`verification.md`. A record for a `DEFERRED` change SHALL contain `change`, `status` (`DEFERRED`),
a `productDecision`, and a `rationale`.

#### Scenario: EVA-2.1 — One record per change
- **GIVEN** the archive and the change sequence
- **WHEN** a reviewer maps each planned change 001–250 to `changes/<NNN>.md`
- **THEN** exactly one record exists per change
- **AND** each record's `change` value matches the sequence slug

#### Scenario: EVA-2.2 — Verified record has the full evidence fields
- **GIVEN** a `VERIFIED` change's evidence record
- **WHEN** a reviewer reads the record
- **THEN** it contains `head`, per-gate results, unit/e2e counts with pass flags, a `note`, and the
  `source` verification.md path
- **AND** a `DEFERRED` change's record instead contains `productDecision` and `rationale`

#### Scenario: EVA-2.3 — Missing or extra record rejected
- **GIVEN** an archive that omits a change's record or contains a duplicate/unnumbered record
- **WHEN** a reviewer validates record completeness
- **THEN** the archive is rejected as incomplete (missing record) or inconsistent (duplicate)

### Requirement: EVA-3 — Completeness statement is honest

The `README.md` completeness statement SHALL be true exactly when every planned numbered change
001–250 has a record and the set of changes recorded `VERIFIED` in the archive equals the `VERIFIED`
set in `PROGRAM_STATE.json`. The implementing agent SHALL update the statement at the end of archive
assembly and MUST NOT mark it satisfied while any record is missing or the sets disagree.

#### Scenario: EVA-3.1 — Statement matches the archive
- **GIVEN** a complete set of `changes/<NNN>.md` and a matching `VERIFIED` set in program state
- **WHEN** a reviewer reads the `README.md` completeness statement
- **THEN** the statement declares the archive complete
- **AND** the statement is consistent with the actual records and program state

#### Scenario: EVA-3.2 — Statement premature or false
- **GIVEN** an archive with a missing record, or a `VERIFIED` set that disagrees with
  `PROGRAM_STATE.json`
- **WHEN** a reviewer reads the `README.md` completeness statement
- **THEN** the statement is not satisfied
- **AND** a claim of completeness under this condition is rejected as false

### Requirement: EVA-4 — Provenance and non-fabrication

Every recorded gate result, test count, and evidence citation in the archive SHALL have provenance
to an existing source record. The archive MUST NOT contain a result that no run or source record
produced, and MUST NOT cite a source record that does not exist or does not contain the cited
value.

#### Scenario: EVA-4.1 — Provenance present and locatable
- **GIVEN** a `VERIFIED` change's evidence record citing a unit-test count
- **WHEN** a reviewer follows the `source` path and the cited evidence
- **THEN** the source `verification.md` exists and records that count
- **AND** the cited value matches the source

#### Scenario: EVA-4.2 — Missing evidence
- **GIVEN** a `VERIFIED` change whose evidence record has no `source`, or whose cited `source` does
  not exist, or whose cited value is absent from the source
- **WHEN** a reviewer validates provenance
- **THEN** the record fails the provenance requirement
- **AND** the archive is not complete and the program is `NOT READY`

#### Scenario: EVA-4.3 — Fabricated result rejected
- **GIVEN** a recorded result (e.g. a unit-test count) that no run or source record produced, or a
  citation to a nonexistent record
- **WHEN** a reviewer audits the archive
- **THEN** the fabricated result is identified and the archive is rejected as invalid

## Error and failure behavior

- A missing or duplicate record is an EVA-2/EVA-3 completeness failure.
- A `VERIFIED` record without provenance, or with provenance to a nonexistent/incorrect source, is
  an EVA-4 failure and prevents `READY`.
- A false completeness statement (EVA-3.2) is a hard failure.
- A record that reports results not produced by a run is fabricated evidence (EVA-4.3), a critical
  integrity failure that prevents `READY`.
- Any `src/`/`tests/` modification is a hard failure of the documentation-only constraint.

## Performance and resource bounds

No runtime performance applies. The archive is bounded by the 250 change catalog plus the six
manifest-level artifacts; the completeness statement makes any growth visible. Archive assembly
and audit are one-off authoring steps, not committed.

## Compatibility and migration

Additive documentation only. No public data, save format, protocol, module, or symbol changes; no
migration. The archive reads, never rewrites, the per-change `verification.md` files and
`PROGRAM_STATE.*`. The heterogeneous historical `validationResults` entries are preserved as-is;
the archive provides a stable, consolidated form.

## Security and integrity

Evidence integrity is the security-relevant property: results and citations MUST come from existing
records, never invented. The archive SHALL NOT alter any change's `verification.md` and SHALL NOT
modify `PROGRAM_STATE.*` beyond the standard end-of-change checkpoint.

## Observability

The `README.md` completeness statement and the per-record provenance make missing evidence and
unsourced results visible. The `Status` field of each record distinguishes `VERIFIED` (evidence
present) from `DEFERRED` (decision present), so a reviewer sees exactly which records are complete
and which carry decisions.

## Verification mapping

Reviewers verify EVA-1–EVA-4 by inspecting `openspec/evidence/` (structure, per-change records,
completeness statement) and by following provenance citations to the originating
`verification.md` files. Results are recorded in change 250's `verification.md` under
`Requirement evidence` (one row per requirement) and `Edge/adversarial validation` (missing-record,
missing-source, duplicate-record, false-completeness, and fabricated-result cases).
