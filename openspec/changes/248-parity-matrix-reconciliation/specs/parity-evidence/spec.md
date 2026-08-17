# Spec: parity-evidence

## Contract

This spec governs how `PARITY_MATRIX.md` (see the sibling `parity-matrix` spec) sources, cites, and
validates evidence so that every category assignment is auditable. It defines the permitted
evidence artifacts and citation forms, the evidence-binding rules for `exact`/`equivalent`/`approx`
rows, the coverage invariant over VERIFIED changes, and the missing-evidence and
contradictory-evidence handling. A reviewer must be able to independently resolve every citation and
re-derive each row's category from the cited evidence.

This is a documentation-only change: the matrix consumes existing VERIFIED records and never
fabricates, re-runs, or self-authors evidence.

## Definitions

- **Evidence artifact** — a locatable record that already exists and is VERIFIED at implementation
  time: a `verification.md` requirement-evidence row, a named test that a requirement maps to a
  PASS, or a recorded command result in a VERIFIED change's `verification.md`.
- **Citation** — the evidence string in a matrix row that resolves to an evidence artifact.
- **VERIFIED change** — a change whose status is VERIFIED in `openspec/PROGRAM_STATE.json` at
  implementation time.
- **Rationale** — non-empty prose (roadmap intent or proprietary/service dependency) for
  `deferred`/`out-of-scope` rows; not an evidence citation.

## Invariants

- Every `exact`/`equivalent`/`approx` row has at least one citation that resolves to an existing,
  VERIFIED evidence artifact.
- No citation is fabricated or self-authored inside the matrix; citations reference prior artifacts
  verbatim.
- A citation that does not resolve (missing file/row, or a change not VERIFIED) invalidates the
  row until fixed.
- A category that contradicts its evidence invalidates the row until re-categorized or re-cited.
- Every VERIFIED change 001–247 maps to at least one feature row; evidence is scoped to the change
  that implements the feature.

## Requirements

### Requirement: PE-1 — Permitted evidence artifacts and citation forms

A citation in an `exact`/`equivalent`/`approx` row SHALL resolve to exactly one of: (a) a
`verification.md` requirement-evidence cell/row of a VERIFIED change, referenced as
`<path to verification.md>:<REQ-x or line>`; (b) a named test mapped to a PASS requirement in a
VERIFIED change, referenced as `<test file>:<requirement name or line range>`; or (c) a recorded
command result in a VERIFIED change's `verification.md`, referenced as `<command>: PASS`. Citations
SHALL point at artifacts that exist and belong to a VERIFIED change.

#### Scenario: PE-1.1 — Citation resolves to a verification row
- **GIVEN** a matrix row citing `<change>/verification.md:REQ-3`
- **WHEN** a reviewer opens that `verification.md` at `REQ-3`
- **THEN** the row exists in the requirement-evidence table and is marked PASS
- **AND** the containing change is VERIFIED in `PROGRAM_STATE.json`

#### Scenario: PE-1.2 — Citation resolves to a named test
- **GIVEN** a matrix row citing `<test file>:<requirement name>`
- **WHEN** a reviewer opens the named test
- **THEN** the test exists and its containing change's verification maps it to a PASS requirement

#### Scenario: PE-1.3 — Citation resolves to a recorded command result
- **GIVEN** a matrix row citing `<command>: PASS`
- **WHEN** a reviewer opens the change's `verification.md` commands table
- **THEN** the command is recorded as PASS in a VERIFIED change

#### Scenario: PE-1.4 — Unsupported citation form
- **GIVEN** a citation that matches none of the three permitted forms (e.g. a bare URL or a URL to
  an external site, or a self-authored observation)
- **WHEN** a reviewer validates the citation
- **THEN** the citation is rejected and the row is flagged `blocked_on_evidence`

### Requirement: PE-2 — Evidence binding for categorized rows

Every row categorized `exact`, `equivalent`, or `approx` SHALL carry at least one valid citation
(per PE-1) before it may be assigned a final `Status` of `tracked`. A row with no valid citation
SHALL NOT be categorized `exact`/`equivalent`/`approx`.

#### Scenario: PE-2.1 — Evidence required for non-deferred rows
- **GIVEN** a feature whose row has a non-empty `Category` of `exact`
- **WHEN** a reviewer checks the row's `Evidence` cell
- **THEN** the `Evidence` cell contains at least one citation that resolves to a VERIFIED artifact

#### Scenario: PE-2.2 — Deferred/out-of-scope need rationale, not evidence
- **GIVEN** a row categorized `deferred`
- **WHEN** a reviewer checks the row
- **THEN** the row carries a non-empty `Rationale`-supporting `Known differences`/`Reference
  behavior` text or documented rationale
- **AND** the row is not required to carry an evidence citation

#### Scenario: PE-2.3 — Categorized without evidence
- **GIVEN** a row categorized `equivalent` whose `Evidence` cell is empty or contains only a
  self-authored observation
- **WHEN** a reviewer validates the row
- **THEN** the row is flagged `blocked_on_evidence` and MUST NOT be `tracked`

### Requirement: PE-3 — Missing-evidence handling

