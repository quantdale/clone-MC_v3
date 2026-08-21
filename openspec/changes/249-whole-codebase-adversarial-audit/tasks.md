# Tasks: 249-whole-codebase-adversarial-audit

## 1. Baseline & characterization

- [x] 1.1 Inventory the existing audit-relevant evidence: read the `FULL_AUDIT_REPORT.md`
  findings (`AUDIT-001..030`), the `coverage/` report, and the `verification.md` of changes
  237-248; record in `design.md` which per-category evidence already exists and is citable.
- [x] 1.2 Map modules → categories into a coverage matrix (each of the seven categories lists the
  `src/` modules/surfaces it will examine, its static-review surfaces, and its evidence inputs),
  and confirm every `src/` module is claimed by at least one category.
- [x] 1.3 Run and record the baseline gate (`npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`) with exact counts, so the audit's "current state" is real;
  record any failing command as a blocker in `verification.md`.
- [x] 1.4 Reconcile every legacy `AUDIT-001..030` finding against the current tree, producing a
  draft `resolved / persists / not-an-issue / duplicate` mapping with a static citation each
  (e.g. confirm `AUDIT-001` WebGL context loss against `src/engine/Renderer.ts`, `AUDIT-004`
  against the `VITE_E2E` gate in `src/main.ts`).

## 2. Audit execution (per category)

- [x] 2.1 **Security** (REQ-S1..S5): enumerate untrusted input surfaces; verify no production
  backdoor/test hook; verify storage/import validation; run `npm audit` and record its result;
  check secret/leakage. Draft security findings.
- [x] 2.2 **Correctness** (REQ-C1..C4): verify deterministic replay evidence (241); check
  arithmetic/boundary handling (negative coords, integer/capacity bounds); sample
  state-transition rules; verify codec round-trip/rejection (19/223). Draft correctness findings.
- [x] 2.3 **Reliability** (REQ-R1..R4): verify runtime fault handlers (context loss, pointer lock,
  worker errors); worker stale-result/crash isolation; disposal correctness; bounded growth.
  Draft reliability findings.
- [x] 2.4 **Data-loss** (REQ-D1..D4): verify transactional save/recovery (240), pagehide/eviction
  flush (39), quota/private-mode (43), and import/export/migration integrity (41/42). Draft
  data-loss findings.
- [x] 2.5 **Concurrency** (REQ-CO1..CO4): verify worker versioning/stale rejection (64/86/238),
  single-writer discipline (228/231/234), transferable ownership, and saturation ordering/
  backpressure. Draft concurrency findings.
- [x] 2.6 **Performance** (REQ-PE1..PE3): verify tick/frame budgets (238/247/75), hot-path
  complexity/allocation review (reconcile `AUDIT-006..009,016,017`), and memory boundedness (239).
  Draft performance findings.
- [x] 2.7 **Architecture** (REQ-A1..A4): verify headless-simulation determinism boundary (222),
  dependency-direction discipline, state ownership (`AUDIT-027/028/029/030`), and dead/duplicate/
  legacy code (`AUDIT-024`). Draft architecture findings.

## 3. Findings validation & report assembly

- [x] 3.1 Validate all draft findings: assign unique IDs (`249-<CATEGORY>-<NNN>`), deduplicate,
  verify every static citation resolves and every dynamic claim is recorded, resolve any
  contradictory evidence (prefer current-tree observation), and justify each blocking/non-blocking
  classification per REQ-P2/REQ-P4.
- [x] 3.2 Assemble the structured report at `report.md` per REQ-P6 (executive summary, methodology,
  coverage matrix, finding catalog, evidence index, category summaries, legacy-finding
  reconciliation table) and verify its completeness: every category has a coverage row with
  `minimumMet`/gaps (REQ-P1/REQ-P8), every finding ID is unique and indexed, all seven categories
  are represented, and no release-readiness verdict is asserted (REQ-P7).

## 4. Regression & final gate

- [x] 4.1 Confirm the audit changed no production behavior: `git status` on `src/` shows no
  modifications to production source/config (only additive, read-only characterization probes in
  `tests/` if any); revert any accidental production change.
- [x] 4.2 Final gate: re-run the baseline gate (`npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `npm run test:e2e`), populate `verification.md` with evidence mapping every
  REQ to its report/evidence, and record the durable state per `AGENTS.md`/review-handoff.
