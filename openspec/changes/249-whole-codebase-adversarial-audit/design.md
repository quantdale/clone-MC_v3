# Design: 249-whole-codebase-adversarial-audit

## Context/current state

The repository is a browser-based TypeScript voxel game (Three.js), now grown to a full
parity-program codebase. Key facts at authoring time:

- **Source layout** (file counts per module): `src/simulation/` (~104), `src/worldgen/`
  (21), `src/world/` (33), `src/data/` (32), `src/rendering/` (24), `src/inventory/` (22),
  `src/storage/` (17), `src/player/` (8), `src/engine/` (9), `src/ui/` (6), `src/audio/` (1),
  `src/config/` (1), `src/math/` (4), plus `src/main.ts`.
- **Test surface**: 260+ unit test files under `tests/unit/`; one Playwright spec file under
  `tests/e2e/` (a large multi-test suite); an HTML coverage report under `coverage/`.
- **Toolchain**: Vitest (headless unit), Playwright (headless Chromium E2E), Vite build, ESLint
  9 + typescript-eslint, `tsc --noEmit` typecheck. Scripts: `typecheck`, `lint`, `test`,
  `test:coverage`, `test:e2e`, `build`.
- **Existing whole-codebase audit**: `FULL_AUDIT_REPORT.md` — a one-off narrative audit
  (findings `AUDIT-001..030`) authored against the early single-player codebase. Several
  findings are already addressed in the current tree, e.g.:
  - `AUDIT-001` (WebGL context loss): handlers now exist in `src/engine/Renderer.ts`
    (`webglcontextlost`/`webglcontextrestored`).
  - `AUDIT-003` (pointer-lock error feedback): `pointerlockerror` is handled in
    `src/engine/InputManager.ts`.
  - `AUDIT-004` (`?e2e` parameter): replaced by the build-time `import.meta.env.VITE_E2E ===
    'true'` guard in `src/main.ts`, set only in `playwright.config.ts`.
  This change must reconcile each legacy finding's current status with evidence.
- **Prior audit-relevant evidence** (read-only inputs): 237 (network adversarial validation),
  238 (worker/main-thread stress), 239 (memory stress + `MemoryResourceBudget`), 240 (save
  recovery stress), 241 (deterministic replay), 242-248 (matrices). These provide much of the
  per-category evidence; the audit cites them and adds targeted characterization probes only
  where evidence is thin.
- **No structured audit protocol, taxonomy, coverage rule, or report schema exists today.**
  A fresh session cannot determine which legacy claims are current, resolved, or unverified.

## Target state

- A defined, repeatable audit protocol (seven categories, shared taxonomy, evidence rules,
  coverage rules, report schema) codified in `specs/`.
- A structured report at
  `openspec/changes/249-whole-codebase-adversarial-audit/report.md` that supersedes the
  narrative `FULL_AUDIT_REPORT.md`, reconciles `AUDIT-001..030`, and carries classified,
  evidenced findings across all seven categories.
- No production behavior changed; characterization probes (if any) are read-only.

## Invariants

- **Read-only audit invariant**: the audit MUST NOT alter any production source file, config,
  or stored-data format. Production tree before == after (verified by task 4.1).
- **No-fabrication invariant**: every finding's evidence MUST reference a real file/line and/or
  a recorded command/test result. An unsupported claim MUST NOT be reported as confirmed.
- **Unique-ID invariant**: finding IDs are unique and stable across the report and its
  evidence index.
- **Blocking-means-blocking invariant**: a finding classified blocking MUST represent a genuine
  data-loss, corruption, determinism, security, compatibility, or correctness blocker per the
  taxonomy; the classification MUST be justified in the finding body.
- **Coverage-honesty invariant**: a category whose coverage minimum is not met MUST be recorded
  as a coverage gap / blocked entry, never silently omitted.

## API and data model

No runtime API is added. The change introduces documentation contracts and one report artifact.
The report's internal schema is normative (see `specs/audit-protocol/spec.md` REQ-P2, REQ-P6).
Data model sketch (describes intent; does not override the spec):