A feature whose implementing change is VERIFIED but whose row has no valid citation SHALL be
flagged `blocked_on_evidence`. The implementer SHALL either add a valid citation (re-deriving it
from the change's `verification.md`) or re-categorize the row; the row MUST NOT be reported as
`tracked` while the gap remains.

#### Scenario: PE-3.1 — Missing citation flagged
- **GIVEN** a VERIFIED change `C` whose feature row has an empty `Evidence` cell
- **WHEN** a reviewer runs the missing-evidence check
- **THEN** the row is flagged `blocked_on_evidence`
- **AND** the check report names the row and the missing citation

#### Scenario: PE-3.2 — Gap resolved
- **GIVEN** a row flagged `blocked_on_evidence`
- **WHEN** the implementer adds a citation resolving to `C`'s `verification.md` and re-runs the
  check
- **THEN** the row is no longer flagged and may become `tracked` (subject to the other checks)

### Requirement: PE-4 — Contradictory-evidence handling

A row whose category conflicts with its cited evidence SHALL be flagged `needs_review`. In
particular, a row marked `exact` whose evidence records a known functional difference, and a row
marked `approx` whose evidence documents no browser/rendering/resource constraint, are
contradictions. The implementer SHALL re-categorize or re-cite the row; the row MUST NOT be
`tracked` while a contradiction remains.

#### Scenario: PE-4.1 — Exact with a recorded difference
- **GIVEN** a row categorized `exact` whose cited `verification.md` row documents a known
  functional difference
- **WHEN** a reviewer compares the category to the evidence
- **THEN** a contradiction is flagged (`needs_review`)
- **AND** the row MUST be re-categorized (e.g. `equivalent` or `approx`) or the evidence corrected

#### Scenario: PE-4.2 — Approx with no documented constraint
- **GIVEN** a row categorized `approx` whose evidence describes no browser/rendering/resource
  constraint
- **WHEN** a reviewer compares the category to the evidence
- **THEN** a contradiction is flagged (`needs_review`)
- **AND** the row MUST be re-categorized or a constraint documented

#### Scenario: PE-4.3 — Consistent evidence accepted
- **GIVEN** a row categorized `equivalent` whose evidence documents a deliberate non-Java mechanism
  that preserves the gameplay role
- **WHEN** a reviewer compares the category to the evidence
- **THEN** no contradiction is flagged and the row satisfies the `equivalent` decision rule

### Requirement: PE-5 — Coverage of VERIFIED changes

Every VERIFIED change 001–247 SHALL map to at least one feature row in the matrix. The evidence
cited for a row SHALL be scoped to the change that implements the feature (a row MUST NOT cite an
evidence artifact from a change that does not implement it).

#### Scenario: PE-5.1 — Every VERIFIED change maps to a row
- **GIVEN** the list of VERIFIED changes 001–247 from `PROGRAM_STATE.json`
- **WHEN** a reviewer walks each change to the matrix
- **THEN** every VERIFIED change maps to at least one row

#### Scenario: PE-5.2 — Evidence scoped to the implementing change
- **GIVEN** a feature implemented by change `C`
- **WHEN** a reviewer checks the row's citations
- **THEN** every citation resolves to an evidence artifact belonging to `C` (or to `C`'s
  verification records), not to a different change

#### Scenario: PE-5.3 — Unmapped VERIFIED change
- **GIVEN** a VERIFIED change `C` that maps to no feature row
- **WHEN** a reviewer runs the coverage check
- **THEN** the coverage check fails and `C` MUST be assigned a feature row before the matrix is
  valid

## Error and failure behavior

- Unresolvable citation (missing file/row, change not VERIFIED, or unsupported form) → PE-1
  violation, row flagged `blocked_on_evidence`.
- Missing evidence on a non-deferred row → PE-3 violation, row flagged `blocked_on_evidence`.
- Category/evidence contradiction → PE-4 violation, row flagged `needs_review`.
- VERIFIED change with no feature row → PE-5 violation, coverage fails.
- No failure is silently dropped: every flagged row and the resolution taken MUST be recorded in
  change 248's `verification.md` edge/adversarial validation section.

## Performance and resource bounds

No runtime performance applies. The evidence index and validation are a one-off authoring/audit
step, not committed. The matrix's citation count is bounded by the feature count; every non-deferred
row has at least one citation.

## Compatibility and migration

Additive documentation only. The evidence contract consumes existing VERIFIED `verification.md`
records and `PROGRAM_STATE.*`; it does not alter them. If a later change re-categorizes a feature or
its evidence changes, the matrix row and status MUST be updated in the same change.

## Security and integrity

Integrity requirement: evidence MUST be real, existing, VERIFIED, and scoped to the implementing
change. Fabricated, self-authored, or out-of-scope citations are spec violations (PE-1.4). The
matrix MUST NOT modify `PROGRAM_STATE.*` beyond the standard end-of-change checkpoint and MUST NOT
alter any change's `verification.md`.

## Observability

The evidence index and per-row citations are the audit trail. The `parity-matrix` `Status` column
surfaces `blocked_on_evidence`/`needs_review` states; the `verification.md` edge/adversarial
section records each flagged row and its resolution, so a reviewer can reproduce every decision.

## Verification mapping

Reviewers verify PE-1–PE-5 by resolving each row's citations to the named `verification.md` rows /
tests / command results and checking the category conformance and coverage invariants. Results are
recorded in change 248's `verification.md` under `Requirement evidence` (one row per requirement)
and `Edge/adversarial validation` (missing-evidence, contradictory-evidence, unsupported-form, and
unmapped-change cases).
