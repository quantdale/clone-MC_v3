# Spec: parity-matrix

## Contract

This spec governs the `PARITY_MATRIX.md` artifact produced by change 248. It defines the document
structure, the five-category taxonomy, the category decision rules and their boundaries, the
per-row schema, and the completeness invariants. The evidence-sourcing and evidence-validation
contract lives in the sibling `parity-evidence` spec; the two are consumed together by a reviewer
who must be able to re-derive every row's category from its cited evidence.

The document is documentation-only: it MUST NOT be accompanied by any production code or test file,
and the change MUST NOT modify any `src/` or `tests/` file.

## Definitions

- **Planned feature** — a unit of planned Minecraft behavior from `MINECRAFT_PARITY_MASTER_PLAN.md`
  or `CHANGE_SEQUENCE.md`. The primary granularity is a change narrow outcome; master-plan features
  not represented by any change are also planned features.
- **FeatureId** — a stable identifier: `C<number>` or `C<number>-<seq>` for change features;
  `MP-<section>-<seq>` for master-plan-only features.
- **Evidence artifact** — a locatable record that already exists and is VERIFIED: a
  `verification.md` requirement-evidence row, a named test, or a recorded command result (see the
  `parity-evidence` spec for citation forms).
- **Rationale** — non-empty prose justifying a `deferred` or `out-of-scope` assignment (roadmap
  intent, or proprietary/service dependency).
- **Status** — per-row state ∈ { `tracked`, `needs_review`, `blocked_on_evidence`,
  `blocked_on_rationale` }.

## Invariants

- Every planned feature appears in exactly one row (no duplicates, no omissions).
- Every row has exactly one category from { `exact`, `equivalent`, `approx`, `deferred`,
  `out-of-scope` }.
- No row is an orphan: each row is traceable to a planned feature.
- Rows categorized `exact`, `equivalent`, or `approx` carry at least one evidence citation; rows
  categorized `deferred` or `out-of-scope` carry a non-empty rationale and require no citation.
- No row's category contradicts its evidence; each category satisfies its decision rule.
- The matrix declares its schema version and the source-of-truth documents it derives from.

## Requirements

### Requirement: PM-1 — Matrix document and header

The change SHALL create a file `PARITY_MATRIX.md` at the repository root. The document SHALL open
with a header declaring: a matrix schema version (e.g. `v1`), a generation date, and the
source-of-truth documents (master plan, change sequence, program state, verification records) from
which it is derived. The change MUST NOT modify any `src/` or `tests/` file.

#### Scenario: PM-1.1 — Document exists with header
- **GIVEN** a repository on change 248
- **WHEN** a reviewer locates `PARITY_MATRIX.md`
- **THEN** the file exists at the repository root
- **AND** its header contains a matrix schema version, a generation date, and the source-of-truth
  document references

#### Scenario: PM-1.2 — Documentation-only constraint
- **GIVEN** the committed diff for change 248
- **WHEN** the diff is inspected for `src/` and `tests/` paths
- **THEN** no `src/` file and no `tests/` file is added or modified
- **AND** the only non-OpenSpec file added is `PARITY_MATRIX.md`

#### Scenario: PM-1.3 — Missing header
- **GIVEN** a `PARITY_MATRIX.md` that opens without a schema version or source-of-truth reference
- **WHEN** a reviewer validates the document
- **THEN** the document is rejected as invalid (the header is mandatory)

### Requirement: PM-2 — Category taxonomy

The matrix SHALL define exactly the five categories `exact`, `equivalent`, `approx`, `deferred`,
and `out-of-scope`, each with a normative definition and decision rule, and SHALL assign every
planned feature to exactly one of them.

#### Scenario: PM-2.1 — Taxonomy completeness
- **GIVEN** the taxonomy section of `PARITY_MATRIX.md`
- **WHEN** a reviewer enumerates the categories it defines
- **THEN** exactly the five categories `exact`, `equivalent`, `approx`, `deferred`, and
  `out-of-scope` are defined
- **AND** no other category appears in any row

#### Scenario: PM-2.2 — Single assignment
- **GIVEN** a planned feature `F` appearing in the matrix
- **WHEN** a reviewer searches all rows for `F`
- **THEN** `F` appears in exactly one row with exactly one category

#### Scenario: PM-2.3 — Unknown category
- **GIVEN** a row whose `Category` cell is not one of the five defined categories
- **WHEN** a reviewer validates the row
- **THEN** the row is rejected as invalid and flagged for correction

### Requirement: PM-3 — Per-row schema

Each row SHALL contain the columns: `FeatureId`, `Feature`, `Change` (implementing change number,
or `—` for master-plan-only features), `MasterPlan §`, `Category`, `Reference behavior`, `Local
implementation`, `Evidence`, `Known differences`, and `Status`. The `FeatureId`, `Category`, and
`Status` cells SHALL be machine-checkable (exact values, not free-form prose).

#### Scenario: PM-3.1 — Full row columns present
- **GIVEN** a completed matrix
- **WHEN** a reviewer inspects any feature row
- **THEN** the row has a value for every one of the ten columns
- **AND** `Category` is one of the five defined values and `Status` is one of the four defined
  values

