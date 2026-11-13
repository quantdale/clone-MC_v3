# Spec: parity-state-validation

## Contract

When a parity matrix is present, the state validator MUST reject an omitted or non-VERIFIED row for every numbered change explicitly recorded VERIFIED, and MUST enforce the summary counts irrespective of ordinary Markdown emphasis. Absence of the optional matrix in synthetic state roots remains supported.

## Definitions

A verified numbered identity is a `NNN-...` value in a `validationResults` entry with `status: VERIFIED`, the `currentChange` when `currentChangeStatus: VERIFIED`, or `lastCompletedChange`. Matrix change IDs are `CNNN`. Summary counts include distinct change and master-plan rows.

## Invariants

The existing 001–250 row requirement and duplicate-row checks remain. C258 remains deferred unless state explicitly records it VERIFIED; this change MUST NOT fabricate hardware evidence. No production or save-schema changes.

## Requirements

### Requirement: R1 all explicitly verified changes have verified rows

For each verified numbered identity the matrix MUST contain exactly one corresponding row with status VERIFIED. `lastCompletedChange` MUST be checked regardless of current status. A current non-VERIFIED change MUST NOT be treated as verified solely because it is current.

#### Scenario: post-250 verified row missing
- **GIVEN** a coherent active state whose last-completed change is 305 and a matrix with no C305 row but correct remaining summary counts
- **WHEN** the real validator runs
- **THEN** it exits 1 and names C305.

#### Scenario: other verified sources and active current
- **GIVEN** a VERIFIED current change or VERIFIED validation result whose row is missing or has a non-VERIFIED status
- **WHEN** validation runs
- **THEN** it exits 1 naming that row
- **AND** an unrelated ACTIVE current change does not itself require a VERIFIED row.

### Requirement: R2 summary total and category counts are enforced

The validator MUST recognize plain or simply bolded Markdown summary labels and numeric values. Exactly one total and exactly one numeric summary entry for each category present MUST exist and equal the actual row counts. Missing, malformed, duplicate, or mismatched required counts MUST fail.

#### Scenario: bold total is incorrect
- **GIVEN** a valid matrix except `**Total rows** | **1**` where the actual count is greater
- **WHEN** validation runs
- **THEN** it exits 1 reporting the total mismatch.

#### Scenario: malformed or missing required counts
- **GIVEN** a matrix with a missing, duplicated, nonnumeric or incorrect total or represented-category count
- **WHEN** validation runs
- **THEN** it exits 1 identifying the invalid count.

#### Scenario: valid summary styles
- **GIVEN** coherent plain and bold summary tables
- **WHEN** validation runs
- **THEN** both exit 0.

### Requirement: R3 preserve existing validation and deferred evidence

Existing duplicate and 001–250 matrix checks MUST remain enforced. A valid C258 deferred row MUST remain accepted when C258 is not recorded VERIFIED. A synthetic root without a matrix MUST retain prior behavior.

#### Scenario: C258 deferred
- **GIVEN** a coherent matrix with C258 deferred and no VERIFIED C258 identity
- **WHEN** validation runs
- **THEN** the deferred status alone does not cause failure.

#### Scenario: no optional matrix
- **GIVEN** an otherwise valid synthetic state root without `PARITY_MATRIX.md`
- **WHEN** validation runs
- **THEN** existing state checks operate unchanged.

## Error and failure behavior

Exit 1 names the missing/invalid row or summary category/total; no false green on malformed required summary data.

## Performance and resource bounds

Linear scan of the state and matrix; current real-tree 30-second validator timeout remains.

## Compatibility and migration

No game, user data, protocol or dependency changes; coherent current matrix remains accepted. Existing synthetic roots without matrices remain accepted.

## Security and integrity

The validator is read-only and does not manufacture or infer headed hardware evidence.

## Observability

Errors report the exact C-number or summary label and expected/actual values when available.

## Verification mapping

| Requirement | Evidence |
| --- | --- |
| R1 | Failing-first real CLI fixture for omitted C305; synthetic current/last-completed/historical status tests |
| R2 | Failing-first real CLI fixture for bold total 1; synthetic valid/invalid numeric, missing and duplicate count tests |
| R3 | Real-tree `validate-state`, synthetic deferred C258 and existing no-matrix/duplicate/001–250 regression tests, full mandatory gates |
