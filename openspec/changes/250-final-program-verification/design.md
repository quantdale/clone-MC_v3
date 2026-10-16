# Design: 250-final-program-verification

## Context/current state

At the entry commit for change 250 the repository is an active Minecraft-parity program with:

- A canonical ordered change sequence in `openspec/CHANGE_SEQUENCE.md` listing 001–250 narrow
  outcomes; 250 is the final entry.
- A per-change OpenSpec package for changes 001–249, each with a `verification.md`. The
  `openspec/PROGRAM_STATE.json` file tracks program status, `currentChange`, per-change
  `validationResults`, completion percentages, and advancement flags. Its `validationResults`
  schema has **evolved over time**: early entries use `{ change, status, unitTests, e2eTests[, head] }`
  while later entries use `{ head, typecheck, lint, unit, build, e2e[, productionAudit], note }`.
  This heterogeneity is precisely why a consolidated, schema-stable evidence archive is needed.
- `PARITY_MATRIX.md` at the repository root (change 248), categorizing every planned feature as
  `exact | equivalent | approx | deferred | out-of-scope`, each non-deferred/non-out-of-scope row
  citing a VERIFIED evidence record.
- A whole-codebase adversarial audit report produced by change 249 (security, correctness,
  reliability, data-loss, concurrency, performance, architecture), whose findings 250 must dispose
  of.
- Release performance-gate evidence from change 247 (frame/tick/load/save/network budgets).
- Program completion conditions in `openspec/AUTONOMOUS_GOAL.md`: every planned numbered change
  `VERIFIED` or intentionally `DEFERRED` by an explicit product decision; final parity audit
  passes; no unresolved mandatory requirement; regression and performance suites pass; parity
  matrix accurately records supported behavior and known differences; durable state marked
  `COMPLETE`; final state published to `origin/main` and independently reviewable from GitHub.

There is **no** consolidated evidence archive today. `test-results/` and `coverage/` are generated
outputs, not an auditable archive of per-change verification evidence.

## Target state

After change 250 the repository contains:

- An evidence archive under `openspec/evidence/` that is the single, reviewable, non-fabricated
  consolidation of all verification evidence, with an explicit completeness statement.
- A final verification checklist classifying every planned numbered change 001–250 as exactly one
  of `VERIFIED` or `DEFERRED`, with an explicit product decision on every `DEFERRED` change.
- A final parity audit report recording the re-check of `PARITY_MATRIX.md` accuracy and the
  disposition of every discrepancy and of the change-249 audit findings.
- A final regression/performance suite record capturing the last full gate and performance run.
- A release-readiness decision document with verdict `READY` or `NOT READY` and rationale.
- `openspec/PROGRAM_STATE.json` marked `COMPLETE` with a final 250 `validationResults` entry;
  `PROGRAM_STATE.md` reflecting the completed program.
- The final state committed and pushed to `origin/main`, independently reviewable from GitHub.

No production code and no test files are created or modified.

## Invariants

- **Catalog completeness** — every planned numbered change 001–250 appears in exactly one row of
  the final verification checklist; no change is unclassified.
- **Evidence provenance** — every recorded result in the archive is traceable to an existing,
  locatable record (a `verification.md` row, a named test, or a recorded command result). The
  archive contains no invented or fabricated result.
- **Classification exclusivity** — a change's checklist row is `VERIFIED` or `DEFERRED`, never
  both and never neither.
- **Decision prerequisite** — a `DEFERRED` row exists only when an explicit product decision and
  rationale are recorded for that change; a `VERIFIED` row exists only when the change's
  `verification.md` records it as `VERIFIED` at archive time.
- **Archive–state consistency** — the set of changes recorded `VERIFIED` in the checklist matches
  the set of `VERIFIED` changes recorded in `PROGRAM_STATE.json`, and every one has a consolidated
  evidence record under `openspec/evidence/changes/`.
- **No silent unresolved mandatory requirement** — no change is `VERIFIED` while carrying a
  failed/unverified MUST/SHALL requirement; any such unresolved requirement makes the program
  `NOT READY` unless the owning change is `DEFERRED` with a product decision.
- **Documentation-only** — the change's committed diff adds/modifies no file under `src/` or
  `tests/`.

## API and data model

This change introduces no runtime API. It defines a documentation schema for the archive. The
consolidated per-change evidence record `openspec/evidence/changes/<NNN>.md` SHALL use a stable
header with these fields:

```ts
interface EvidenceRecord {
  change: string;            // "NNN-name" matching CHANGE_SEQUENCE.md
  status: 'VERIFIED' | 'DEFERRED';
  deferral?: {               // REQUIRED iff status === 'DEFERRED'
    productDecision: string; // the explicit product decision text
    rationale: string;       // non-empty reason
  };
  evidence: {                // REQUIRED iff status === 'VERIFIED'
    head: string;            // validated Git HEAD for this change
    typecheck: 'PASS' | 'FAIL';
    lint: 'PASS' | 'FAIL';
    unit: { pass: boolean; count: number; };
    build: 'PASS' | 'FAIL';
    e2e: { pass: boolean; count: number; };
    note: string;            // points to the originating verification.md evidence
    source: string;          // path of the originating verification.md
  };
}
```

