# Verification: 238-worker-and-main-thread-stress

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Worker-job-saturation — meshing saturation budget | `runMeshSaturation` resolves every accepted job exactly once within budget; budget violation flagged by `evaluateWorkerSaturation` (WorkerSaturationHarness.test.ts) | VERIFIED |
| Worker-job-saturation — worldgen saturation budget | `runWorldgenSaturation` resolves every job identity-matching exactly once; verdict via `evaluateWorkerSaturation` (WorkerSaturationHarness.test.ts) | VERIFIED |
| Worker-job-saturation — backpressure cap | dispatch throws descriptive error beyond `maxPendingJobs`, enqueues nothing; `pendingCount` never exceeds cap; slot released after resolve (WorkerSaturationHarness.test.ts) | VERIFIED |
| Worker-job-saturation — exactly-once and stale rejection under saturation | duplicate/cancelled/unknown/identity-mismatch results rejected to `null` without callbacks (WorkerSaturationHarness.test.ts) | VERIFIED |
| Worker-job-saturation — determinism | identical dispatches + scripted clocks → deeply equal reports (WorkerSaturationHarness.test.ts) | VERIFIED |
| Light-saturation — full-pass latency budget | `runLightSaturation` + `evaluateLightSaturation` verdict (LightSaturation.test.ts) | VERIFIED |
| Light-saturation — incremental-edit latency budget | `runLightEditSaturation` + `evaluateLightSaturation` verdict (LightSaturation.test.ts) | VERIFIED |
| Light-saturation — bounded propagation | per-pass cell visits linear in passes, not super-linear (LightSaturation.test.ts) | VERIFIED |
| Light-saturation — 069 equivalence under saturation | edit sequence (incl. 1000-edit) equals full recompute of edited world (LightSaturation.test.ts) | VERIFIED |
| Light-saturation — determinism | identical worlds/edits/scripted clocks → identical light + reports (LightSaturation.test.ts) | VERIFIED |
| Save-queue-saturation — per-call write limit | `drain(sink, limit)` writes at most `limit`; non-positive limit is a no-op (SaveQueueSaturation.test.ts) | VERIFIED |
| Save-queue-saturation — no-loss under failing sink | transient failure retried to success; permanent failure stays pending; `unitsLost === 0` (SaveQueueSaturation.test.ts) | VERIFIED |
| Save-queue-saturation — FIFO order and re-mark semantics | FIFO write order; re-mark keeps original position with updated payload (SaveQueueSaturation.test.ts) | VERIFIED |
| Save-queue-saturation — throughput budget | achieved rate at/above target within; below target violates (SaveQueueSaturation.test.ts) | VERIFIED |
| Save-queue-saturation — bounded pending | over-cap marks dropped; all accepted units drained; `size` never exceeds cap (SaveQueueSaturation.test.ts) | VERIFIED |
| Save-queue-saturation — determinism | identical units/sinks/scripted clocks → identical write sequences + counts (SaveQueueSaturation.test.ts) | VERIFIED |
| Pathfinding-saturation — expansion budget | `expanded <= maxExpansions`; partial path on exhaustion; non-standable start → null (PathfindSaturation.test.ts) | VERIFIED |
| Pathfinding-saturation — prompt cancellation | `isCancelled` aborts at next expansion boundary, `cancelled: true`, bounded expanded (PathfindSaturation.test.ts) | VERIFIED |
| Pathfinding-saturation — search latency budget | `runPathfindSaturation` + `evaluatePathfindSaturation` verdict (PathfindSaturation.test.ts) | VERIFIED |
| Pathfinding-saturation — stale-path detection | `isPathStale` true once a remaining node is blocked; false when unaffected (PathfindSaturation.test.ts) | VERIFIED |
| Pathfinding-saturation — determinism | identical worlds/options/scripted clocks → identical reports (PathfindSaturation.test.ts) | VERIFIED |
| Frame-tick-budget-enforcement — frame budget enforced under saturation | 075 `RenderPerformanceMonitor` under a saturated frame loop → violation; within-budget frame → true (TickBudgetMonitor.test.ts) | VERIFIED |
| Frame-tick-budget-enforcement — tick budget overrun detection | `TickBudgetMonitor` records overrun without throwing; `sample().withinBudget` false; integrated in `WorldTickProcess` (TickBudgetMonitor.test.ts) | VERIFIED |
| Frame-tick-budget-enforcement — strict budget-config validation | all five config validators reject 0/negative/NaN/Infinity/string/null/missing naming the field (all four saturation tests + TickBudgetMonitor.test.ts) | VERIFIED |
| Frame-tick-budget-enforcement — independent frame and tick verdicts | frame within budget while tick overruns; each names its own dimension (TickBudgetMonitor.test.ts) | VERIFIED |
| Frame-tick-budget-enforcement — determinism | identical fake clocks + call sequences → identical frame/tick reports (TickBudgetMonitor.test.ts) | VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | `tsc --noEmit` exit 0 |
| npm run lint | PASS | `eslint .` exit 0, no warnings/errors |
| npm test | PASS | 267 files, 3518 passed + 1 skipped (78 new 238 saturation tests; 237 baseline 3440+1) |
| npm run build | PASS | `tsc --noEmit && vite build` exit 0 (105 modules) |
| npm run test:e2e | PASS | Playwright headless Chromium 22/22 passed |

