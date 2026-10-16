# Post-Hardening Adversarial Re-Audit (Gate E)

Status: **CODE-AUDIT + INDEPENDENT ADVERSARIAL PASS COMPLETE**

## Independent pass verdict

An independent skeptical re-audit (fresh-context reviewer, current tree) confirmed every closure
below with file:line citations and surfaced five new non-blocking findings (NEW-1..NEW-5), all
dispositioned in-tree before publication:

- **NEW-1 stale-requeue race** (`DirtySaveQueue.drain` catch could overwrite a newer markDirty
  with the failed stale unit) — regression-risk → **fixed**: re-queue only when no newer unit
  holds the key; regression test added.
- **NEW-2 failed-migration retry could revert interim gameplay progress** — data-loss edge →
  **fixed**: attempted-vs-verified migration markers; after a failed attempt, retry is skipped
  whenever newer durable state exists; failure stays observable via degraded status; legacy
  source untouched. Regression test added.
- **NEW-3 hydration resolve-vs-edit race** (committed copy could visually revert a live edit made
  mid-hydration) — **fixed**: hydration skips application when a resident overlay entry appeared
  since dispatch; durable copy unaffected (dedup retains newest). Regression test added.
- **NEW-4 dispose-during-pending-open could re-arm coordinator after teardown** — **fixed**:
  `coordinator.start()` guarded by the disposed flag.
- **NEW-5 two-tab concurrency** (concurrent idempotent migration benign; player-state
  last-writer-wins) — info; documented; single-user browser game scope.
Scope: Change 249 persistence-affected findings re-evaluated against the remediated tree, per
`specs/post-hardening-audit/spec.md` (REAUDIT-1..3) and `tasks.md` §7.

Entry evidence: `openspec/changes/249-whole-codebase-adversarial-audit/report.md` + fragments.
Remediation normative baseline: `design-addendum.md` in this package.

## Finding verdicts

