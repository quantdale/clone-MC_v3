# Design: 248-parity-matrix-reconciliation

## Context / current state

`MINECRAFT_PARITY_MASTER_PLAN.md` §2.3 defines five parity categories and mandates "Maintain a
`PARITY_MATRIX.md` later with feature, reference behavior, local implementation, tests, known
differences, and status." As of change 248 the ordered sequence in `CHANGE_SEQUENCE.md` has
produced and VERIFIED changes 001–247, each with a narrow outcome and a `verification.md` that
records requirement-evidence and command results. **No `PARITY_MATRIX.md` exists** (confirmed by
glob at authoring time), so the master plan's mandated parity-tracking artifact is still missing.
There is no existing document that (a) enumerates the complete planned feature set, (b) assigns
each to one of the five categories, and (c) ties each assignment to the recorded verification
evidence.

This change is the penultimate hardening step: it produces that matrix as a documentation-only
artifact. It does not change production code, does not add test files, and does not re-run or
re-derive verification — it *consumes* the verification already recorded in the 001–247
`verification.md` files and `PROGRAM_STATE.*`.

## Target state

A repository-root `PARITY_MATRIX.md` that is the authoritative program-level parity reconciliation:

- Declares a matrix schema version and generation date.
- States the source-of-truth documents it derives from.
- Fixes the five-category taxonomy with normative definitions and decision rules.
- Contains exactly one row per planned feature (FeatureId, Feature, Change, MasterPlan §,
  Category, Reference behavior, Local implementation, Evidence, Known differences, Status).
- Carries per-category summary counts and a coverage statement.

Every assignment is auditable: a reviewer can re-derive a row's category from its cited evidence
and the decision rules without guessing.

## Invariants

- **Complete**: every planned feature in the catalog appears in exactly one row. The catalog is
  the union of (a) each change 001–250 narrow outcome in `CHANGE_SEQUENCE.md` and (b) any
  master-plan feature that is not represented by a change (e.g. a master-plan section item with no
  implementing change). There are no unclassified planned features and no orphan rows.
- **Exhaustive over changes**: every VERIFIED change 001–247 maps to at least one feature row.
- **Evidence-backed**: every row categorized `exact`, `equivalent`, or `approx` cites at least one
  existing, VERIFIED evidence artifact. No such row may be assigned without a citation.
- **Rationale-backed**: every row categorized `deferred` or `out-of-scope` carries a non-empty
  rationale and requires no evidence citation.
- **Non-contradictory**: no row's category contradicts its cited evidence; category assignment
  follows the decision rules in the `parity-matrix` spec.
- **Documentation-only**: the change adds/edits only `.md` files; no `src/` or `tests/` file is
  added or modified.
- **No fabricated evidence**: every evidence citation resolves to an artifact that exists and is
  VERIFIED at implementation time.

## API and data model

The "artifact" is the `PARITY_MATRIX.md` document. Its normative schema (the contract) is:

```md
# Parity Matrix

- Matrix schema version: `v1`
- Generation date: <ISO date>
- Source of truth: MINECRAFT_PARITY_MASTER_PLAN.md (features, taxonomy), CHANGE_SEQUENCE.md
  (narrow outcomes), openspec/PROGRAM_STATE.* (VERIFIED status), each change's verification.md
  (evidence).

## Taxonomy and decision rules
<the five categories, definitions, and decision rules from the parity-matrix spec>

## Features
| FeatureId | Feature | Change | MasterPlan § | Category | Reference behavior | Local implementation | Evidence | Known differences | Status |
|---|---|---|---|---|---|---|---|---|---|
| ... one row per planned feature ... |

## Summary
- exact: <n>  equivalent: <n>  approx: <n>  deferred: <n>  out-of-scope: <n>
- Coverage: <all planned features classified; all VERIFIED changes mapped>
```

**FeatureId** is stable and machine-checkable:
- `C<changeNumber>` for features that ARE a change narrow outcome, e.g. `C021` for the
  section-coordinate-model change. Because a single change may contain multiple master-plan
  features, `C<number>-<seq>` disambiguates the second, third, ... feature of a change
  (e.g. `C084-01`, `C084-02`).
- `MP-<section>-<seq>` for master-plan features that are **not** represented by any change, e.g.
  a Realms/service feature. These are categorized `out-of-scope` (or `deferred` if genuinely
  roadmap-planned with no change yet).

**Category** ∈ { `exact`, `equivalent`, `approx`, `deferred`, `out-of-scope` }.