The release-readiness document header carries:

```ts
interface ReleaseDecision {
  verdict: 'READY' | 'NOT READY';
  date: string;                 // ISO date of the decision
  criteria: ReadonlyArray<{ id: string; result: 'PASS' | 'FAIL'; note: string; }>;
  // RR-2 list: one result row per readiness criterion
  rationale: string;            // non-empty justification
  signoff: string;              // who/what authorized the product decision where deferral applied
}
```

These sketches describe intent and do not override the normative requirements in the capability
specs.

## Control/data flow

1. **Characterization** — the implementing agent captures the actual current program state from
   `PROGRAM_STATE.json`, the change sequence, and the set of existing `verification.md` files
   (which changes are `VERIFIED`, which are not). This is recorded as the baseline in
   `openspec/evidence/README.md` and in `verification.md` (Baseline evidence).
2. **Checklist execution** — build `checklist/final-verification-checklist.md` from the change
   sequence: one row per change 001–250, status populated from the per-change `verification.md` /
   program state. Any change that is not `VERIFIED` is classified `DEFERRED` only if an explicit
   product decision and rationale are recorded; otherwise it is `UNCLASSIFIED` and is a hard
   failure.
3. **Evidence archive assembly** — for every `VERIFIED` change, create `changes/<NNN>.md`
   consolidating its recorded evidence (head, gate results, test counts, source `verification.md`
   path). For every `DEFERRED` change, create `changes/<NNN>.md` recording the deferral decision.
   Update the archive `README.md` completeness statement when and only when every change has a
   record.
4. **Final parity audit + suites** — execute the final parity audit pass (re-check
   `PARITY_MATRIX.md` rows against cited evidence and actual implementation; dispose of the
   change-249 audit findings), record it in `parity/final-parity-audit.md`. Run the final
   regression gate and the release performance gate (247); record results in
   `suites/final-regression-suite.md`.
5. **Release-readiness decision** — evaluate the RR-2 criteria against the checklist, archive,
   audit, and suite results; write `release-readiness.md` with verdict and rationale.
6. **Final gate + state update** — run the full baseline gate, confirm no `src/`/`tests/` diff,
   update `PROGRAM_STATE.json` (status `COMPLETE`, 250 `validationResults` entry) and
   `PROGRAM_STATE.md`, fill `verification.md`, then commit and publish to `origin/main` per
   `openspec/REVIEW_HANDOFF.md`.

## Detailed behavior

### Final verification checklist

- One row per planned numbered change 001–250. Row columns: `#`, `Change`, `Narrow outcome`,
  `Status` (`VERIFIED`/`DEFERRED`/`UNCLASSIFIED`), `Evidence record`, `Product decision` (for
  deferred), `Notes`.
- `Status` is `VERIFIED` iff the change's `verification.md` records it `VERIFIED` and a
  consolidated record exists under `openspec/evidence/changes/<NNN>.md` with non-null `evidence`.
