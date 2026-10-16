# Tasks: 248-parity-matrix-reconciliation

Documentation-only change. No production code and no test files are created or modified. Checkboxes
mark tasks whose implementation exists and whose evidence is recorded in `verification.md`.

## 1. Baseline and feature characterization

- [x] 1.1 Enumerate the complete planned-feature catalog from `CHANGE_SEQUENCE.md` (every narrow
  outcome 001–250) and `MINECRAFT_PARITY_MASTER_PLAN.md` feature-bearing sections; assign each a
  stable `FeatureId` (`C<number>` / `C<number>-<seq>` for change features, `MP-<section>-<seq>` for
  master-plan-only features) and record its implementing change and master-plan section.
- [x] 1.2 Read every VERIFIED change's `verification.md` (001–247) and build a per-change evidence
  index of requirement-evidence rows and recorded command results; confirm each indexed change is
  VERIFIED in `PROGRAM_STATE.json`.
- [x] 1.3 Record the category decision rules (exact/equivalent/approx/deferred/out-of-scope),
  their boundary disambiguation, and the evidence vs rationale requirements in the matrix header.

## 2. Matrix assembly (implementation)

- [x] 2.1 Create `PARITY_MATRIX.md` at the repository root with schema version, generation date,
  source-of-truth references, and the five-category taxonomy + decision rules.
- [x] 2.2 Populate every `exact` and `equivalent` row with reference behavior, local
  implementation, at least one evidence citation resolving to a VERIFIED artifact, known
  differences, and status.
- [x] 2.3 Populate every `approx` row with reference behavior, the browser/render/resource
  constraint, evidence of the constraint, the documented known difference, and status.
- [x] 2.4 Populate every `deferred` row with the roadmap rationale and every `out-of-scope` row
  with the proprietary/service rationale (no evidence citation required for either).
- [x] 2.5 Add per-category summary counts and a coverage statement (every planned feature in
  exactly one row; every VERIFIED change 001–247 maps to at least one row).

## 3. Validation (focused checks + edge/failure)

- [x] 3.1 Category-boundary validation: verify every row's category satisfies its decision rule
  (exact-vs-equivalent, equivalent-vs-approx, deferred-vs-out-of-scope), flagging boundary
  misassignments.
- [x] 3.2 Evidence-resolution validation: verify every `exact`/`equivalent`/`approx` citation
  resolves to an existing, VERIFIED artifact (verification.md row, named test, or recorded
  command); no fabricated or self-authored citation.
- [x] 3.3 Missing-evidence check: flag every `exact`/`equivalent`/`approx` row lacking a valid
  citation as `blocked_on_evidence`; resolve or re-categorize before completion.
- [x] 3.4 Contradictory-evidence check: flag any row whose category conflicts with its cited
  evidence (e.g. `exact` with a recorded known difference, `approx` with no constraint) as
  `needs_review`; resolve before completion.

## 4. Integration, regression, and final gate

- [x] 4.1 Coverage cross-check: confirm the catalog ↔ matrix bijection (every planned feature in
  exactly one row, no orphan rows) and that every VERIFIED change 001–247 maps to at least one
  feature row.
- [x] 4.2 Documentation/state reconciliation: run the final reconciliation step (re-read the
  artifacts against the produced matrix), update `openspec/PROGRAM_STATE.json` and
  `openspec/PROGRAM_STATE.md`, and mark this change's status.
  (Reconciliation done; this change is marked VERIFYING in its `verification.md`. The
  `PROGRAM_STATE.json`/`PROGRAM_STATE.md` flip to VERIFIED happens at the parent's final-gate
  advancement, per session scope.)
- [x] 4.3 Baseline regression gate: run `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e` (must match the pre-change baseline) and confirm via diff
  inspection that no `src/` or `tests/` file was added or modified.
  (Fast gates run here: typecheck PASS, lint PASS, unit PASS 292 files / 3827 passed + 1 skipped
  = baseline; src/tests diff clean. `npm run build` / `npm run test:e2e` are run by parent in
  final gate.)
