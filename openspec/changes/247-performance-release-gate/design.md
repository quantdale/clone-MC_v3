# Design: 247-performance-release-gate

## Context/current state

Performance measurement exists only in isolated, domain-specific places, with no unified tier or
release verdict:

- **Frame (075, VERIFIED):** `src/rendering/RenderBudget.ts` declares `RenderBudgetConfig` with
  five dimensions (`maxDrawCalls`, `maxMeshBuildMillis`, `maxFrameTimeMillis`,
  `maxGeometryMemoryBytes`, `maxRenderDistanceChunks`) and `DEFAULT_RENDER_BUDGET`
  (1500 / 8 / 16.7 / 256 MiB / 12). `validateRenderBudgetConfig` enforces positive finite numbers;
  `evaluateRenderBudget` yields per-dimension + overall verdict with boundary equality within
  budget and non-finite/negative actuals as violations. `src/rendering/RenderPerformanceMonitor.ts`
  aggregates per-frame metrics with an injectable clock (begin/end frame, begin/end mesh build,
  setters, `sample()`, `evaluate()`), throwing on misuse.
- **Tick (224/044, VERIFIED):** `src/simulation/WorldTickProcess.ts` is the headless authoritative
  tick process; it drives `TickSystem`s once per tick with 1-based tick numbers over an injected
  `SimulationClock` (`TICK_RATE = 20`, `TICK_MS = 50`, `maxTicksPerFrame` default 10). A throwing
  system stops the process (`isStopped`/`lastError`, later drives rethrow until `reset()`).
- **Load/save (234, VERIFIED):** `src/simulation/ServerSaveLifecycle.ts` owns the state machine
  `unloaded -> loading -> running -> flushing -> closed`, loads through an injected
  `SaveLoadBoundary` (`readWorld`/`write`/`writePlayerState`) via the shared `WorldSaveCodec`
  (all-or-nothing load), and drains bounded autosave batches (`limitPerDrain` 64,
  `autosaveEveryTicks` 100) plus `flush()`/`saveAndClose()` with a zero-progress guard.
- **Network (236, authored as specs only):** `MultiClientHarness`, `MultiClientMetricsCollector`,
  `MultiClientBudgets`, `validateMultiClientBudgets`, `evaluateMultiClientBudgets` are declared in
  `src/simulation/MultiClientLoadHarness.ts` by the 236 package but **not yet implemented**.
  Defaults in the 236 performance spec: `minTicksPerSecond` 200, `maxElapsedMsForTicks` 6000 for
  the canonical `BASELINE_LOAD` scenario (4 clients, viewDistance 4 → 81-column interest, 1024
  entities, 40-slot windows, 1200 ticks), plus structural message ceilings
  (`maxChunkAddedPerClient` 81, in-range entity spawn, queued inventory acceptance).
- **055 `SimulationHarness`:** the test-side single-process tick harness (snapshot/restore replay).

There is **no** hardware-tier concept, no cross-domain budget matrix, no `ReleasePerformanceGate`,
and **no** benchmark scripts in `package.json` (confirmed by search). All five domains must be
measured by a common release gate with concrete budgets.

## Target state

A pure, headless, deterministic `ReleasePerformanceGate` that:

1. Declares the closed tier set and a validated per-tier × per-dimension budget matrix covering
   frame, tick, load, save, and network.
2. Provides per-domain headless measurement procedures that produce a typed `ReleaseMeasurementBundle`.
3. Evaluates `(config, tier, bundle)` into a fail-closed per-dimension + overall PASS/FAIL verdict
   following the 075/236 conventions.
4. Ships headless fixture scenarios (unit tests) that demonstrate the gate on every domain and
   record actuals in `verification.md`.

## Invariants

- **Closed tiers:** the tier set is exactly `Low | Medium | High | Ultra`; no other value is a
  legal tier.
- **Positive-finite budgets:** every numeric budget value is a positive finite number; validation
  enforces it and rejects malformed configs without returning a partial config.
- **Budget evaluation:** per-dimension `withinBudget = actual <= budget`; boundary equality is
  within budget; a non-finite, negative, or *missing* actual is a violation.
- **Fail-closed gate:** the overall verdict is within only when every dimension of the selected
  tier is within budget; the report names every failing dimension with budget vs actual.
- **Purity/determinism:** `validateReleaseBudgetConfig` and `evaluateReleaseGate` are pure
  functions — identical inputs produce identical outputs; the tier is an explicit argument, never
  inferred from the machine.
- **No production coupling:** the gate and its measurement drivers only *consume* the 075/224/234/
  236 seams; no production module is modified.

## API and data model

Concrete sketches (intent only; the normative contract is in the capability specs).