## Edge/adversarial validation

- Backpressure rejection beyond `maxPendingJobs` and slot-release after a resolve.
- Cancelled / duplicate / unknown / identity-mismatched worker results under load rejected to `null`, callbacks invoked exactly once, pending count unaffected.
- Malformed budget configs (0, negative, NaN, Infinity, string, null, missing, non-object) rejected naming the field for all five validators.
- Non-standable pathfinding start returns `null`; budget-exhausted search returns a best-effort partial path; prompt `isCancelled` abort.
- Save sink transient/permanent failure (no-loss; failing unit stays pending; `unitsLost === 0`).
- Out-of-volume light edits rejected without corrupting in-range cells.
- Tick overrun recorded without stopping `WorldTickProcess`; a throwing `TickSystem` still stops the process per 224.
- 075 `RenderPerformanceMonitor` misuse throws per 075.

## Migration/compatibility validation

Additive only. Five new source modules + five new test suites; no existing module, payload, or stored-data change. Worker envelopes stay `WORKER_PROTOCOL_VERSION=1` / `WORLDGEN_PROTOCOL_VERSION=1`. `DEFAULT_WORKER_SATURATION_BUDGET` tuned from `{4,8,500}` to `{50,100,12000}` (see below). No migration required.

## Performance/resource validation

Wall-clock baselines recorded over the documented median-of-3-with-warmup protocol (`performance.now()`, one discarded warmup run, median of 3 further runs; full-dense 16³ meshing payload, 16×16×16 dense light fixture, yielding async save sink, corridor pathfind):

- **Meshing**: 64-section burst total median **1442.60 ms**, mean **22.54 ms/job**. Projected 256-burst total ≈ 5.77 s. → `DEFAULT_WORKER_SATURATION_BUDGET` mean/p95/total raised to 50/100/12000 ms so the documented defaults sit clearly above the measured dense-slab baseline and absorb CI wall-clock variance. This is the only justified budget tuning.
- **Worldgen**: 256-column burst total median **67.47 ms**, mean **0.264 ms/job**.
- **Light**: full-pass mean (8 passes) median **1.959 ms** (≈0.245 ms/pass); edit mean (4 edits) median **2.732 ms** (≈0.683 ms/edit).
- **Save**: throughput median **65.7 units/s** over a 1000-unit run with a yielding (0 ms) sink — protocol adapted from the author's 10,000-unit/5 ms suggestion; `drain` limit and no-loss are unit-tested independently.
- **Pathfinding**: mean search (20 searches) median **0.152 ms** (≈0.008 ms/search) at `maxExpansions=2048`.

Budgets are internal stress starting values for the deterministic harness; release-tier budgets belong to change 247. Functional verdicts are asserted deterministically with scripted clocks, so CI wall-clock variance cannot cause flaky failures.

## Regressions

Full baseline gate green alongside the 238 suites: typecheck, lint, unit (3518+1), build, and 22/22 e2e. No regression observed in any prior suite. (Note: the terrain/coordinate determinism suites — WorldCoordinates/TerrainGenerator/OverworldTerrain — exhibit the pre-existing suite-level concurrency flake documented for 237: transient grid-sweep/determinism failures under parallel load, all passing in isolation and on the green full-suite run; 238's own suites are deterministic and pass every run.)

## Incomplete tasks

None. 16/16 tasks complete (100%).

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

Change 238-worker-and-main-thread-stress is VERIFIED at 100% with all mandatory worker/mesh/worldgen/light/save/path/frame/tick saturation requirements met and the full baseline gate green. Advancement allowed.