**Evidence** is a citation string resolving to an existing VERIFIED artifact. Allowed forms:
- `verification.md <path>:<REQ-x or line>` — a requirement-evidence table cell/row of a change that
  is VERIFIED at implementation time;
- `<test file path>:<requirement name or line range>` — a named test the change's verification
  maps to a PASS requirement;
- `<command>: PASS` — a recorded baseline-command result in a VERIFIED change's verification.md
  (e.g. `npm test: PASS`).

**Status** ∈ { `tracked`, `needs_review`, `blocked_on_evidence`, `blocked_on_rationale` }. A row is
`tracked` only when its category satisfies the decision rule, its evidence (or rationale) satisfies
the requirements, and no contradiction is flagged. Any other state must be resolved before the
matrix is considered valid.

## Control / data flow

1. **Catalog build** — from `CHANGE_SEQUENCE.md`, expand every narrow outcome (001–250) into a
   candidate feature keyed by change number; from `MINECRAFT_PARITY_MASTER_PLAN.md`, walk its
   feature-bearing sections (§2–§28) and add any feature not covered by a change as
   `MP-<section>-<seq>`. Record each feature's implementing change and master-plan section.
2. **Evidence index** — read each VERIFIED change's `verification.md` and extract its
   requirement-evidence rows and command results into an index keyed by change number. This index
   is the only permitted evidence source.
3. **Classify** — for each feature, apply the decision rules to assign exactly one category, using
   the evidence index for `exact`/`equivalent`/`approx` and a documented rationale for
   `deferred`/`out-of-scope`.
4. **Assemble** — write `PARITY_MATRIX.md` per the schema with one row per feature and summary
   counts.
5. **Validate** — run the validation checks (category-boundary, evidence resolution,
   missing-evidence, contradictory-evidence, coverage) from the `parity-matrix`/`parity-evidence`
   specs; resolve or record every flagged item.
6. **Gate** — confirm no `src/`/`tests/` change and run the baseline regression gate.

## Detailed behavior

**Feature catalog derivation.** The primary granularity is the change narrow outcome: each change
is one planned feature (or, when a change bundles multiple master-plan features, several rows
sharing the change number). Master-plan sections are the secondary source; any feature they name
that no change implements is still required to appear, categorized `deferred` (roadmap-planned,
not yet scheduled) or `out-of-scope` (proprietary/service-dependent). This guarantees the matrix
covers the whole plan, not just what was built.

**Category decision rules (normative, from the parity-matrix spec):**
- `exact` — the feature's core rules intentionally match Java and the evidence shows no known
  functional difference within the tested scope.
- `equivalent` — same gameplay role as Java, but the local implementation deliberately differs
  (different seam, data structure, or mechanism) yet preserves the gameplay role.
- `approx` — the local behavior cannot match Java exactly because of a browser/rendering/resource
  constraint; a known difference is documented and backed by evidence of the constraint.
- `deferred` — planned for the roadmap but not in the current milestone; no VERIFIED implementing
  change; rationale (which roadmap intent) required.
- `out-of-scope` — proprietary/service-dependent or intentionally not part of this product
  (e.g. official Realms infrastructure); rationale required.

**Decision-rule boundaries (how a reviewer disambiguates):**
- `exact` vs `equivalent`: if the local implementation uses a non-Java mechanism but the observable
  gameplay role is preserved, it is `equivalent`, not `exact`. `exact` is reserved for cases where
  the core rules match Java with no known difference in the tested scope.
- `equivalent` vs `approx`: if the difference is imposed by a browser/render/resource limit that
  implementation effort cannot remove, it is `approx`; if it is a deliberate implementation choice
  that could in principle match Java, it is `equivalent`.
- `deferred` vs `out-of-scope`: `deferred` = roadmap-intended and may be added later;
  `out-of-scope` = never intended (proprietary/service/infrastructure).

**Evidence binding.** For `exact`/`equivalent`/`approx`, at least one evidence citation MUST
resolve to an existing, VERIFIED artifact (verification.md row/test/command). The cited artifact
must belong to a change that is VERIFIED in `PROGRAM_STATE.json` at implementation time. Evidence
is never authored in the matrix; it is copied as a citation.

**Validation procedure (executed by the implementer, not shipped).** The implementer runs each
check over the finished matrix and records the result in `verification.md`. Checks may be performed
by a throwaway Node script under a scratch path or by a documented manual review pass; either way
the evidence for each check is the named matrix rows and the cited verification records. No
validation code is committed as production code or a test file.