```ts
// src/simulation/ReleasePerformanceGate.ts (NEW)
export type ReleaseTier = 'Low' | 'Medium' | 'High' | 'Ultra';
export const RELEASE_TIERS: readonly ReleaseTier[]; // the closed set, fixed order

export type FrameBudgetDimension =
  | 'maxDrawCalls' | 'maxMeshBuildMillis' | 'maxFrameTimeMillis'
  | 'maxGeometryMemoryBytes' | 'maxRenderDistanceChunks';
export type TickBudgetDimension = 'minSustainedTicksPerSecond' | 'maxCanonicalTickRunMs';
export type LoadBudgetDimension = 'maxLoadMs';
export type SaveBudgetDimension = 'maxSaveFlushMs';
export type NetworkBudgetDimension =
  | 'networkSustainedTicksPerSecond' | 'maxNetworkRunMs'
  | 'maxChunkAddedPerClient' | 'maxEntitySpawnedPerClient' | 'maxInventoryAcceptedPerClient';

export interface ReleaseBudgetConfig {
  frame: Record<ReleaseTier, Record<FrameBudgetDimension, number>>;
  tick: Record<ReleaseTier, Record<TickBudgetDimension, number>>;
  load: Record<ReleaseTier, Record<LoadBudgetDimension, number>>;
  save: Record<ReleaseTier, Record<SaveBudgetDimension, number>>;
  network: Record<ReleaseTier, Record<NetworkBudgetDimension, number>>;
}
export const DEFAULT_RELEASE_BUDGETS: ReleaseBudgetConfig; // the concrete matrix (below)

export function validateReleaseBudgetConfig(input: unknown): ReleaseBudgetConfig;

export interface ReleaseMeasurementBundle {
  tier: ReleaseTier;
  frame: { drawCalls: number; meshBuildMillis: number; frameTimeMillis: number;
           geometryMemoryBytes: number; renderDistanceChunks: number };
  tick: { sustainedTicksPerSecond: number; canonicalTickRunMs: number };
  load: { loadMs: number };
  save: { saveFlushMs: number };
  network: { sustainedTicksPerSecond: number; networkRunMs: number;
             maxChunkAddedPerClient: number; maxEntitySpawnedPerClient: number;
             maxInventoryAcceptedPerClient: number };
}
export interface ReleaseBudgetEntry { dimension: string; tier: ReleaseTier; budget: number;
                                      actual: number; withinBudget: boolean; }
export interface ReleaseGateReport { tier: ReleaseTier; withinBudget: boolean;
                                     entries: ReleaseBudgetEntry[]; }
export function evaluateReleaseGate(
  config: ReleaseBudgetConfig, tier: ReleaseTier, bundle: ReleaseMeasurementBundle,
): ReleaseGateReport;
```

### Concrete budget matrix (`DEFAULT_RELEASE_BUDGETS`)

Frame (per tier; values are ceilings):
| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| maxDrawCalls | 500 | 1000 | 1500 | 2500 |
| maxMeshBuildMillis | 4 | 6 | 8 | 12 |
| maxFrameTimeMillis | 33.3 | 16.7 | 16.7 | 16.7 |
| maxGeometryMemoryBytes | 134217728 | 268435456 | 402653184 | 536870912 |
| maxRenderDistanceChunks | 8 | 12 | 16 | 24 |

Tick (canonical scenario = `CANONICAL_SIM`: a single authoritative `WorldTickProcess` with a fixed
system set over a 17×17 (289-column) world, 64 entities, stepped 1200 ticks):
| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| minSustainedTicksPerSecond | 60 | 120 | 240 | 480 |
| maxCanonicalTickRunMs | 20000 | 10000 | 5000 | 2500 |

Load (canonical snapshot = `CANONICAL_WORLD_SNAPSHOT`: 289 columns × 24 sections + 1 metadata + 1
player state + 289 block-entity chunks + 289 entity chunks, decoded/migrated/validated/restored via
`ServerSaveLifecycle.load` through a wall-time-instrumented in-memory `SaveLoadBoundary`):
| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| maxLoadMs | 1200 | 600 | 300 | 150 |

Save (canonical dirty set = `CANONICAL_SAVE_DIRTY`: 512 dirty columns + metadata + player state,
flushed to empty via `flush()` then `saveAndClose()`, `limitPerDrain` 64):
| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| maxSaveFlushMs | 1500 | 750 | 375 | 190 |

Network (canonical scenario = 236 `BASELINE_LOAD` driven by the 236 harness by name):
| dimension | Low | Medium | High | Ultra |
|---|---|---|---|---|
| networkSustainedTicksPerSecond | 120 | 200 | 400 | 800 |
| maxNetworkRunMs | 10000 | 6000 | 3000 | 1500 |

