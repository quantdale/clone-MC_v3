# Design: 238-worker-and-main-thread-stress

## Context / current state

The worker job path and the main-thread hot systems each carry correctness and bounded-work
primitives, but no saturation contract and no headless way to enforce frame/tick budgets at
worst-case volume.

- **Worker protocol (064)** — `src/rendering/WorkerJobProtocol.ts` exposes `WORKER_PROTOCOL_VERSION=1`,
  envelope validators, and `WorkerJobClient` (`submit(kind,payload) -> jobId`, `resolveResult(input)`
  exactly-once with stale/duplicate/unknown rejection, `cancel(jobId)`, `pendingCount`). There is no
  real worker pool yet: the protocol is a pure dispatcher; a saturation harness drives it through the
  same client surface.
- **Section meshing (065/070)** — `src/rendering/WorkerMeshing.ts`: `MeshSectionRequestPayload`
  (`cells[4096]`, `opaqueIds`, `skyLight[4096]`, `blockLight[4096]`), pure `processMeshSectionRequest`,
  and `MeshWorkerClient` (`requestSection`, `handleMessage`, `cancel`, `pendingCount`).
- **Worldgen (086)** — `src/worldgen/WorkerWorldgen.ts`: `WorldgenRequestPayload { columnX, columnZ,
  seed, stage }`, identity-echo `WorldgenResultPayload` with `generationVersion`, pure
  `processWorldgenRequest`, and `WorldgenWorkerClient` requiring identity match and exactly-once
  dispatch. `GenerationPipeline` (085) tracks `TERRAIN..FINAL` stages forward-only.
- **Light (066-069)** — main-thread BFS passes: `LightStorage` nibble arrays, `SkyLightEngine
  .computeSkyLight`, `BlockLightEngine.computeBlockLight`, `LightUpdateEngine.updateLightAfterEdit`
  (remove + re-propagate, equivalent to a full recompute, fixed neighbor order). No worker offload and
  no latency budget.
- **Save (038)** — `src/storage/DirtySaveQueue.ts`: `markDirty(unit)` (FIFO, de-duped by key),
  `drain(sink, limit)` (bounded per-call writes, no-loss re-queue on failure), `size/has/keys/clear`.
- **Pathfinding (135)** — `src/simulation/AStarPathfinding.ts`: `findPath(world, start, goal, {
  height, maxExpansions=2048, isCancelled })` with best-effort partial path and `expanded` count;
  `isPathStale(world, path, fromIndex, height)`. `NavigationGridQuery` (134) supplies
  `classifyNode/canStandAt/movementCost`.
- **Tick (044/224)** — `SimulationClock` (`TICK_RATE=20`, `TICK_MS=50`, `maxTicksPerFrame=10`,
  bounded catch-up) and `WorldTickProcess` (ordered `TickSystem` list, `update`/`step`, failure
  stops the process). `SimulationHarness` (055) offers `step/stepUntil/snapshot/restore/reset/run`.
- **Frame budget (075)** — `RenderBudgetConfig` (5 dimensions, positive-finite validation),
  `evaluateRenderBudget` (per-dimension `actual <= budget`, malformed actuals violate), and
  `RenderPerformanceMonitor` (injectable `now()`, begin/end frame and mesh build, draw-call/memory/
  distance recording). No tick budget exists.

## Target state

A headless saturation framework proves the engine holds frame/tick budgets under worst-case volume:

- **Worker saturation harness** drives `MeshWorkerClient` and `WorldgenWorkerClient` with a fixed
  burst, measures per-job latency (injectable clock for determinism; `performance.now()` for
  wall-clock throughput), enforces a `maxPendingJobs` backpressure cap, and evaluates a budget
  verdict.
- **Light saturation** measures full sky/block passes and incremental-edit passes over a fixed dense
  volume within a latency budget, keeping 069 equivalence under the saturated edit sequence.
- **Save saturation** drives `DirtySaveQueue` with a slow/failing injected `SaveSink`, asserting the
  per-call write limit, no-loss retry, FIFO order, and a throughput budget.
- **Pathfind saturation** drives bounded `findPath` bursts, asserting `maxExpansions`/`isCancelled`
  under load and a latency budget, plus `isPathStale`.
- **Frame/tick budget enforcement** validates 075's frame budget under a saturated frame loop and
  adds `TickBudgetMonitor` to detect a `TickSystem` overrunning its per-tick share.

## Invariants

- Every budget config field is a positive finite number (validated at construction/load).
- Evaluation verdict: a dimension is within budget iff `actual <= budget`; non-finite or negative
  actuals violate. Overall verdict is within only when every dimension is.
