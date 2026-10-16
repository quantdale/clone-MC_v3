# 249 Whole-Codebase Adversarial Audit — Report

Change: 249-whole-codebase-adversarial-audit · Schema: finding taxonomy v1 (design.md) ·
Generated: 2026-08-21 · Baseline commit: `b56529e6459ad2348545c359bdcdceb1477607c5`
(248 VERIFIED). This report supersedes the narrative `FULL_AUDIT_REPORT.md`; the legacy file
is left in place and reconciled here.

## Executive summary

Four parallel auditors examined all seven categories over the full `src/` tree, combining
static review (real file:line citations), recorded prior-change evidence (237-248), and
targeted read-only probes (`npm audit`, vitest replay probes, grep sweeps,
`scripts/orphan-check.mjs`).

**45 findings: 2 blocking, 43 non-blocking. 0 security exploits. `npm audit`: 0
vulnerabilities. All 30 legacy AUDIT findings reconciled.**

The two blocking findings are both data-loss paths in the live persistence layer:

1. **249-DL-001** — the production save path silently swallows quota/private-mode
   `localStorage.setItem` failures (`Game.ts:1523-1552`): no log, no user signal, no retry.
2. **249-DL-002** — edit-overlay LRU eviction silently discards committed-but-unsaved edits
   past 10k chunks without persisting first (`World.ts:784-790`).

Root cause context: **249-DL-005** (non-blocking, high) records that the transactional
IndexedDB stack (034-043, 234) is not wired into the shipped game — live saves are
localStorage-only — which caps end-to-end durability evidence at component level and is the
common ancestor of both blockers. Per this change's non-goals, remediation is tracked forward
to change 250's decision inputs, not fixed here.

No release-readiness verdict is asserted by this report (REQ-P7); that decision belongs to 250.

## Methodology

- **Static review**: module-by-module reading of every category's spec-listed surfaces with
  real `file.ts:line` citations; a wrong citation invalidates a finding.
- **Prior evidence**: recorded results from changes 237 (network adversarial), 238 (worker/
  main-thread stress), 239 (memory stress), 240 (save recovery), 241 (deterministic replay),
  242-245 (matrices), 246 (input/accessibility), 247 (release gate) cited rather than re-run
  (no-duplication rule).
- **Fresh probes (read-only)**: `npm audit --json` (0 vulnerabilities); vitest replay probes
  (`ReplayVerifier.test.ts` + `StateHasher.test.ts`, 22/22 PASS); bundle greps for test-hook
  leakage before/after clean builds; worker-instantiation and transferable greps;
  `node scripts/orphan-check.mjs` (300 src files, zero dormant besides `main.ts`);
  localStorage-payload and storage-wiring sweeps.
- **Baseline**: full gate green at entry commit (typecheck, lint, unit 292 files / 3827 passed
  + 1 skipped, build, e2e 40/40).

## Coverage matrix