```ts
// Finding catalog entry (one per finding, stored in the report's finding tables)
type AuditFinding = {
  id: string;            // "249-<CATEGORY>-<NNN>", e.g. "249-DL-001"
  category: 'security'|'correctness'|'reliability'|'data-loss'|
            'concurrency'|'performance'|'architecture';
  classification: 'blocking' | 'non-blocking';
  severity: 'critical'|'high'|'medium'|'low'|'info';
  confidence: 'confirmed'|'high'|'medium'|'low';
  evidenceTier: 'static'|'dynamic'|'mixed';
  status: 'open'|'resolved'|'duplicate'|'not-an-issue'|'blocked';
  title: string;
  affected: string[];    // files/modules/symbols
  description: string;   // what is wrong
  trigger: string;
  impact: string;
  evidence: string[];    // file:line citations and/or recorded command/test results
  recommendation: string; // non-normative
};

// Coverage statement (per category, one row)
type CategoryCoverage = {
  category: AuditFinding['category'];
  scope: string;         // modules/surfaces examined
  method: string;        // static review surfaces + characterization probes run
  priorEvidence: string[]; // 237-248 verification citations relied upon
  minimumMet: boolean;
  gaps: string[];        // coverage gaps or blocked entries
  findings: string[];    // finding IDs in this category
};
```

## Control/data flow

1. **Baseline** (Group 1): inventory existing evidence; map modules→categories into a coverage
   matrix; run and record the baseline gate; reconcile legacy `AUDIT-001..030`.
