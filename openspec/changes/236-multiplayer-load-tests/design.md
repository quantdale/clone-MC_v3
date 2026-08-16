# Design: 236-multiplayer-load-tests

## Context/current state

The multiplayer stack exists as standalone, pure, headless modules that are individually unit
tested but never composed under multiple clients:

- `src/simulation/WorldTickProcess.ts` (224) — authoritative fixed-tick process: `step(times)`
  runs systems exactly once per tick with 1-based tick numbers; a throwing system stops the
  process (failed tick uncounted, `isStopped`/`lastError` set, later drives rethrow until
  `reset()`). Owns a `SimulationClock` (044) with `update(nowMs)` and `reset()`.
- `src/simulation/ChunkStreamManager.ts` (226) — per-connection Chebyshev chunk interest
  (`viewDistance`), key-sorted exactly-once `entered`/`left`/`dirty` accumulators consumed by
  `pendingUpdates(tick)` into `added`/`removed`/`updated`; bounded `maxSnapshots` store with
  oldest-first eviction.
- `src/simulation/EntityReplication.ts` (229) — server `EntityReplicationManager` (interest
  tracking range, spawn/despawn/transform/trackedData delta batches, `maxTracked` bound) and
  client `ClientEntityStore` (applies batches, converges replicas).
- `src/simulation/InventoryTransactionNetworking.ts` (231) — server
  `InventoryTransactionValidator` (stateId versioning, click/hotbar-swap/drop/drag semantics,
  rejection with authoritative snapshot) and client `ClientInventoryReconciler` (optimistic
  prediction + rollback directives).
- `src/simulation/ConnectionLifecycle.ts` (225) — connect/handshake/keepalive/disconnect state
  machine driven by scripted wall time.
- `src/simulation/SimulationHarness.ts` (055) — test-side single-process tick harness with
  snapshot/restore replay.
- Measurement precedent: `src/rendering/RenderPerformanceMonitor.ts` + `RenderBudget.ts` (075) —
  injectable clock, validated config, per-dimension budget evaluator (boundary equality within
  budget; non-finite/negative actuals are violations).

There is no server coordinator that composes these, and no multi-client fixture or load
measurement anywhere in the repo (confirmed by search). This change supplies that composition and
the fixtures.

## Target state

A pure headless fixture package that:

1. Composes `N` simulated client sessions against one authoritative `WorldTickProcess`.
2. Steps the world deterministically and then consumes each client's chunk/entity/inventory
   updates in a fixed order *after every world tick*, so multi-client behavior is reproducible
   and measurable per tick.
3. Collects per-client, per-tick load metrics and evaluates them against a validated budget
   contract with concrete ceilings.
4. Ships correctness and performance fixtures as unit tests, plus a scripted-clock path that is
   independent of machine speed and a wall-clock path that measures real throughput.

## Invariants

- **Single authority**: exactly one `WorldTickProcess` drives the world; clients are consumers,
  never producers of authoritative tick state.
- **Fixed consume order**: after each world tick, clients are consumed in ascending session index
  order, and within a client the order is chunks → entities → inventory. This ordering is
  part of the fixture's determinism contract.
- **Exact-once deltas**: a chunk column key appears in exactly one of `added`/`updated`/`removed`
  per consumption epoch; an entity produces exactly one `spawned` and exactly one `despawned`
  record across its lifecycle.
- **Determinism**: identical scenario + identical scripted schedule produce identical per-client
  observation sequences, identical final convergence, and identical deterministic timing metrics.
- **Boundary/capacity**: client stores stay within `maxSnapshots`/`maxTracked`; reconciler
  prediction maps are empty at quiescence.
- **Failure isolation**: a throwing world system stops the process; every client observes the same
  stop (tick not advanced); `reset()` restores a clean, re-runnable state.

## API and data model

Concrete sketches (intent only; the normative contract is in the capability specs).

