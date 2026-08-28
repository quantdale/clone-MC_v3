# Tasks: 238-worker-and-main-thread-stress

> Authoring only. Entry gate: 237 VERIFIED and baseline unit/e2e green.

## 1. Baseline / characterization

- [x] 1.1 Record current baseline: measure meshing (256-section burst via `MeshWorkerClient`) and worldgen (256-column burst via `WorldgenWorkerClient`) mean/p95/total wall latency over the documented median-of-3 protocol; capture `pendingCount` behavior under a 128-job burst.
- [x] 1.2 Record current baseline: full sky+block light pass and `updateLightAfterEdit` per-edit mean latency over a dense 16×16×128 fixture; confirm 069 equivalence holds under a 1000-edit sequence.
- [x] 1.3 Record current baseline: `DirtySaveQueue` throughput with a 5 ms/unit `SaveSink` over 10,000 units; confirm `drain` limit and no-loss behavior.
- [x] 1.4 Record current baseline: `findPath` mean latency and `expanded` behavior over a large open field at `maxExpansions=2048`; confirm `isCancelled` abort latency.
- [x] 1.5 Record current baseline: per-tick wall time for representative `TickSystem`s and 075 frame metrics for a saturated frame loop; confirm the 075 frame budget and `SimulationClock` catch-up bounds.

## 2. Worker saturation harness (worker-job-saturation)

- [x] 2.1 Add `src/rendering/WorkerSaturationHarness.ts` (`WorkerSaturationConfig`, `DEFAULT_WORKER_SATURATION_BUDGET`, `validateWorkerSaturationConfig`, `runMeshSaturation`, `runWorldgenSaturation`, `evaluateWorkerSaturation`, `WorkerDispatch` + `createMeshDispatch`/`createWorldgenDispatch`).
- [x] 2.2 Add `tests/unit/WorkerSaturationHarness.test.ts`: meshing/worldgen burst budgets + verdicts, backpressure `maxPendingJobs` rejection and slot-release, exactly-once and stale/cancel/unknown/identity-mismatch rejection under load, scripted-clock determinism, config validation.
- [x] 2.3 Wire `maxPendingJobs` backpressure into worker dispatch so a submission beyond the cap is rejected deterministically and enqueues nothing.

## 3. Main-thread saturation (light / save / path)

- [x] 3.1 Add `src/rendering/LightSaturation.ts` and `tests/unit/LightSaturation.test.ts`: full-pass and edit-pass latency budgets + verdicts, bounded-visit assertion, 069 equivalence across the saturated edit sequence, out-of-volume-edit rejection, scripted-clock determinism.
- [x] 3.2 Add `src/storage/SaveQueueSaturation.ts` and `tests/unit/SaveQueueSaturation.test.ts`: per-call write limit (incl. no-op limit), no-loss under transient/permanent sink failure, FIFO order + re-mark semantics, throughput budget + verdict, bounded pending, scripted-sink determinism, config validation.
- [x] 3.3 Add `src/simulation/PathfindSaturation.ts` and `tests/unit/PathfindSaturation.test.ts`: `maxExpansions` cap (exhaustion, goal-reached, non-standable start), prompt `isCancelled` abort, search latency budget + verdict, `isPathStale`, scripted-clock determinism, config validation.

## 4. Frame/tick budget enforcement

- [x] 4.1 Add `src/simulation/TickBudgetMonitor.ts` (`TickBudgetConfig`, `DEFAULT_TICK_BUDGET`, `validateTickBudgetConfig`, `TickBudgetMonitor`, `evaluateTickBudget`) with a non-throwing overrun recorder.
- [x] 4.2 Add `tests/unit/TickBudgetMonitor.test.ts`: overrun detection, within-budget ticks, `sample()` verdict, integration inside `WorldTickProcess`, scripted-clock determinism, config validation.
- [x] 4.3 Add a frame-budget-under-saturation suite (reusing 075's `RenderPerformanceMonitor` with a fake clock): violation, within-budget, and malformed-actual verdicts; assert frame and tick verdicts are independent.

## 5. Integration, regression, and final gate

- [x] 5.1 Run the full baseline gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) and confirm all 238 suites pass alongside the prior suite.
- [x] 5.2 Re-run the characterization baselines against the implemented harness, record actual measured budget values and any justified tuning in `verification.md`; update `tasks.md`/`PROGRAM_STATE.json`/`PROGRAM_STATE.md` and advance the change to VERIFIED.