| ID | 249 entry | Verdict | Current-tree evidence |
|---|---|---|---|
| 249-DL-001 | blocking/high/open; accepted by 250 | **resolved** | localStorage authoritative path deleted (`src/engine/Game.ts` — no `setItem` on edits/state keys remains); all writes flow through `GamePersistence` (`src/storage/GamePersistence.ts`: monitoring sink classifies every rejection via `classifyStorageError`, gates on `canWrite()`, retains units for bounded retry, coalesced probes, structured `flush()` result that counts only sink-accepted commits). Persistent user-visible state: `#save-status` banner (`src/ui/SaveStatusIndicator.ts`, `index.html`) driven by health changes + sticky boot-degraded flag cleared only by a verified committed flush. Empty production catches: none on persistence paths (remaining catches are load-degradation paths that surface through the banner, per SAVE-FAIL semantics). Dynamic proof: fault-injection unit suites + browser E2E quota/unavailable tests (`tests/e2e/persistence.spec.ts` #2/#3). |
| 249-DL-002 | blocking/medium/open; accepted by 250 | **resolved** | Resident-cache/durability-ownership split in `src/world/World.ts`: capture-on-edit hands every overlay mutation to the durable layer before any eviction can occur; `touchEditOverlay` calls `retainEvictedChunkEdits` before delete (defensive idempotent handoff); regeneration restores via sync pending lookup then async hydration with dedup. DIRTY-5 proof: `tests/unit/WorldEditDurability.test.ts` — 10,051 distinct edited chunks, overlay capped ≤10,000, exact per-cell canonical equality across save/reload incl. repeated early/LRU-candidate edits (newest version wins). |
| 249-DL-005 | high/open; accepted by 250 | **resolved** | Shipped composition: `src/main.ts` composes `GamePersistence.createProductionGamePersistence(seed)` and awaits `open()` before constructing `Game`; `Game` passes the facade to `World` as `editDurability`, enqueues player state (pagehide/dispose/5 s cadence) and flushes; coordinator auto-drains every 5 s. Component-only construction no longer exists on the live path. Proof: `tests/unit/ProductionComposition.test.ts` (real facade + real World end-to-end) and browser E2E #1 (real Chromium IndexedDB round-trip through the production bundle). |
| 249-DL-003 | low/open (corrupt payload silent fallback) | **resolved** | Corrupt legacy source: migrator validates structurally, collects per-artifact errors, never mutates source; facade surfaces errors as degraded open status → banner. Corrupt durable records: bulk-load failures land in `open()` errors + degraded status (observable); `loadCommittedChunkEdits` never throws and reports through health checks. Observation (non-blocking): a single corrupt committed chunk record degrades the boot banner until the first verified commit rather than persisting a dedicated per-record alert — acceptable under SAVE-FAIL-3 scope (save-health), tracked as polish. |
| 249-DL-004 | low/open (importWorld overwrite guard) | **preserved classification** | `WorldArchiver.importWorld` remains component-level API; no UI/bootstrap path reaches it (grep: only tests + SaveRecoveryMatrix harness). Unchanged by this campaign; guard work stays out of scope per remediation matrix ("otherwise preserve unreachable classification"). |
| 249-SEC-001 | high/open (E2E hook in dist artifact) | **resolved** | `scripts/check-release-bundle.mjs` asserts a plain release build contains no `__voxelGame`; verified PASS on plain build ("3 assets checked; no E2E hook found"); now enforced as a canonical CI step immediately after `npm run build` (`.github/workflows/ci.yml`), before the E2E step rebuilds with `VITE_E2E=true`. `main.ts` gating unchanged (`DEV \|\| VITE_E2E`). No new privileged test hooks were introduced — E2E fault injection manipulates the storage environment from test code only. |
| 249-REL-004 | low/open (stateOverlay uncapped) | **unchanged / non-blocking** | `stateOverlay` untouched by the campaign (persistence covers block-id edits, matching pre-existing snapshot scope). Pre-existing tracking stands. |
| 249-REL-006 / 249-PE-004 | resolved at 249 (boundedness) | **still resolved, strengthened** | New in-memory structures are bounded: queue dedups by key (≤ distinct dirty units), hydration dedup set keyed by chunk, coalesced single-probe sink bookkeeping, listener Sets with unsubscribe, and `AutosaveCoordinator.flush()` now carries a hard 128-round cap so continuous concurrent marking cannot extend a pagehide flush indefinitely. Tests: facade 200-cycle boundedness, churn-test structure-size assertions. |

## New findings surfaced by the campaign (all closed in-tree)

1. **Latent silent restore failure (fixed).** The pre-hardening `loadPlayerState` try/catch also
   swallowed a guaranteed `TypeError` — `this.experience.restore` executed before
   `ExperienceSystem` construction — so player-state restore had always been a silently partial
   operation. Removing the silent catch (DL-001 remediation) exposed it as a boot crash;
   root-fixed by constructing `ExperienceSystem` before any persisted-state application
   (`src/engine/Game.ts`). Cited as concrete evidence for DL-001's severity.
2. **Migration truncation bug (fixed).** Legacy column conversion dropped every edit at local
   y ≥ 16 (capacity 4096 vs chunk volume 16,384) and could not distinguish "edited to air" from
   "untouched". Fixed via the faithful `chunk-edits` store (schema v6) + corrected section
   decoding; regression tests at index 16000 (unit) and index 12000 (browser E2E #4).
3. **Flush termination bound (hardened).** `flush()` progress-reset semantics allowed unbounded
   draining under continuous concurrent enqueue traffic; capped at 128 rounds (see REL-006 row).

## New finding surfaced by canonical CI proof (Gate F) — closed in-tree

6. **NEW-6 visual-regression goldens were single-environment (fixed).** Discovered 2026-08-23
   while executing Gate F: the first canonical CI run on published SHA `ec6989b`
   (run 32577467105) finished `gate` SUCCESS but `e2e` FAILED — the Change 245 visual matrix
   compared ubuntu-latest captures against workstation-pinned goldens. Evidence: 54 cells
   exceeded-threshold at fractions 0.015–0.049 against unchanged bounds (0.02 full-frame /
   0.015 clipped), and all six debug-overlay cells dimension-mismatched (139 px golden width =
   Windows Consolas vs 149 px actual = Linux monospace fallback; OS font metrics change the
   element's intrinsic box). Root cause: captured pixels are renderer- and font-environment
   dependent, so one global golden set cannot serve two environments — the suite had only ever
   completed on its authoring workstation (the pre-split single CI job timed out during E2E,
   masking this). Remediation (no requirement weakened): environment-scoped baseline sets under
   `tests/visual-golden/<environment>/` resolved by `resolveGoldenEnvironment()`
   (`tests/visual/matrix.ts`); thresholds, cell count, verify/update semantics unchanged; CI
   seeding via `.github/workflows/seed-visual-goldens.yml`; 245's matrix-manifest and
   capture-harness specs amended with dated rationale; provenance in
   `tests/visual-golden/README.md`.

## PH-7 incremental adversarial pass against the published remediation tree (2026-08-23)

Scope: the production `src/` delta between the Gate E audit snapshot (`32b0e76`) and the
published remediation checkpoint `aa92a5c` — the nine-commit deep-engine wave plus gate-defect
fixes (63 files, +8283/−866), none of which existed at audit time. Method: risk-based targeted
review over the persistence/durability intersection first, then lifecycle/concurrency,
determinism, security surface, and resource bounds, cross-checked against the suites that ran
green in canonical CI run 32589457819 on that exact SHA.

1. **Durability seams intact through the wave rewrite.** `World.captureChunkEdits` (World.ts:383),
   eviction→`retainEvictedChunkEdits` handoff (World.ts:1175-1186), hydration resident-wins race
   guard (World.ts:1139-1141), and restore-on-regen (World.ts:1085) are unchanged in behavior;
   `main.ts:40-47` still composes + opens `GamePersistence` BEFORE `Game`. The >10,051-chunk churn
   unit test and both ProductionComposition tests pass on this tree.
2. **Worker lifecycle integrity.** The gate-fixed cancel/cancelByToken slot-capacity leak is
   present (WorkerPool.ts:276/320/470 drain freed capacity immediately); stale/malformed worker
   messages are rejected BEFORE any caller callback (WorkerPool.handleMessage:425-450;
   WorkerJobClient.resolveResult:278-290); malformed mesh payloads never resolve a job
   (WorkerMeshing.ts:372/408 abandon-or-null).
3. **Bounded catch-up.** `FixedTickDriver` bounds catch-up at `maxCatchUpTicks` (default 5),
   discards and reports excess debt (FixedTickDriver.ts:100 → SimulationClock maxTicksPerFrame);
   no unbounded spiral under stalls.
4. **Security surface probe over the full delta:** added lines contain zero `eval(`/`new Function`,
   zero `fetch`/`XMLHttpRequest`/`WebSocket`, zero `localStorage` access additions, zero dynamic
   `import()`/child-process use. The wave introduced no new I/O or privilege surface.
5. **Determinism/resource bounds:** worldgen v2 matrix hash + fingerprint pinned in source;
   replay suite, worldgen matrix, and visual matrices green in the same canonical run;
   MemoryResourceBudget/RenderBudget/TickBudgetMonitor/entity-activation-LOD bound work with
   dedicated budget tests green.
6. **Observations (non-blocking):** (a) `WorkerPool` isolates caller `onResult` exceptions after
   the job is resolved (WorkerPool.ts:461-465) — deliberate loop protection, callers own retries;
   (b) dropped catch-up debt is silent at the driver level beyond its counters — by-design
   simulation-time compression under stall, never persisted-state loss. Neither weakens any
   mandatory finding.

Verdict: **no blocking data-loss/corruption/determinism/security/regression finding exists in the
published delta**. PH-7's outstanding item ("independent dynamic pass against the final published
tree") is satisfied by this pass combined with the canonical green run on the exact SHA.

## Gate E completion status

- [x] REAUDIT-1 current-source citations above (file-level; line numbers drift with edits — see
      function names for stable anchors)
- [x] REAUDIT-2 DL-001/DL-002/DL-005 resolved with implementation + test evidence
- [x] REAUDIT-3 related findings re-evaluated (DL-003, DL-004, SEC-001, REL-004, REL-006/PE-004);
      no newly discovered blocker remains open in-tree
- [x] Independent dynamic adversarial pass against the final tree — complete; all surfaced
      findings dispositioned in-tree (see Independent pass verdict above)