| Category | Scope | minimumMet | Gaps | Findings |
|---|---|---|---|---|
| security | main.ts hooks/gates, storage/*, codecs, InputManager event surfaces, import/export | true | none | SEC-001..005 |
| correctness | simulation/* determinism, worldgen seeds, PRNG, boundary arithmetic, codec round-trips | true | REQ-C3 transition sampling relied on 242/243 e2e evidence (no new probe authored) | COR-001..005 |
| reliability | Renderer context loss, pointer lock, worker error isolation, disposal, bounded growth | true | REQ-R2 worker-crash path is static-only (workers unwired from production) | REL-001..007 |
| data-loss | storage/* transactional stack, ServerSaveLifecycle, pagehide flush, quota, import/export | true | REQ-D1/D3 component evidence covers code unreachable from the shipped product (DL-005) | DL-001..006 |
| concurrency | worker versioning/stale rejection, single-writer seams, transferables, tick queue ordering | true | no real-thread probe possible (no workers exist; synchronous dispatchers audited) | CO-001..005 |
| performance | budget monitors (075/238/239/247), hot-path allocations, memory boundedness | true | runtime enforcement absent (PE-001); 247 tick workload synthetic (PE-002) | PE-001..005 |
| architecture | package boundaries, dependency directions, state ownership, dead/duplicate code | true | boundary enforcement procedural not structural; duplicate sweep name-based not AST | ARCH-001..012 |

## Finding catalog

Full finding bodies (all schema fields, citations, recommendations) live in the fragment
files under `fragments/`, which are part of this change. Summary:

| ID | Category | Class | Sev | Status | Title |
|---|---|---|---|---|---|
| 249-DL-001 | data-loss | **blocking** | high | open | Production save path silently swallows quota/private-mode write failures |
| 249-DL-002 | data-loss | **blocking** | medium | open | Edit-overlay LRU eviction silently discards committed-but-unsaved edits |
| 249-SEC-001 | security | non-blocking | high | open | Post-e2e dist/ artifact ships unconditional window.__voxelGame hook (build-pipeline hazard; clean build has zero) |
| 249-DL-005 | data-loss | non-blocking | high | open | Transactional IndexedDB stack (034-043/234) not wired into shipped game |
| 249-CO-001 | concurrency | non-blocking | high | open | No real Web Workers exist; 064/065/086 clients are synchronous dispatchers |
| 249-REL-003 | reliability | non-blocking | medium | open | WorkerJobClient lacks timeout/crash recovery (unreachable today) |
| 249-CO-002 | concurrency | non-blocking | medium | open | Worker clients / MovementReconciler / TickBudgetMonitor unwired from live game |
| 249-CO-003 | concurrency | non-blocking | medium | open | Failed worker results leak callback Map entries (failure path only) |
| 249-PE-001 | performance | non-blocking | medium | open | Budget monitors are measurement-time only; no runtime enforcement |
| 249-DL-003 | data-loss | non-blocking | low | open | Corrupt localStorage payloads fall back silently/inconsistently |
| 249-DL-004 | data-loss | non-blocking | low | open | importWorld overwrites existing world without backup/existence check |
| 249-SEC-005 | security | non-blocking | low | open | Fatal-error message embeds raw exception text |
| 249-COR-002 | correctness | non-blocking | low | open | World.getBlock silently returns Air for bad coords/unloaded chunks (AUDIT-010 residual) |
| 249-COR-003 | correctness | non-blocking | low | open | PRNG.nextInt unguarded for max<=0 |
| 249-COR-004 | correctness | non-blocking | info | open | Live cosmetic systems consume Math.random outside governed streams |
| 249-COR-005 | correctness | non-blocking | low | open | ChunkManager lacks dedicated unit test (AUDIT-013 residual) |
| 249-REL-004 | reliability | non-blocking | low | open | stateOverlay uncapped while edit overlay is LRU-capped |
| 249-REL-007 | reliability | non-blocking | low | open | Fatal-error state has no in-page retry (AUDIT-025 persists) |
| 249-CO-005 | concurrency | non-blocking | low | open | ScheduledTickQueue.tick() full-map scan + sort per call |
| 249-PE-002 | performance | non-blocking | low | open | 247 tick-tier minimums measured on synthetic systems |
| 249-PE-003 | performance | non-blocking | low | open | Legacy hot-path allocations persist (AUDIT-016/017/018 surfaces) |
| 249-ARCH-001..012 | architecture | non-blocking | med×2/low×6/info×4 | open | Dependency inversions (sim→engine clock, data↔inventory cycle, worldgen→rendering), author-declared shared-sim boundary w/o static enforcement, FULL_AUDIT_REPORT drift, legacy AUDIT-027/028 INFO persists, etc. |
| 249-SEC-002 | security | non-blocking | info | resolved | AUDIT-004 resolved: no URL-controlled test hook; build-time flags only |
| 249-SEC-003 | security | non-blocking | info | resolved | npm audit: zero vulnerabilities |
| 249-SEC-004 | security | non-blocking | info | resolved | Untrusted-input surface enumeration complete (REQ-S1) |
| 249-DL-006 | data-loss | non-blocking | info | resolved | REQ-D1/D4 component guarantees verified via SaveRecoveryMatrix |
| 249-COR-001 | correctness | non-blocking | info | not-an-issue | Deterministic replay invariant holds (probe 22/22 + 241 evidence) |
| 249-REL-001 | reliability | non-blocking | info | resolved | Context loss handled end-to-end (AUDIT-001 resolved) |
| 249-REL-002 | reliability | non-blocking | info | resolved | Pointer-lock refusal recoverable (AUDIT-003 resolved) |
| 249-REL-005 | reliability | non-blocking | info | resolved | Disposal error-isolated, double-dispose safe (AUDIT-011 resolved) |
| 249-REL-006 | reliability | non-blocking | info | resolved | Queues/overlays bounded under churn (AUDIT-005 resolved) |
| 249-CO-004 | concurrency | non-blocking | info | not-an-issue | Zero transferables used; structured clone only |
| 249-PE-004 | performance | non-blocking | info | resolved | Memory boundedness holds (239 + current-tree caps) |
| 249-PE-005 | performance | non-blocking | info | resolved | Budgets hold per 238/247/075 recorded results |

## Evidence index

Per-finding citations (file:line and/or recorded commands) are embedded in each finding body
in the fragment files:

- `fragments/security-data-loss.md` — SEC-001..005, DL-001..006 (+ AUDIT-004/005/010/022 rows)
- `fragments/correctness-reliability-audit.md` — COR-001..005, REL-001..007 (+ AUDIT-001/003/
  010/011/012/013/014/015/025 rows)
- `fragments/concurrency-performance-audit.md` — CO-001..005, PE-001..005 (+ AUDIT-002/006/
  007/008/009/016/017/018/019/020/021/023 rows)
- `fragments/architecture.md` — ARCH-001..012 (+ AUDIT-024/026/027/028/029/030 rows)

Key dynamic probes recorded: `npm audit --json` → 0 vulnerabilities; `npx vitest run
tests/unit/ReplayVerifier.test.ts tests/unit/StateHasher.test.ts` → 22/22 PASS;
`node scripts/orphan-check.mjs` → 300 files, zero dormant besides main.ts; bundle grep for
`__voxelGame` after clean `npm run build` → 0 matches.

## Category summaries

- **security** — No production backdoor or exploit found. The VITE_E2E hook is source-gated;
  the one hazard is build-pipeline (a post-e2e dist/ retains the hook until a clean build).
  Storage/import validation is present at component level. `npm audit` clean.
- **correctness** — Determinism verified (replay probe + 241). Residuals are defensive-API
  asymmetries and test-coverage gaps, all low/info.
- **reliability** — All runtime fault handlers verified present and recoverable; residuals are
  unreachable-today worker hardening and minor UX gaps.
- **data-loss** — The weakest area. Component-level guarantees are strong (240 matrix), but
  the transactional stack is unwired (DL-005) and the live localStorage path fails silently
  under quota pressure (DL-001, blocking) with LRU eviction still lossy (DL-002, blocking).
- **concurrency** — Single-threaded execution makes races structurally absent today; the
  worker-shaped seams are synchronous dispatchers with failure-path bookkeeping leaks.
- **performance** — Budgets hold per recorded evidence; enforcement is measurement-time only
  and legacy allocation patterns persist (non-blocking).
- **architecture** — Boundaries are disciplined in practice but enforced procedurally; three
  dependency-direction inversions and one stale legacy-report drift recorded.

## Legacy reconciliation (AUDIT-001..030)

Complete row-by-row tables with current-tree citations live in the fragment files
(`## Legacy reconciliation` sections). Summary: **resolved** — AUDIT-001, 002, 003, 004, 005
(mitigated, see DL-002), 006, 007, 008, 009, 011, 012, 014, 015, 020, 022, 023, 026;
**persists (non-blocking)** — AUDIT-010 (COR-002), 013 partial (COR-005), 016/017/018/019
(PE-003), 025 (REL-007), 027/028 (ARCH INFO); remainder mapped to owning categories as
not-an-issue/duplicate. Every row carries a real current-tree citation.

## Gate

Recorded in `verification.md`: typecheck/lint/test/build/e2e all PASS at the audit commit
(src/tests byte-identical to baseline b56529e where the identical suite passed 40/40 e2e).