```ts
// src/simulation/MultiClientLoadHarness.ts
export interface MultiClientSessionConfig {
  readonly viewDistance: number;      // > 0, integer (ChunkStreamManager)
  readonly trackingRange?: number;    // > 0, default 64 (EntityReplicationManager)
  readonly windowSlots: number;       // > 0, inventory window size (InventoryTransactionValidator)
  readonly maxSnapshots?: number;     // > 0, default 1024 (ChunkStreamManager store bound)
  readonly maxTracked?: number;       // > 0, default 1024 (EntityReplicationManager bound)
}

export interface MultiClientScenarioOptions {
  readonly clientCount: number;       // > 0, integer
  readonly config: MultiClientSessionConfig;
  readonly serverEntityCount?: number; // > 0, entities seeded into every client's server manager
  readonly maxTicksPerFrame?: number; // SimulationClock cap (default 10)
  readonly clock?: SimulationClock;   // injected clock for the scripted deterministic path
  readonly systems?:                 // world systems; a factory receives the built clients so
    readonly TickSystem[]             // scenario systems can drive per-tick entity churn etc.
    | ((clients: readonly ClientSession[]) => readonly TickSystem[]);
}

export interface ClientSession {
  readonly index: number;
  readonly connection: ConnectionLifecycle;
  readonly chunks: ChunkStreamManager;
  readonly entityServer: EntityReplicationManager;
  readonly entityClient: ClientEntityStore;
  readonly inventory: InventoryTransactionValidator;
  readonly reconciler: ClientInventoryReconciler;
}

export class MultiClientHarness {
  constructor(opts: MultiClientScenarioOptions); // validates; throws MultiClientHarness: <detail>
  readonly process: WorldTickProcess;
  readonly clients: readonly ClientSession[];
  readonly metrics: MultiClientMetricsCollector;
  step(ticks: number): number;         // world tick, then per-client consume, repeated per tick
  stepTo(tick: number, maxSteps: number): number; // bounded condition stepping (055-style)
  update(nowMs: number): number;       // clock-driven path (scripted timestamps for determinism)
  setClientCenter(i: number, x: number, z: number): InterestDelta;   // logged scenario input
  setClientEntityCenter(i: number, x: number, y: number, z: number): void; // logged scenario input
  putClientSnapshot(i: number, snapshot: ChunkSnapshot): void;        // logged scenario input
  queueClientTransaction(i: number, tx: InventoryTransaction): void;  // logged scenario input
  snapshot(): MultiClientHarnessSnapshot;   // log-based replay snapshot (see "Replay hooks")
  restore(snapshot: MultiClientHarnessSnapshot): void;
  reset(): void;
}

// Per-tick, per-client counters.
export interface ClientTickMetrics {
  readonly chunkAdded: number;
  readonly chunkUpdated: number;
  readonly chunkRemoved: number;
  readonly entitySpawned: number;
  readonly entityDespawned: number;
  readonly entityTransforms: number;
  readonly entityTrackedData: number;
  readonly inventoryAccepted: number;
  readonly inventoryRejected: number;
  readonly inventoryMutations: number;
}

export interface ClientTickRecord { readonly tick: number; readonly metrics: ClientTickMetrics; }

export class MultiClientMetricsCollector {
  constructor(clientCount: number);     // validates; throws MultiClientHarness: <detail>
  recordClientTick(clientIndex: number, tick: number, metrics: ClientTickMetrics): void;
  clientTickRecords(clientIndex: number): readonly ClientTickRecord[]; // observation sequences
  clientTotals(clientIndex: number): ClientTickTotals;
  totals(): ClientTickTotals;
  perClientTickMaxes(): MultiClientPerTickMaxes; // max chunkAdded / entitySpawned /
                                                 // inventoryAcceptedRejected over client-ticks
  reset(): void;
}

export interface MultiClientBudgets {
  readonly minTicksPerSecond: number;       // sustained throughput ceiling (wall clock)
  readonly maxElapsedMsForTicks: number;    // wall-time bound for the canonical run
  readonly maxChunkAddedPerClient: number;  // per-client-tick added ceiling (interest size)
  readonly maxEntitySpawnedPerClient: number;
  readonly maxInventoryAcceptedPerClient: number; // per-client-tick accepted + rejected ceiling
}

export const DEFAULT_BASELINE_BUDGETS: MultiClientBudgets; // 200 tps, 6000 ms, 81, 1024, 64

export interface MultiClientLoadMetrics {
  readonly sustainedTicksPerSecond: number;
  readonly elapsedMs: number;
  readonly maxChunkAddedPerClientTick: number;
  readonly maxEntitySpawnedPerClientTick: number;
  readonly maxInventoryAcceptedPerClientTick: number; // max accepted + rejected per client-tick
}

export function validateMultiClientBudgets(input: unknown): MultiClientBudgets;
export function evaluateMultiClientBudgets(
  budgets: MultiClientBudgets,
  actual: MultiClientLoadMetrics,
): MultiClientBudgetReport; // per-dimension + overall verdict; non-finite/negative actual = violation

export interface MultiClientScenarioPreset {
  readonly name: string;
  readonly options: MultiClientScenarioOptions;
  readonly ticks: number;
}
export const BASELINE_LOAD: MultiClientScenarioPreset;
export const CHUNK_STRESS: MultiClientScenarioPreset;
export const ENTITY_CHURN: MultiClientScenarioPreset;
export const INVENTORY_BURST: MultiClientScenarioPreset;

export function scenarioEntityPosition(index: number): EntityPosition; // deterministic placement
```