- Worker dispatch MUST NOT exceed `maxPendingJobs` pending jobs; submission beyond it is rejected
  deterministically and enqueues nothing.
- Each job resolves exactly once; cancelled, duplicate, unknown, and identity-mismatched results are
  rejected (`null`, callback not invoked) even under full saturation.
- `findPath` MUST NOT pop more than `maxExpansions` nodes and MUST abort within one expansion of
  `isCancelled` returning true.
- `DirtySaveQueue.drain` MUST NOT write more than `limit` units per call and MUST NOT lose a unit on
  write failure (re-queued for retry).
- Light passes over the fixed volume MUST visit each cell a bounded number of times; `updateLightAfterEdit`
  MUST equal a full recompute of the edited world (069 equivalence) regardless of edit volume.
- Deterministic suites MUST use injectable clocks; only wall-clock throughput suites use
  `performance.now()`, and those are median-based with warmup.

## API and data model

```ts
// src/rendering/WorkerSaturationHarness.ts (NEW)
export interface WorkerSaturationConfig {
  burstCount: number;            // jobs submitted per run
  maxPendingJobs: number;        // backpressure cap
  maxMeanJobMillis: number;      // budget: mean per-job latency
  maxP95JobMillis: number;       // budget: p95 per-job latency
  maxTotalMillis: number;        // budget: whole-burst wall time
}
export interface WorkerJobMeasurement { jobId: string; ok: boolean; latencyMillis: number; }
export interface WorkerBudgetEntry { dimension: 'mean' | 'p95' | 'total'; budget: number; actual: number; withinBudget: boolean; }
export interface WorkerSaturationReport { withinBudget: boolean; entries: WorkerBudgetEntry[]; results: WorkerJobMeasurement[]; rejectedCount: number; }
export const DEFAULT_WORKER_SATURATION_BUDGET: WorkerSaturationConfig; // documented starting values
export function validateWorkerSaturationConfig(input: unknown): WorkerSaturationConfig;
// The real 064/086 clients are synchronous pure dispatchers (there is no async pool), so the
// dispatch abstraction is synchronous and drives the exact client surface.
export interface WorkerDispatch {
  submit(payload: unknown): string;          // throws if submission would exceed maxPendingJobs
  awaitResult(jobId: string): unknown | null; // computes + resolves the worker result exactly once
  cancel(jobId: string): boolean;
  pendingCount(): number;
}
export function createMeshDispatch(client: MeshWorkerClient, maxPendingJobs: number): WorkerDispatch;
export function createWorldgenDispatch(client: WorldgenWorkerClient, maxPendingJobs: number): WorkerDispatch;
export function runMeshSaturation(config: WorkerSaturationConfig, dispatch: WorkerDispatch, now: () => number): WorkerSaturationReport;
export function runWorldgenSaturation(config: WorkerSaturationConfig, dispatch: WorkerDispatch, now: () => number): WorkerSaturationReport;
export function evaluateWorkerSaturation(config: WorkerSaturationConfig, actual: { meanMillis: number; p95Millis: number; totalMillis: number }): WorkerSaturationReport;

// src/rendering/LightSaturation.ts (NEW)
export interface LightSaturationConfig { volumeWidth: number; volumeHeight: number; volumeDepth: number; maxFullPassMeanMillis: number; maxEditMeanMillis: number; iterations: number; }
export interface LightEdit<W extends LightUpdateWorld = LightUpdateWorld> { x: number; y: number; z: number; apply(world: W): void; }
export interface DenseLightWorld extends LightUpdateWorld { clearLight(): void; }
export function runLightSaturation(world: DenseLightWorld, config: LightSaturationConfig, now: () => number): LightSaturationReport;
export function runLightEditSaturation<W extends LightUpdateWorld>(world: W, edits: LightEdit<W>[], config: LightSaturationConfig, now: () => number): LightSaturationReport;
export function evaluateLightSaturation(config: LightSaturationConfig, actual: { fullPassMeanMillis: number; editMeanMillis: number }): LightSaturationReport;

// src/storage/SaveQueueSaturation.ts (NEW)
export interface SaveQueueSaturationConfig { maxPendingUnits: number; maxUnitsPerSecond: number; iterations: number; sinkWriteMillis: number; }
export function runSaveSaturation(queue: DirtySaveQueue, sink: SaveSink, units: SaveUnit[], config: SaveQueueSaturationConfig, now: () => number): Promise<SaveSaturationReport>;
export function evaluateSaveSaturation(config: SaveQueueSaturationConfig, actual: { unitsPerSecond: number; dropped: number }): SaveSaturationReport;

// src/simulation/PathfindSaturation.ts (NEW)
export interface PathfindSaturationConfig { maxExpansions: number; maxMeanSearchMillis: number; iterations: number; }
export function runPathfindSaturation(world: NavigationWorld, start: PathNode, goal: PathNode, config: PathfindSaturationConfig, now: () => number): PathfindSaturationReport;
export function evaluatePathfindSaturation(config: PathfindSaturationConfig, actual: { meanSearchMillis: number; maxExpanded: number }): PathfindSaturationReport;

// src/simulation/TickBudgetMonitor.ts (NEW)
export interface TickBudgetConfig { maxTickMillis: number; }  // per-tick wall budget
export class TickBudgetMonitor {   // wraps a TickSystem; injectable now()
  constructor(system: TickSystem, opts: { now: () => number; config: TickBudgetConfig });
  tick(tick: number): void;                    // times inner system, records overruns, does not throw
  get lastTickMillis(): number;
  get maxTickMillis(): number;
  get overruns(): number;
  get lastOverrunMillis(): number;
  sample(): { lastTickMillis: number; overruns: number; lastOverrunMillis: number; withinBudget: boolean };
}
export function evaluateTickBudget(config: TickBudgetConfig, actual: { lastTickMillis: number }): TickBudgetEntry;
export const DEFAULT_TICK_BUDGET: TickBudgetConfig;
```