The three structural network message ceilings (`maxChunkAddedPerClient` 81,
`maxEntitySpawnedPerClient` = in-range tracked count, `maxInventoryAcceptedPerClient` = queued
count) are **non-tiered invariants** derived from 236 interest/tracked/queue bounds; the same value
applies to every tier. The Medium network throughput/elapsed ceilings (200 / 6000) match 236's
defaults, so a tier-Machine equivalence is preserved by contract.

## Control/data flow

```
Per-domain measurement (headless, node):
  frame    -> run CANONICAL_RENDER via RenderPerformanceMonitor (075), sample() -> bundle.frame
  tick     -> WorldTickProcess.step(1200) over CANONICAL_SIM, wall-clock elapsed
              -> sustainedTicksPerSecond = 1200 / (elapsedMs/1000); canonicalTickRunMs = elapsedMs
  load     -> ServerSaveLifecycle.load(worldId, restore) over CANONICAL_WORLD_SNAPSHOT
              through timing SaveLoadBoundary -> bundle.load.loadMs
  save     -> mark CANONICAL_SAVE_DIRTY dirty, flush()+saveAndClose() through timing boundary
              -> bundle.save.saveFlushMs
  network  -> MultiClientHarness (236, by name) run of BASELINE_LOAD under wall clock
              -> bundle.network.* (throughput, run ms, per-tick ceilings via 236 collector)

Gate evaluation:
  evaluateReleaseGate(DEFAULT_RELEASE_BUDGETS, tier, bundle)
    -> for each dimension in frame/tick/load/save/network for `tier`
         withinBudget = actual <= budget  (non-finite/negative/missing actual => false)
    -> overall withinBudget = every dimension withinBudget
```

## Detailed behavior

- **Tier registry:** `RELEASE_TIERS` is the fixed, ordered, closed set. `validateReleaseBudgetConfig`
  requires every domain × tier combination to be present with a positive finite number; a missing,
  extra, or unknown dimension/tier, or a non-positive/non-finite value, throws a descriptive
  `ReleasePerformanceGate: <field>` error.
- **Frame measurement:** reuses 075 exactly — the frame budget contract is the 075
  `RenderBudgetConfig` shape; the per-tier frame ceilings above are passed to
  `evaluateRenderBudget` on the monitor's `sample()`. The measurement method wraps a canonical
  render scenario (fixed scene composition: render distance = the tier's chunk ceiling, a
  representative mesh/draw workload) and records `drawCalls`, `meshBuildMillis`, `frameTimeMillis`,
  `geometryMemoryBytes`, `renderDistanceChunks` for the tier. `frameTimeMillis` uses the monitor's
  injectable clock for deterministic correctness and a wall-clock pass for the real ceiling.
- **Tick measurement:** constructs a `WorldTickProcess` over `CANONICAL_SIM` and calls `step(1200)`.
  Sustained rate = `1200 / (elapsedMs/1000)`; the run ceiling is `elapsedMs`. Determinism is
  cross-checked with a scripted clock (identical scripted schedule → identical tick count and
  ordering).
- **Load measurement:** a timing `SaveLoadBoundary` wraps an in-memory repository that returns
  `CANONICAL_WORLD_SNAPSHOT` for `readWorld`; `ServerSaveLifecycle.load` is awaited and wall time
  from first boundary call to resolved `LoadResult` (outcome `'loaded'`) is recorded. A successful
  load is the only valid measurement; a `created` (empty) result or a thrown load is a
  not-within/error outcome.
- **Save measurement:** a fresh `ServerSaveLifecycle` over the timing boundary has
  `CANONICAL_SAVE_DIRTY` units marked dirty; `flush()` then `saveAndClose()` are awaited; wall time
  to a `pendingCount === 0` and state `'closed'` is recorded. A failed drain (storage gate down,
  re-queued unit, or a `saveAndClose` throw) is a not-within/error outcome, never a pass.
- **Network measurement:** runs 236 `BASELINE_LOAD` through the 236 harness (by name); the 236
  collector's totals and the wall clock produce the network throughput/elapsed/ceiling actuals.
- **Evaluation:** pure; `actual <= budget` per dimension with boundary equality within; a missing
  dimension key, NaN, negative, or `Infinity` actual is a violation; unknown tier throws before any
  entry is produced; the report includes every dimension with budget and actual.

## Failure modes

- **Malformed config** → `ReleasePerformanceGate: <field> must be a positive finite number` (or a
  missing/unknown domain/tier error); no partial config returned.