The deterministic timing path uses an injected `SimulationClock` with a fixed `maxTicksPerFrame`
fed by a scripted `now()` through `update(nowMs)`; the wall-clock path steps via `step(1)` and
measures real elapsed `performance.now()` time (a real clock cannot emit fixed ticks in a tight
loop — `SimulationClock.update` emits `floor(delta / TICK_MS)` ticks, which is 0 at real-time
deltas), so throughput is measured over `step`, not `update`.

**Wall-clock measurement context**: the canonical throughput/elapsed measurement (REQ-P3/REQ-P7)
is the isolated run of the fixture file (`npx vitest run tests/unit/multi-client-performance.test.ts`),
so no other test file competes for the machine's cores; the verdict from that isolated run is
recorded in `verification.md`. Inside the full parallel unit suite the same fixture measures and
logs the identical actuals but asserts only the load-independent structural ceilings (REQ-P4),
so a busy machine cannot produce a false gate failure. The canonical test is executed with
`MC_CANONICAL=1` (it self-skips otherwise).

## Replay hooks (055 conventions)

The consumed components expose `reset()` but not per-component snapshots, so
`snapshot()`/`restore()` are implemented as **operation-log replay**: every harness-driven input
(`setClientCenter`, `putClientSnapshot`, `queueClientTransaction`) and every driving call
(`step`, `update`) is appended to an internal log. `snapshot()` captures `{ tick, log }`
(defensive copies); `restore(snapshot)` validates the whole snapshot (shape, op kinds, field
types, client-index ranges), resets every component to its pristine constructed state (process,
connection re-connect flow, chunk store/accumulators, entity managers re-seeded with the
scenario entities, client stores, inventory window/cursor/stateId, reconciler, collector,
queues, log), and replays the log. Restore-then-step therefore equals a fresh run for any
scripted schedule. Direct component mutation (outside the harness methods) is not captured by
the log and is the test's responsibility to keep deterministic.

## Control/data flow

```
MultiClientHarness.step(ticks):            # repeated once per world tick
  for tick in 1..ticks:
    process.step(1)                        # authoritative world tick (1..N)
    for client in clients (index ascending):
      chunks.pendingUpdates(process.tick)  # consume added/removed/updated into the client
      entityServer.collectUpdates(process.tick)
      entityClient.applyBatch(batch)       # converge client entity replicas
      for tx in client.inventoryQueue:     # scripted or generated transactions
        result = inventory.processTransaction(tx)
        reconciler.reconcile(result)       # confirm or roll back to authoritative
      record ClientTickMetrics(collector)  # per client, per tick

MultiClientHarness.update(nowMs):          # clock-driven path (scripted clock)
  before = process.tick
  process.update(nowMs)                    # emits 0..maxTicksPerFrame fixed ticks
  for tick in before+1..process.tick:
    consume clients (as above) and record  # same fixed order, per emitted tick
```

## Detailed behavior

- **Scenario construction**: `clientCount` sessions are built with identical per-session config;
  every client's server-side `EntityReplicationManager` is seeded with the same
  `serverEntityCount` entities placed deterministically (`scenarioEntityPosition`) around a
  shared origin so interest boundaries are stable and in-range counts are predictable (all
  seeded entities lie inside `trackingRange = 64` of the origin, so a client centered at the
  origin replicates all of them).
- **Deterministic consume**: chunk/entity/inventory consumption runs only after the world tick
  for that tick, so every client consumes the same authoritative tick number; a world-system
  failure therefore stops every client with the failed tick uncounted.
- **Metric collection**: the collector records per-client, per-tick counters and aggregates
  client/aggregate totals and per-client-tick maxes for the whole run; `totals()` and
  `perClientTickMaxes()` are used to assert structural ceilings.
- **Correctness fixtures** (spec `multi-client-correctness-fixtures`) drive scenarios and assert
  convergence/exact-once/order/capacity/failure semantics against the authoritative source.
- **Performance fixtures** (spec `multi-client-performance-fixtures`) run the canonical scenario
  under both the scripted clock (deterministic timing + message counts) and the wall clock
  (throughput + elapsed ceiling), and evaluate against `MultiClientBudgets`.

## Named fixture scenarios

| Scenario | clientCount | viewDistance | serverEntityCount | windowSlots | maxSnapshots | maxTracked | ticks | Purpose |
|---|---|---|---|---|---|---|---|---|
| `BASELINE_LOAD` | 4 | 4 (81 columns) | 1024 | 40 | 1024 (default) | 1024 (default) | 1200 | Canonical throughput/elapsed budgets (≥ 200 tps, ≤ 6000 ms) |
| `CHUNK_STRESS` | 4 | 6 (169 columns) | 256 | 40 | 512 | 1024 (default) | 2000 | Center drift churns columns; per-tick added/removed ceilings and store eviction |
| `ENTITY_CHURN` | 4 | 4 | 512 | 40 | 1024 (default) | 512 | 2000 | Center sweeps make entities enter/leave range; spawn/despawn exact-once and store bounds |
| `INVENTORY_BURST` | 4 | 4 | 128 | 40 | 1024 (default) | 1024 (default) | 1000 | Dense queued transaction bursts; accepted/rejected ceilings and reconciler quiescence |