#### Scenario: PM-3.2 — Missing column
- **GIVEN** a row missing any of the ten columns (e.g. no `Evidence` value)
- **WHEN** a reviewer validates the row
- **THEN** the row is rejected as invalid

### Requirement: PM-4 — Category decision rules

A row's category SHALL be assigned according to the decision rules:
- `exact` — the core rules intentionally match Java and the evidence shows no known functional
  difference within the tested scope.
- `equivalent` — the feature has the same gameplay role as Java but the local implementation
  deliberately differs (mechanism, seam, or data structure) while preserving the role.
- `approx` — exact Java behavior is prevented by a browser/rendering/resource constraint, and a
  known difference is documented.
- `deferred` — roadmap-planned but not in the current milestone; no VERIFIED implementing change.
- `out-of-scope` — proprietary/service-dependent or intentionally not part of this product.

#### Scenario: PM-4.1 — Exact requires Java-rule match
- **GIVEN** a feature whose local implementation uses a deliberately different mechanism but the
  evidence shows a preserved gameplay role
- **WHEN** the category decision rule is applied
- **THEN** the category MUST be `equivalent`, not `exact`

#### Scenario: PM-4.2 — Approx requires a documented constraint
- **GIVEN** a feature whose evidence documents a browser/rendering/resource constraint and a known
  difference caused by it
- **WHEN** the category decision rule is applied
- **THEN** the category MUST be `approx`
- **AND** a row marked `approx` with no documented constraint is invalid

#### Scenario: PM-4.3 — Deferred vs out-of-scope boundary
- **GIVEN** a feature with no VERIFIED implementing change
- **WHEN** the feature is roadmap-planned and may be added later
- **THEN** it MUST be categorized `deferred` with a roadmap rationale
- **AND** when the feature is proprietary/service-dependent (e.g. official Realms infrastructure)
  it MUST instead be categorized `out-of-scope` with a proprietary/service rationale

### Requirement: PM-5 — Completeness over the catalog

The matrix SHALL contain one row for every planned feature in the catalog (all change narrow
outcomes 001–250 and every master-plan feature not represented by a change), and SHALL state
per-category summary counts and a coverage statement. No row MAY be an orphan (a row not traceable
to a planned feature).

#### Scenario: PM-5.1 — Every change outcome is covered
- **GIVEN** the catalog of change narrow outcomes 001–250
- **WHEN** a reviewer maps each outcome to a matrix row
- **THEN** every outcome is found in exactly one row

#### Scenario: PM-5.2 — Every master-plan feature is covered
- **GIVEN** a master-plan feature `G` that no change implements
- **WHEN** a reviewer searches the matrix for `G`
- **THEN** `G` appears in exactly one row categorized `deferred` or `out-of-scope`

#### Scenario: PM-5.3 — Orphan row rejected
- **GIVEN** a matrix row whose `Feature` and `MasterPlan §` trace to no planned feature
- **WHEN** a reviewer validates completeness
- **THEN** the row is flagged as an orphan and MUST be removed or re-traced

#### Scenario: PM-5.4 — Summary counts present
- **GIVEN** a completed matrix
- **WHEN** a reviewer reads the summary section
- **THEN** the summary lists a count for each of the five categories and states that all planned
  features are classified

## Error and failure behavior

- A row categorized `exact`/`equivalent`/`approx` without a valid evidence citation is a
  `blocked_on_evidence` failure (see `parity-evidence` REQ-PE-3).
- A `deferred`/`out-of-scope` row with an empty rationale is a `blocked_on_rationale` failure; it
  MUST be rejected until a rationale is added.
- A category that contradicts the decision rule (PM-4) or the cited evidence is a `needs_review`
  failure and MUST be resolved before the matrix is considered valid.
- Any `src/`/`tests/` modification is a hard failure of the documentation-only constraint
  (PM-1.2).

## Performance and resource bounds

No runtime performance applies (no production code). The matrix size is bounded by the planned
feature count (≈ the 250 change outcomes plus master-plan-only features); the summary-count and
coverage requirements make growth visible. The validation procedure is a one-off authoring/audit
step and is not committed.

## Compatibility and migration

Additive documentation only. No public data, save format, protocol, module, or symbol changes; no
migration. The matrix is compatible with future changes that re-categorize a feature provided they
update the row and its status in the same change.

## Security and integrity

Evidence integrity is the security-relevant property: categories and citations MUST come from
existing VERIFIED records, never fabricated or self-authored (see `parity-evidence`). The matrix
SHALL NOT modify `PROGRAM_STATE.*` beyond the standard end-of-change checkpoint and SHALL NOT alter
any change's `verification.md`.

## Observability

Per-row `Status` surfaces unresolved items (`needs_review`, `blocked_on_evidence`,
`blocked_on_rationale`), so a reviewer sees exactly which rows are questioned. The header states
the sources of truth and generation date for provenance.

## Verification mapping

Reviewers verify PM-1–PM-5 by inspecting `PARITY_MATRIX.md` (header, taxonomy, row schema,
decision-rule conformance, catalog coverage, summary) and the cited evidence. Check results are
recorded in change 248's `verification.md` under `Requirement evidence` (one row per requirement)
and `Edge/adversarial validation` (boundary, missing-rationale, orphan, and scope-leak cases).