Sketches describe intent and do not override the normative spec requirements.

## Control / data flow

1. **Worker saturation** — the harness submits a burst through an injected synchronous `WorkerDispatch`
   (which wraps `MeshWorkerClient` or `WorldgenWorkerClient`); each job's latency is captured with the
   injectable `now()`. The dispatch enforces `maxPendingJobs` up front; submissions that would exceed the
   cap throw a descriptive error and are counted as rejected (never enqueued). `awaitResult` computes the
   real pure job (`processMeshSectionRequest` / `processWorldgenRequest`) and resolves it through the 064
   client exactly once; stale/cancelled/duplicate/identity-mismatched results are dropped.
2. **Light saturation** — `runLightSaturation` runs full sky+block passes on a fixed dense volume
   (clearing light before each pass) and `runLightEditSaturation` applies a sequence of `LightEdit`
   mutations through `updateLightAfterEdit`, timing each pass and tracking bounded per-cell visits.
3. **Save saturation** — `runSaveSaturation` marks `units` into a `DirtySaveQueue` and drains in
   bounded batches through an injected slow/failing `SaveSink`, counting successful writes, retries,
   and any lost units.
4. **Pathfind saturation** — `runPathfindSaturation` runs `findPath` over a fixed world with a fixed
   `maxExpansions`, timing each search and asserting `expanded <= maxExpansions`.
5. **Tick budget** — a test wires a slow `TickSystem` through `TickBudgetMonitor` inside
   `WorldTickProcess`; the monitor records the per-tick elapsed time and reports a violation when it
   exceeds `maxTickMillis`.

## Detailed behavior

- `runMeshSaturation`/`runWorldgenSaturation` reuse the exact 064/086 client semantics; the injected
  dispatch must surface the resolved payload and invoke callbacks exactly once. The report lists every
  job's outcome so a lost or duplicated resolution is observable.
- `evaluateWorkerSaturation`/`evaluateLightSaturation`/`evaluateSaveSaturation`/`evaluatePathfindSaturation`
  mirror 075: per-dimension `withinBudget = actual <= budget`, malformed actuals violate, overall =
  all within.
- `TickBudgetMonitor.tick` times the inner system, never throws on an overrun (records it), and
  exposes `overruns`, `lastOverrunMillis`, and a `sample()` verdict. An infinite/very long inner tick
  is the failure case the budget exists to surface.
- `DirtySaveQueue` failure semantics are preserved exactly: the harness must not change no-loss
  behavior; it only measures and asserts it.

## Failure modes

- Submission beyond `maxPendingJobs` → deterministic rejection error; nothing enqueued.
- Stale/duplicate/unknown/identity-mismatched worker result → `null`, callback not invoked; main
  state unchanged.
- Malformed budget config → descriptive `Error` naming the field.
- `findPath` budget exhaustion → best-effort partial path with `reachedGoal: false`, `expanded` capped.
- Sink write failure → unit re-queued; never dropped.
- Tick overrun → reported by `TickBudgetMonitor` (non-throwing by default); a test may assert the
  violation. A throwing `TickSystem` still stops `WorldTickProcess` per 224 semantics (unchanged).

## Compatibility / migration