The tests attach deterministic scenario systems (per-tick entity transform churn) and scripted
per-tick inputs on top of these presets; the presets themselves are plain data constants.

## Failure modes

- Invalid scenario/budget options → construction/validation throws (`MultiClientHarness:` /
  `MultiClientBudgets:`) with the offending field named; no partial state.
- A world system throws mid-tick → the fixture stops (`process.isStopped`), the failed tick is
  uncounted, every client's stores/queues remain in their last consistent state, and a
  subsequent `step` rethrows the recorded error until `reset()`.
- A queued transaction that the 231 validator rejects as malformed (an invalid shape throws)
  propagates mid-step after the earlier clients of that tick were consumed; this is the
  documented fail-fast behavior, not a rejection path (rejections are `accepted: false` results).
- Existing module rejection paths (wrong `stateId`, drag without `start`, out-of-range inputs,
  `maxTracked` exceeded) propagate their documented `Module: <detail>` throws/results unchanged
  through the fixture and are asserted as-is.
- `restore` rejects malformed snapshots with `MultiClientHarness: malformed harness snapshot`
  before any component is touched; a snapshot whose replay throws (deep component validation)
  leaves the harness in the reset+partial-replay state, mirroring 055's restore contract.

## Compatibility/migration

Additive. New module + new test files only; no existing symbol or data changes, no persistence,
no protocol version change, no migration.

## Performance/resource constraints

- Per world step: O(systems) as in 224; per client consume: O(interest) + O(tracked) + O(queued
  transactions), matching the underlying modules.
- Memory bounded: `ChunkStreamManager` ≤ `maxSnapshots`, `EntityReplicationManager` ≤
  `maxTracked`, `ClientEntityStore` replicas ≤ in-range count, reconciler prediction maps clear at
  quiescence.
- Canonical budgets (measured headlessly, recorded in verification.md): `BASELINE_LOAD`
  (4 clients, `viewDistance` 4, 1024 server entities, 40-slot windows) must sustain ≥ 200
  ticks/sec over 1200 ticks and complete 1200 ticks in ≤ 6000 ms wall time.

## Testing seams

- Injected `SimulationClock` with a scripted `now()` for deterministic timing.
- Real wall clock (`performance.now`/`process.hrtime`) for throughput.
- Recording systems and queued transaction generators for scripted client input.
- `MultiClientHarness.stepTo` bounded stepping for scenario phase changes.

## Observability/debugging

- `process.tick`, `process.isStopped`, `process.lastError` per fixture.
- `MultiClientMetricsCollector.clientTickRecords(i)` (per-client per-tick observation
  sequences), `totals()`/`clientTotals(i)`, `perClientTickMaxes()`, and
  `evaluateMultiClientBudgets` per-dimension report.

## Affected files/symbols

- NEW `src/simulation/MultiClientLoadHarness.ts` — scenario/session types, `MultiClientHarness`
  (+ logged `setClientCenter`/`putClientSnapshot`/`queueClientTransaction` inputs,
  log-based `snapshot`/`restore` replay), `MultiClientMetricsCollector`,
  `MultiClientBudgets` + validation/evaluation, `DEFAULT_BASELINE_BUDGETS`, named scenario
  presets, `scenarioEntityPosition`.
- NEW `tests/unit/multi-client-correctness.test.ts`.
- NEW `tests/unit/multi-client-performance.test.ts`.
- Read-only: the 224/225/226/229/231 modules imported by the harness; 075 render-budget pattern
  as the measurement precedent.
- Docs/state: `openspec/PROGRAM_STATE.json`, `openspec/PROGRAM_STATE.md`.

## Rejected alternatives

- **Add fixtures as throwaway test functions only**: rejected — a reusable harness and budget
  evaluator are needed by both 236 fixtures and the later 237/238 stress/validation changes.
- **Place the harness under `tests/`**: rejected — the repo convention keeps reusable headless
  simulation infrastructure under `src/simulation/` (055 `SimulationHarness`, 075
  `RenderPerformanceMonitor` precedent), so it is shareable per the 222 boundary.
- **Modify existing modules for measurement hooks**: rejected — fixtures measure at the public API
  surface (already-exposed counters and returned update sets); no instrumentation is added to
  production modules.
- **Build a general adversarial fuzzer**: rejected — out of scope; deferred to 237.

## Downstream dependencies

- 237 `network-adversarial-validation` will reuse `MultiClientHarness` as the driver for
  malformed/duplicate/out-of-order message fixtures.
- 238 `worker-and-main-thread-stress` and 247 `performance-release-gate` may consume the budget
  evaluator and metric collector patterns.
