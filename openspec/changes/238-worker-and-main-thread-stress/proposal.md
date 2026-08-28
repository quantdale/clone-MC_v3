# Proposal: 238-worker-and-main-thread-stress

## Problem

The worker-dispatched job systems (worldgen 086, section meshing 065/070) and the main-thread
hot-path systems (light propagation 066-069, save queue 038, A* pathfinding 135) have correctness
contracts and bounded-work primitives, but **no saturation contract**. There is no automated,
headless way to prove the engine still holds its frame and tick budgets when these systems are driven
at worst-case volume: hundreds of meshing jobs, hundreds of generation columns, dense light passes,
a full dirty-save queue, and a saturated pathfinder at once. Backpressure, cancellation/stale-job
handling, budget violation detection, and per-job latency under load are untested as a unit.

`075-render-performance-contract` established the frame-side budget and an injectable-clock monitor;
`044`/`224` bound tick catch-up (`maxTicksPerFrame`). Neither is validated under saturation, and there
is no tick-budget dimension (a `TickSystem` that overruns its per-tick share is not detected).

## Goals

- A headless **worker/main-thread saturation framework** that drives each of generation, meshing,
  light, save, and pathfinding at worst-case volume through a deterministic, injectable-clock
  measurement harness.
- **Backpressure** on worker job dispatch: a bounded pending-job cap with deterministic rejection
  beyond it, so a saturated queue cannot grow without bound.
- **Cancellation / stale-job** correctness under saturation: cancelled or late/duplicate worker
  results are rejected exactly once and never corrupt main-thread state, even at full load.
- **Concrete measurable budgets** (mean/p95/total latency, throughput, bounded-work counts) for each
  of the five areas, each with a defined headless measurement method and a budget-violation verdict.
- **Frame and tick budget enforcement**: the existing 075 frame budget is validated under a saturated
  frame loop, and a new per-tick budget detects a `TickSystem` overrunning its tick share without
  silently consuming unbounded wall time.

## Non-goals

- **Long-session memory / GPU leak validation** (change 239) — no multi-minute soak or leak-trend
  assertions here.
- **Release-tier budget tuning** (change 247) — 238 defines the internal stress budgets and
  measurement method; 247 consumes them as the release gate. 238 does not pick hardware tiers.
- **Network/adversarial stress** (changes 236/237) — saturation is confined to the worker job path
  and the main-thread simulation/rendering systems, not the network boundary.
- **Worldgen golden regression fixtures** (change 102) and **visual regression** (245) — no new
  seed/golden or screenshot matrices.
- **Authoring new production simulation behavior** — the change adds measurement/enforcement modules
  and their tests; it does not extend meshing, generation, light, save, or pathfinding semantics.

## Preconditions

- Change 237 (`237-network-adversarial-validation`) is VERIFIED and advancement is allowed.
- The dependency systems (064/065/070/086/066-069/038/134/135/044/224/055/075) are implemented and
  verified as their own changes.
- `npm test` / `npm run test:e2e` green at the 237 baseline.

## Dependencies

- `064` `WorkerJobProtocol` / `WorkerJobClient` (submit, resolveResult, cancel, pendingCount).
- `065`+`070` `MeshWorkerClient` / `processMeshSectionRequest`.
- `086` `WorldgenWorkerClient` / `processWorldgenRequest`.
- `066`-`069` `LightStorage`, `SkyLightEngine.computeSkyLight`, `BlockLightEngine.computeBlockLight`,
  `LightUpdateEngine.updateLightAfterEdit`.
- `038` `DirtySaveQueue` (`markDirty`, `drain`, `SaveSink`).
- `134`+`135` `NavigationGridQuery` + `AStarPathfinding.findPath`/`isPathStale`.
- `044`+`224` `SimulationClock` (`TICK_MS`, `maxTicksPerFrame`) + `WorldTickProcess`.
- `055` `SimulationHarness`.
- `075` `RenderBudgetConfig` / `RenderPerformanceMonitor` / `evaluateRenderBudget`.

## Proposed change

New, additive, headless, pure/measurement modules and their unit tests:

- `src/rendering/WorkerSaturationHarness.ts` (NEW) — `WorkerSaturationConfig`, budget constants,
  `runMeshSaturation` (burst through `MeshWorkerClient`), `runWorldgenSaturation` (burst through
  `WorldgenWorkerClient`), `evaluateWorkerSaturation`, deterministic injectable-clock measurement and
  a `maxPendingJobs` backpressure cap.
- `src/rendering/LightSaturation.ts` (NEW) — `LightSaturationConfig`, `runLightSaturation`
  (sky+block pass), `runLightEditSaturation` (`updateLightAfterEdit` burst), `evaluateLightSaturation`.
- `src/storage/SaveQueueSaturation.ts` (NEW) — `SaveQueueSaturationConfig`, `runSaveSaturation`
  (DirtySaveQueue burst with an injected slow/failing `SaveSink`), `evaluateSaveSaturation`.
- `src/simulation/PathfindSaturation.ts` (NEW) — `PathfindSaturationConfig`, `runPathfindSaturation`
  (bounded `findPath` burst), `evaluatePathfindSaturation`.
- `src/simulation/TickBudgetMonitor.ts` (NEW) — `TickBudgetConfig`, `TickBudgetMonitor` wrapping a
  `TickSystem` with a per-tick wall budget and violation detection via injectable clock,
  `evaluateTickBudget`.

Frame-budget enforcement under saturation reuses 075's `RenderPerformanceMonitor`/`evaluateRenderBudget`
(no re-authoring). Five capability specs define the contracts; a saturation test suite
(`tests/unit/*Saturation.test.ts`) drives each area at worst-case volume and asserts budgets and
backpressure/cancellation/stale behavior.

## Compatibility and migration

Additive. All new modules; no existing module or payload changes. No stored data or wire-protocol
changes (worker envelopes stay `WORKER_PROTOCOL_VERSION`/`WORLDGEN_PROTOCOL_VERSION` 1). No migration.

## Risks

- **CI wall-clock variance**: throughput budgets measured with `performance.now()` are median-based
  over repeated runs with a documented warmup and fixed payloads; functional determinism uses
  injectable clocks. Budgets are starting values validated by the harness and tuned against the
  measured baseline (recorded in `verification.md`).
- **Over-specifying production layout**: the implementing agent reconciles module placement per the
  protocol's final reconciliation step; the specs are the contract, the design sketches intent.

## Rollback strategy

Revert the commit. Additive modules and tests; no consumers depend on them, so removal is clean.

## Definition of Done

- Each of the five capability contracts is implemented and unit-tested headlessly.
- Every MUST/SHALL requirement has passing GIVEN/WHEN/THEN scenarios covering saturation,
  backpressure, cancellation/stale-job, budget-violation, and failure behavior as applicable.
- Budget configs validate strictly (positive finite numbers); the measurement harness reports a
  per-dimension + overall verdict deterministically.
- Worker dispatch enforces `maxPendingJobs`; cancelled and stale results are rejected exactly once
  under load; `findPath` honors `maxExpansions`/`isCancelled`; `DirtySaveQueue` is no-loss under a
  failing sink; light passes stay bounded and equivalence (069) is preserved under saturation edits.
- `TickBudgetMonitor` detects a per-tick overrun and reports a tick-budget violation; 075's frame
  budget reports a violation when a saturated frame loop exceeds its budget.
- Full baseline gate green; 238 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 238 saturation suites; E2E stays at the 237 baseline. `verification.md`
records actual measured budget values and any justified tuning.