## Failure modes

- **Missing evidence** — a row categorized `exact`/`equivalent`/`approx` with an empty or
  unresolvable evidence citation. MUST be flagged `blocked_on_evidence` and resolved (add a valid
  citation or re-categorize).
- **Unresolvable citation** — the citation points to a file/row that does not exist or a change
  that is not VERIFIED. MUST be flagged `blocked_on_evidence`; a fabricated or self-authored
  citation is a spec violation.
- **Contradictory evidence** — evidence contradicts the category (e.g. a row marked `exact` whose
  cited verification records a known difference, or a row marked `approx` with no documented
  constraint). MUST be flagged `needs_review` and re-categorized or re-evidenced.
- **Unclassified / orphan row** — a planned feature with no row, or a row not traceable to any
  planned feature. MUST be flagged and corrected; completeness is an invariant.
- **Boundary misassignment** — a category that fails the decision rule (e.g. `exact` where the
  implementation is a deliberate non-Java mechanism). MUST be flagged by category-boundary
  validation.
- **Scope leak** — any `src/` or `tests/` modification. This is a hard failure of the
  documentation-only constraint, caught by the scope check and regression gate.

## Compatibility / migration

Additive documentation. No public data, save format, network protocol, module, or symbol changes.
No migration. The end-of-change `PROGRAM_STATE.json`/`.md` update records 248's own state but does
not alter earlier changes' records.

## Performance / resource constraints

None for runtime (no production code). The validation procedure is a one-off authoring/audit step;
it must not be committed as part of the shipped bundle. The matrix size is bounded by the planned
feature count (≈ the 250 change outcomes plus master-plan-only features); summary counts and a
coverage statement are required so growth is visible.

## Testing seams

Because this is documentation-only, there are no unit-test files. The seams are the **validation
checks** specified in the `parity-matrix` and `parity-evidence` specs, each of which a reviewer can
re-run by hand over the matrix and the cited verification records:

- catalog completeness (every planned feature → exactly one row; every VERIFIED change → ≥1 row);
- category-boundary conformance (every row satisfies its category's decision rule);
- evidence resolution (every `exact`/`equivalent`/`approx` citation resolves to an existing,
  VERIFIED artifact);
- missing-evidence detection (rows categorized without citation);
- contradictory-evidence detection (category vs evidence conflict);
- documentation-only scope check (no `src/`, no `tests/` diffs).

## Observability / debugging

`PARITY_MATRIX.md` is the observability surface: row status values surface unresolved items
(`needs_review`, `blocked_on_evidence`, `blocked_on_rationale`) so problems are visible in the
document itself. The validation checks produce a per-row list of flagged violations recorded in
`verification.md`, so a later reviewer sees exactly which rows were questioned and how they were
resolved.

## Affected files / symbols

- `PARITY_MATRIX.md` (NEW, repository root).
- This OpenSpec package (proposal/design/tasks/verification/specs).
- `openspec/PROGRAM_STATE.json` and `openspec/PROGRAM_STATE.md` updated at the standard
  end-of-change checkpoint (state only; the matrix artifact does not edit them).
- No `src/` and no `tests/` file is created or modified.

## Rejected alternatives

- *A `src/` module + unit tests for the matrix* — rejected: 248 is a documentation/evidence change;
  adding production code or tests contradicts the change's nature and risks scope creep. Validation
  is an auditable review/scratch-script procedure instead.
- *Store the matrix inside `openspec/changes/248/` only* — rejected: the master plan names the
  artifact `PARITY_MATRIX.md`, and a repository-root location makes it the program-level document
  (matching `MINECRAFT_PARITY_MASTER_PLAN.md` and `FULL_AUDIT_REPORT.md`).
- *Re-derive behavior by running the suite for every feature* — rejected: the matrix consumes the
  already-recorded VERIFIED evidence rather than re-running it, avoiding duplication and
  fabrication risk.

## Downstream dependencies

`250-final-program-verification` consumes the categorized matrix and its evidence as a source for
the final release-readiness decision. `249-whole-codebase-adversarial-audit` may use the matrix to
spot features categorized `exact`/`equivalent` whose evidence is thin. The matrix must remain
consistent with `PROGRAM_STATE.*` and the change sequence; a future change that re-categorizes a
feature MUST update the matrix row and its status in the same change.