2. **Audit execution** (Group 2): for each of the seven categories, apply static review
   (module-by-module per the category spec's scope) and run targeted characterization probes
   where fresh evidence is needed; draft classified findings.
3. **Findings validation** (Group 3): dedupe, cross-check each finding's evidence, resolve
   contradictory evidence, confirm blocking/non-blocking classification, and check every
   coverage minimum.
4. **Report assembly** (Group 3): emit the structured report (methodology, coverage matrix,
   finding catalog, evidence index, category summaries, legacy reconciliation) to `report.md`.
5. **Regression & final gate** (Group 4): confirm no production code changed (clean `git
   status` on `src/`), re-run the baseline gate, populate `verification.md`, and record the
   durable state.

## Detailed behavior

### Finding taxonomy

- **Blocking** — evidence-backed and of such consequence that the codebase cannot be considered
  sound in that area without remediation: any data-loss, silent corruption, determinism
  violation, security exploit/backdoor reachable in production, unrecoverable concurrency
  race, or unbounded resource growth causing a crash/hang. Blocking findings MUST be surfaced
  prominently and MUST be traceable into 250's decision inputs.
- **Non-blocking** — everything else (performance improvements, UX, code quality, coverage
  gaps, documentation drift, INFO-level architecture notes). Non-blocking findings MUST still
  carry evidence but do not impede advancement.
- **Severity** (`critical/high/medium/low/info`) and **confidence** (`confirmed/high/medium/
  low`) are orthogonal attributes used for prioritization; the blocking/non-blocking split is
  the release-relevant decision.

### Evidence requirements

- **Static evidence**: a real `path/file.ts:line` (or module/symbol) citation that a reviewer
  can open. A wrong or unverifiable citation makes the finding invalid (fails REQ-P3).
- **Dynamic evidence**: a recorded command/test result (pass/fail + identifying detail) from a
  headless Vitest probe and/or Playwright run and/or `npm audit`, cited by script/test name.
- **Insufficient evidence**: if a claim cannot be evidenced, the auditor MUST record the
  finding with `confidence: low`, an explicit `insufficient evidence` note, and
  `status: blocked` if it could not even be characterized. Insufficient evidence is a finding
  about the evidence, not a fabricated claim.
- **Contradictory evidence**: when prior-change verification conflicts with a current-tree
  observation, the auditor MUST reconcile by re-reading the actual code/result, prefer the
  current-tree observation, and record the resolution (see REQ-P4 scenario).

### Report artifact

`report.md` MUST contain, in order: an executive summary; methodology (commands, probes, and
evidence inputs); a coverage matrix (one row per category); a finding catalog (one table/row
per finding, all seven categories); an evidence index (map of finding ID → citation/results);
category summaries; and a legacy-finding reconciliation table mapping each `AUDIT-001..030`
to `resolved / persists / not-an-issue / duplicate` with evidence.

## Failure modes

- **Baseline gate red at start**: the audit records the exact failing command and blockers
  rather than proceeding on a false "green" claim; per-category findings that depend on a
  green baseline are marked `blocked` until re-run.
- **Evidence citation broken**: an invalid file:line or missing test file invalidates the
  finding; the auditor fixes the citation to a real one or downgrades the claim.
- **Coverage minimum unreachable** (e.g. a needed probe cannot run headless): the category is
  recorded as a coverage gap with a `blocked` coverage entry, never skipped silently.
- **Contradictory prior/current evidence**: resolved by re-reading current code and preferring
  the current observation; the resolution is documented.
- **Scope-drift (fixing a found issue)**: treated as a hard failure of the change's non-goals;
  the fix is reverted and re-tracked to a later change.

## Compatibility/migration

None required — no public API, stored data, or config change. The legacy `FULL_AUDIT_REPORT.md`
is left in place and reconciled, not deleted or rewritten.

## Performance/resource constraints

The audit is documentation + read-only probes. Characterization probes MUST be bounded:
- A probe MUST have a bounded runtime (a per-probe cap such as `< 60s` in Vitest) and bounded
  memory (no unbounded accumulation).
- The audit MUST NOT introduce any hot-path, tick, or render cost (it adds no production
  runtime code).
- The report's evidence index MUST reference results, not embed unbounded raw logs.

## Testing seams

- Prior-change unit/E2E suites are the dynamic-evidence seams (run or cite their recorded
  verification results).
- `tests/unit/` and `tests/e2e/` are the only places characterization probes may be added, and
  only as read-only measurement/assertion scripts that do not alter production behavior.
- `coverage/` is a static-evidence seam for correctness/architecture coverage claims.

## Observability/debugging

- The report itself is the durable observability artifact; findings are the debug trail for
  subsequent remediation changes.
- Each category spec lists concrete surfaces to inspect, so an implementing agent can reproduce
  a finding by name.

## Affected files/symbols

- **Created (documentation)**: `proposal.md`, `design.md`, `tasks.md`, `verification.md`,
  `report.md` (deliverable), and `specs/<capability>/spec.md` for all eight capabilities.
- **Created (possibly, read-only probes)**: bounded characterization test/measurement files
  under `tests/unit/` or `tests/e2e/` — these are the only non-documentation files this change
  may add, and they MUST NOT alter production behavior.
- **Read-only inputs**: `FULL_AUDIT_REPORT.md`, `coverage/`, prior-change verification files
  (237-248), and all production source under `src/`.
- **NOT modified**: any production source under `src/`, any config, any stored-data format.

## Rejected alternatives

- **Per-category remediation within 249** — rejected: expands the narrow "audit" outcome into
  fixes, overlaps later changes, and risks destabilizing the just-verified codebase. Findings
  are tracked forward instead.
- **One monolithic narrative report again** — rejected: repeats the `FULL_AUDIT_REPORT.md`
  weakness of being hard to query and to verify; the schema-based catalog replaces it.
- **One spec for all categories** — rejected: the seven categories have genuinely distinct
  scopes, methods, and evidence needs; separate specs keep each contract independently
  testable and reviewable.
- **Re-running every stress/matrix suite in full** — rejected: wasteful and duplicative; prior
  recorded evidence is cited, and only thin areas get fresh probes.

## Downstream dependencies

- **250-final-program-verification** consumes `report.md` and its finding catalog as evidence
  inputs and makes the final release-readiness decision. 249 MUST leave the report in a state
  250 can consume (unique IDs, complete evidence index, explicit blocking/non-blocking split,
  explicit coverage gaps) and MUST NOT itself decide release-readiness.
- No other change depends on 249's files; no runtime consumer depends on the audit.