Additive. No changes to existing modules, worker envelopes, or stored data. New modules are not wired
into production paths (harness-only), so no runtime behavior change; the budget enforcement surfaces
through the new monitor's `sample()`/reports, consumed by tests and the stress suite.

## Performance / resource constraints

All measurement calls are O(burst) or O(volume) with no unbounded allocation. Budgets are the
contract; starting values (documented constants) are validated and tuned against the measured
baseline, with the actual values and any adjustment recorded in `verification.md`. The tick budget
(`maxTickMillis`, e.g. 8.33 ms) is intentionally below the 50 ms tick so an overrun is caught early.

## Testing seams

- `tests/unit/WorkerSaturationHarness.test.ts` — backpressure rejection, exactly-once resolution,
  stale/cancel under load, budget evaluation, scripted-clock determinism, config validation.
- `tests/unit/LightSaturation.test.ts` — full-pass and edit-pass latency, 069 equivalence under the
  saturated edit sequence, budget evaluation.
- `tests/unit/SaveQueueSaturation.test.ts` — drain limit, no-loss retry, throughput budget, FIFO
  order, config validation.
- `tests/unit/PathfindSaturation.test.ts` — `maxExpansions`/`isCancelled` under load, latency budget,
  `isPathStale`, determinism.
- `tests/unit/TickBudgetMonitor.test.ts` — overrun detection, non-throwing recording, verdict,
  integration inside `WorldTickProcess`.
- A frame-budget-under-saturation suite reuses 075's `RenderPerformanceMonitor` with a fake clock.

## Observability / debugging

Reports name the failing dimension with budget vs actual. The worker saturation report lists every
job's `ok`/`latencyMillis` so a lost or duplicated resolution is directly visible. `TickBudgetMonitor`
exposes `overruns`/`lastOverrunMillis` for diagnosing a hot `TickSystem`.

## Affected files / symbols

- `src/rendering/WorkerSaturationHarness.ts` — NEW.
- `src/rendering/LightSaturation.ts` — NEW.
- `src/storage/SaveQueueSaturation.ts` — NEW.
- `src/simulation/PathfindSaturation.ts` — NEW.
- `src/simulation/TickBudgetMonitor.ts` — NEW.
- `tests/unit/WorkerSaturationHarness.test.ts`, `LightSaturation.test.ts`,
  `SaveQueueSaturation.test.ts`, `PathfindSaturation.test.ts`, `TickBudgetMonitor.test.ts` — NEW.
- Consumed (read-only): `WorkerJobProtocol`, `WorkerMeshing`, `WorkerWorldgen`, `LightStorage`,
  `SkyLightEngine`, `BlockLightEngine`, `LightUpdateEngine`, `DirtySaveQueue`, `NavigationGridQuery`,
  `AStarPathfinding`, `SimulationClock`, `WorldTickProcess`, `SimulationHarness`, `RenderBudget`,
  `RenderPerformanceMonitor`.

## Rejected alternatives

- *A single monolithic stress spec/module*: the five areas are independently testable contracts;
  separate specs keep each requirement set testable and the change narrow.
- *An async `WorkerDispatch` (Promise-returning `request`/`requestMany`)*: the actual 064/086 clients
  are synchronous pure dispatchers with no worker pool, so an async abstraction would be fictitious and
  complicate deterministic measurement. The implemented dispatch is synchronous and drives the exact
  client surface; `requestMany` is folded into `runMeshSaturation`/`runWorldgenSaturation` submission
  loops.
- *Light `edits: Array<[x,y,z]>` (coordinates only)*: `updateLightAfterEdit` depends on world state that
  changes between edits, so the harness must mutate the world; a coordinate tuple alone cannot express a
  place/break/source edit. The implemented `LightEdit.apply(world)` mutates the world before each update,
  which is what makes the 069 equivalence check meaningful.
- *Long-session soak in 238*: belongs to 239; 238 is bounded, deterministic saturation, not leaks.
- *Re-using only real wall-clock timing*: deterministic functional suites need injectable clocks;
  wall-clock is reserved for median-based throughput budgets.
- *Modifying the production hot systems to add budgets inline*: the change stays additive by wrapping
  measurement around existing clients/systems; only `maxPendingJobs` backpressure is new dispatch
  behavior.

## Downstream dependencies

- 239 (`long-session-memory-stress`) builds on the measurement harness patterns established here.
- 247 (`performance-release-gate`) consumes these budgets/measurement methods as its release tiers.
- The saturation suites protect 064-069, 038, 134/135, 044/224, and 075 from regressions as later
  content (215-221) and multiplayer (222-237) changes land.