- `Status` is `DEFERRED` iff the change is not `VERIFIED` and a recorded explicit product decision
  and rationale exist (in the row and in the consolidated record's `deferral`).
- Otherwise the row is `UNCLASSIFIED`, which is a hard failure for the checklist and prevents
  `READY`.

### Evidence archive

- `openspec/evidence/README.md` is the manifest: it declares the archive purpose, the catalog it
  covers (001–250), the completeness statement, the provenance rule (every result cites an
  existing record), and a directory index.
- `changes/<NNN>.md` follows the `EvidenceRecord` schema above. A `VERIFIED` record cites its
  originating `verification.md` (path + the specific evidence rows/commands) and copies the
  recorded gate results verbatim (no new run, no invented numbers).
- The completeness statement asserts that every change 001–250 has exactly one record and that the
  set of `VERIFIED` records equals the `VERIFIED` set in `PROGRAM_STATE.json`.

### Final parity audit

- Re-derive each `PARITY_MATRIX.md` row category from its cited evidence using the change-248
  decision rules, and spot-check the cited evidence still exists and belongs to a `VERIFIED`
  change.
- For each discrepancy (category contradicts evidence, evidence missing, feature mis-assigned),
  record a finding with disposition: `resolved` (row corrected in the same change via the matrix's
  own re-categorization path) or `accepted` (documented deviation) or `open` (blocker).
- Dispose of each change-249 audit finding: `resolved` / `accepted` / `open`. An `open` critical
  finding (security/data-loss/corruption/determinism/compatibility/regression blocker) prevents
  `READY`.

### Final regression/performance suite

- Run the full baseline gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run test:e2e`; record per-command result and counts.
- Run the release performance gate from change 247; record each budget result.
- A failing command or budget is recorded; the release-readiness decision then evaluates whether
  it is a documented, authorized exception (see failure modes).

### Release-readiness decision

- Evaluate the RR-2 readiness criteria; the document records one PASS/FAIL row per criterion and a
  verdict. `READY` iff every criterion passes; otherwise `NOT READY`.

## Failure modes

- **Missing evidence** — a `VERIFIED` change with no originating record, or a consolidated record
  with no `source`. The checklist/archive completeness check fails; the program is `NOT READY`.
- **Deferred without decision** — a non-`VERIFIED` change with no recorded product decision and
  rationale. The row is `UNCLASSIFIED`; the checklist fails; the program is `NOT READY`.
- **Failed final suite** — a regression or performance command fails. Recorded in the suite record.
  `READY` is only possible if the failure is documented and authorized as an explicit exception in
  the suite record AND the failure implements/verifies no MUST/SHALL requirement (mirrors the
  AGENTS.md 90–99.99% exception rule); otherwise `NOT READY`.
- **Unresolved critical audit finding** — an `open` critical finding prevents `READY`.
- **Parity-matrix inaccuracy unresolved** — a matrix discrepancy left `open` prevents `READY`.
- **State/archive inconsistency** — the checklist `VERIFIED` set, the archive, and
  `PROGRAM_STATE.json` disagree; the mismatch is a failure to be reconciled before `READY`.
- **Scope leak** — any `src/` or `tests/` file in the diff is a hard failure.

## Compatibility/migration

No public data, save format, protocol, module, or symbol changes; no migration. `PARITY_MATRIX.md`
schema and per-change `verification.md` files are read, never rewritten. The `validationResults`
entry appended for 250 follows the current (later) schema form so it is consistent with recent
entries; existing heterogeneous entries are preserved, not rewritten.

## Performance/resource constraints

No production hot paths are touched. The archive is bounded by the change catalog (≈250 records);
the checklist, audit, and suite records are small documentation files. The final suite run is a
one-off verification step at the same cost as any full gate.

## Testing seams

- The verification contract uses the same seams as prior changes: `verification.md` requirement
  evidence rows, the baseline gate commands, and reviewer-inspectable documentation artifacts.
- Checklist, archive, and decision documents are validated by reviewer inspection (no runtime
  seam), and their machine-checkable fields (`Status`, `Category`, verdict, counts) are formatted
  so a reviewer can re-derive pass/fail without guessing.

## Observability/debugging

- The archive `README.md` completeness statement and the checklist summary make any missing or
  unclassified change immediately visible.
- `release-readiness.md` lists one result row per criterion, so a reviewer sees exactly which
  criterion failed.
- `PROGRAM_STATE.json` marks `COMPLETE` and records the final 250 gate in `validationResults`,
  giving a machine-readable terminal signal.

## Affected files/symbols

Created by this change (documentation/state only):

- `openspec/evidence/README.md`
- `openspec/evidence/checklist/final-verification-checklist.md`
- `openspec/evidence/changes/<NNN>.md` (001–250)
- `openspec/evidence/parity/final-parity-audit.md`
- `openspec/evidence/suites/final-regression-suite.md`
- `openspec/evidence/release-readiness.md`
- `openspec/changes/250-final-program-verification/` (this package's own artifacts)
- `openspec/PROGRAM_STATE.json` and `openspec/PROGRAM_STATE.md` (end-of-change checkpoint)

Consumed read-only: `openspec/CHANGE_SEQUENCE.md`, `openspec/AUTONOMOUS_GOAL.md`,
`PARITY_MATRIX.md`, every change 001–249 `verification.md`, the change-249 audit report, and the
change-247 performance-gate evidence.

No `src/` or `tests/` file is created, modified, or deleted.

## Rejected alternatives

- **Consolidate evidence into `PROGRAM_STATE.json` only** — rejected: the state file tracks
  program status, not full evidence; the heterogeneous `validationResults` schema makes it a poor
  long-form evidence store. A dedicated archive keeps evidence reviewable and stable-schema.
- **Re-run and re-record all prior verification** — rejected: prior changes are already VERIFIED;
  the archive consolidates existing recorded evidence and never fabricates re-runs.
- **Top-level `/evidence` directory** — rejected in favor of `openspec/evidence/` so evidence
  lives with the program-control documents it documents, matching the spec-driven layout.

## Downstream dependencies

- The release-readiness decision is consumed by reviewers (GitHub) and by any human release
  gatekeeper; nothing in the codebase consumes it at runtime.
- The `COMPLETE` program state is the terminal state; the autonomous loop stops here (no change
  251 exists).
- `openspec/REVIEW_HANDOFF.md` governs publication of the final state to `origin/main`.