- **Unknown tier to evaluation** → throws `ReleasePerformanceGate: unknown tier '<x>'`; no report.
- **Missing/malformed actual** → that dimension reports `withinBudget: false` (evaluation is total,
  never throws on bad actuals) so a broken measurement cannot report a false pass.
- **Measurement driver failure** (a world system throws and stops the process; a load/save throws;
  a boundary write fails) → the measurement is recorded as failed/not-within and the gate fails the
  affected dimension; the 224/234 semantics (failed tick uncounted, `isStopped`, `lastError`,
  re-queued save unit) surface unchanged.

## Compatibility/migration

Additive. New `src/simulation/ReleasePerformanceGate.ts` and new test files only; no existing
module, public symbol, persistence format, or protocol version change. No stored data changes, so
no migration.

## Performance/resource constraints

- Gate and config validation are O(domains × tiers) with no allocation beyond the report object.
- Measurement fixtures are bounded: `CANONICAL_SIM` 289 columns/64 entities, 1200 ticks;
  `CANONICAL_WORLD_SNAPSHOT` ~868 units; `CANONICAL_SAVE_DIRTY` 514 units; 236 `BASELINE_LOAD`
  4 clients/1024 entities/1200 ticks.
- Budgets are ceilings; actuals are recorded in `verification.md` and may be tightened later, never
  loosened silently (236 convention).

## Testing seams

- **075 `RenderPerformanceMonitor`** with an injectable clock for deterministic frame measurement
  and a wall-clock pass for the real ceiling.
- **224 `WorldTickProcess` + 044 `SimulationClock`** for deterministic tick count and wall-clock
  sustained-rate measurement.
- **234 `SaveLoadBoundary`** injected timing wrapper for load/save wall-time measurement.
- **236 `MultiClientHarness`/`MultiClientBudgets`** (by name) for the network domain.
- **`tests/unit/release-performance-gate.test.ts`** (validation + evaluation matrix, boundary,
  violation, missing-actual, unknown-tier) plus per-domain measurement fixture tests.

## Observability/debugging

`evaluateReleaseGate` returns per-dimension entries naming dimension, tier, budget, actual, and
`withinBudget`; the report's overall `withinBudget` is the release verdict. Measurement drivers log
recorded actuals and any failure reason. Actuals are recorded in `verification.md`.

## Affected files/symbols

- **NEW** `src/simulation/ReleasePerformanceGate.ts` — tier set, `ReleaseBudgetConfig`,
  `DEFAULT_RELEASE_BUDGETS`, `validateReleaseBudgetConfig`, `ReleaseMeasurementBundle`,
  `ReleaseBudgetEntry`, `ReleaseGateReport`, `evaluateReleaseGate`.
- **NEW** `tests/unit/release-performance-gate.test.ts` — gate validation/evaluation scenarios.
- **NEW** per-domain measurement fixture tests (frame/tick/load-save/network) and measurement
  driver helpers, under `tests/unit/`.
- **Read-only:** `src/rendering/RenderPerformanceMonitor.ts` + `RenderBudget.ts` (075),
  `src/simulation/WorldTickProcess.ts` (224) + `src/engine/SimulationClock.ts` (044),
  `src/simulation/ServerSaveLifecycle.ts` + `src/simulation/PersistentWorldCodecs.ts` (234),
  `src/simulation/SimulationHarness.ts` (055), 236 harness (by name).
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **Per-domain gates only (no unified tier):** rejected — the sequence names one outcome across
  all five domains; a single tier × dimension matrix gives one release verdict and one regression
  fence.
- **Real GPU/device benchmark as the only frame evidence:** rejected — not headless/CI-able; the
  headless 075-monitor measurement is the automated gate, with physical-device compliance as a
  documented follow-on procedure.
- **Tier inferred from the host (auto-detect):** rejected — breaks determinism and reproducibility;
  the tier is an explicit evaluation argument.
- **Modify 075/224/234/236 modules to add instrumentation:** rejected — the gate measures at the
  existing public seams (monitor `sample()`, process `step()`, injected boundary, 236 collector);
  no production module is modified.
- **Reuse only one canonical scenario for every domain:** rejected — each domain has a distinct,
  documented canonical fixture (render, sim, snapshot, dirty-set, multi-client) because the seams
  differ; budgets are defined per fixture.

## Downstream dependencies

- **248 `parity-matrix-reconciliation`** and **250 `final-program-verification`** consume the
  release-gate verdict as evidence of the performance release-readiness dimension.
- **238 `worker-and-main-thread-stress` / 239 `long-session-memory-stress` / 240
  `save-recovery-stress`** are the later *optimization* changes that may tighten these budgets with
  real evidence; 247 only establishes the ceilings and measurement.
- **236** supplies the network harness/budgets by name; reconciled at 247 verification time.
