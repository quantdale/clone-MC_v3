# Spec: multi-client-correctness-fixtures

## Contract

Headless, deterministic correctness fixtures for multi-client simulation. A fixture harness
composes `N` simulated client sessions (each with chunk streaming, entity replication, and
inventory-transaction state) against one authoritative `WorldTickProcess`, steps them in a fixed
order, and asserts exact-once deltas, deterministic ordering, client-to-authoritative convergence,
rollback on rejection, bounded capacity, and stop-on-failure semantics. This capability is purely
a test/measurement contract: it specifies the observable behavior the fixtures MUST guarantee
when driving the existing 224/225/226/229/231 modules. It introduces no gameplay or network
protocol behavior.

## Definitions

- **Authoritative server simulation**: the single `WorldTickProcess` owned by the harness.
- **Client session**: the per-connection aggregate bundling a `ConnectionLifecycle`, a
  `ChunkStreamManager`, an `EntityReplicationManager` + `ClientEntityStore`, and an
  `InventoryTransactionValidator` + `ClientInventoryReconciler`.
- **Consumption epoch**: the per-tick pass in which the harness drains one client's chunk
  `pendingUpdates`, entity `collectUpdates`/`applyBatch`, and queued inventory transactions, in
  fixed order.
- **Convergence**: a client is converged for a tick when its chunk interest snapshots, entity
  replica store, and inventory window/cursor match the authoritative source for that tick and its
  reconciler holds no pending prediction.
- **Fixture scenario**: a deterministic construction of server systems, `N` client sessions, and a
  scripted schedule of client inputs.

## Invariants

- **Single-authority invariant**: the harness owns exactly one `WorldTickProcess`; clients never
  advance the tick themselves.
- **Fixed-order invariant**: clients consume in ascending session-index order; within a client the
  order is chunks → entities → inventory.
- **Exact-once chunk invariant**: a column key appears in exactly one of `added`/`updated`/
  `removed` per consumption epoch.
- **Exact-once entity invariant**: an entity produces exactly one `spawned` record on entering
  tracking range and exactly one `despawned` record on leaving range or removal.
- **Order invariant**: chunk update keys are sorted; entity records are ordered by ascending id;
  drag inventory distribution is ascending by slot id.
- **Convergence invariant**: after all inputs are consumed and corrections applied, each client's
  chunk interest, entity store, and inventory window equal the authoritative state for that tick.
- **Determinism invariant**: identical scenario + identical scripted schedule yield identical
  per-client observation sequences and identical final convergence.
- **Capacity invariant**: client stores never exceed `maxSnapshots`/`maxTracked`; reconciler
  prediction maps are empty at quiescence.

## Requirements

### Requirement: REQ-C1 Fixture harness composition

The harness SHALL compose `N` client sessions against one authoritative `WorldTickProcess`, with
`N` configurable, and SHALL expose the sessions and process for assertion.

#### Scenario: Two clients tick against one authoritative process
- **GIVEN** a harness constructed with `clientCount = 2` and identical per-session config.
- **WHEN** the harness is stepped by 100 ticks.
- **THEN** `process.tick` MUST equal 100 and every client MUST have consumed tick 100, and the
  harness MUST expose exactly 2 client sessions.

#### Scenario: Client count is configurable and validated
- **GIVEN** a harness constructed with `clientCount = 0` or a non-integer count.
- **WHEN** construction is attempted.
- **THEN** the harness MUST throw a `MultiClientHarness:` error naming the field, and MUST NOT
  create a partially constructed harness.

---

### Requirement: REQ-C2 Deterministic ticking and failure-stops-everything

The harness SHALL advance all clients together on the authoritative tick and SHALL stop every
client when a world system throws, without counting the failed tick.

#### Scenario: Normal step advances every client to the same tick
- **GIVEN** a harness with 3 clients.
- **WHEN** `step(50)` is called.
- **THEN** `process.tick` MUST equal 50 and every client SHALL have consumed the same authoritative
  tick number 50.

#### Scenario: A throwing world system stops the process and every client
- **GIVEN** a harness whose authoritative process includes a system that throws during a step.
- **WHEN** `step(1)` is attempted.
- **THEN** `process.isStopped` MUST be true, `process.lastError` MUST be set, `process.tick` MUST
  NOT advance past the failed tick, and every client MUST remain in its last consistent state.

#### Scenario: reset restores a clean re-runnable state
- **GIVEN** a harness that has been stopped by a throwing system.
- **WHEN** `reset()` is called and the throwing system is removed.
- **THEN** `process.tick` MUST be 0, `process.isStopped` MUST be false, and a subsequent `step`
  MUST run without rethrowing.

---

### Requirement: REQ-C3 Chunk correctness fixtures

The chunk fixtures SHALL assert that each client's `ChunkStreamManager` produces exact-once,
key-sorted chunk updates and a bounded snapshot store.

#### Scenario: First center set enters the full interest set exactly once
- **GIVEN** a client `ChunkStreamManager` with `viewDistance = 4` (interest size 81) and snapshots
  provided for every interest column.
- **WHEN** the first consumption epoch drains `pendingUpdates`.
- **THEN** the `added` array MUST contain exactly 81 key-sorted snapshots, `removed` MUST be empty,
  and a second `pendingUpdates` MUST return no further added/updated/removed entries.

#### Scenario: One-column move yields the exact entered/left delta
- **GIVEN** a client with `viewDistance = 1` at center `(0,0)` with a consumed interest set.
- **WHEN** the center moves to `(1,0)` and the next epoch drains.
- **THEN** `removed` MUST contain exactly the 3 columns that left and `added` MUST contain exactly
  the 3 columns that entered, with no overlap and no duplication.

#### Scenario: A late snapshot surfaces as an update, not a duplicate add
- **GIVEN** a client whose center moved to include column `C` that had no snapshot yet.
- **WHEN** a snapshot for `C` is provided and the epoch drains.
- **THEN** `C` MUST appear in exactly one array (as `added` or `updated`), never in both.

#### Scenario: Snapshot store eviction enforces the bounded capacity
- **GIVEN** a client `ChunkStreamManager` with `maxSnapshots = 2` and three columns snapshotted.
- **WHEN** the third snapshot is provided.
- **THEN** the oldest snapshot MUST be evicted and the store MUST hold exactly 2 snapshots.

#### Scenario: Two identical clients produce identical update sequences
- **GIVEN** two clients with identical centers, schedules, and snapshots.
- **WHEN** both are drained across several epochs.
- **THEN** their `added`/`updated`/`removed` sequences MUST be identical.

---

### Requirement: REQ-C4 Entity correctness fixtures

The entity fixtures SHALL assert exact-once spawn/despawn transitions, delta replication only for
tracked entities, client-store convergence, and the `maxTracked` bound.

#### Scenario: An entity entering range spawns exactly once
- **GIVEN** a server `EntityReplicationManager` with an entity inside `trackingRange`.
- **WHEN** the epoch runs `collectUpdates` and applies the batch to the `ClientEntityStore`.
- **THEN** the batch MUST contain the entity in `spawned` exactly once, the store MUST contain the
  replica, and a subsequent epoch MUST NOT spawn it again.

#### Scenario: An entity leaving range or removed despawns exactly once
- **GIVEN** a tracked entity whose center moves out of range (or which is removed).
- **WHEN** the next epoch runs.
- **THEN** the batch MUST contain the entity id in `despawned` exactly once and the store MUST NOT
  contain the replica afterward.

#### Scenario: Deltas are replicated only for tracked entities
- **GIVEN** a tracked entity `T` and an untracked entity `U`.
- **WHEN** both receive transform and tracked-data updates and an epoch runs.
- **THEN** the batch MUST include deltas for `T` and MUST NOT include any delta for `U`.

#### Scenario: Client store converges to the authoritative tracked set
- **GIVEN** a server manager and a `ClientEntityStore` after several epochs of movement.
- **WHEN** all batches are applied.
- **THEN** `getAll()` on the store MUST equal the server's in-range entities (id/type/position/
  trackedData), and the store MUST NOT contain any despawned entity.

#### Scenario: maxTracked is enforced
- **GIVEN** a server `EntityReplicationManager` with `maxTracked = 2`.
- **WHEN** a third entity is registered.
- **THEN** the manager MUST throw `EntityReplication: maxTracked limit exceeded`.

---

### Requirement: REQ-C5 Inventory correctness fixtures

The inventory fixtures SHALL assert optimistic prediction, confirm/rollback reconciliation,
state-id versioning, and convergence to the authoritative window.

#### Scenario: Accepted prediction confirms and leaves the reconciler clean
- **GIVEN** a client `InventoryTransactionValidator` + `ClientInventoryReconciler` over a 40-slot
  window, and a predicted slot click.
- **WHEN** the transaction is processed and accepted with matching `stateId`.
- **THEN** the reconciler MUST confirm (return null directive), MUST hold no pending prediction,
  and the client window MUST equal the server `currentSlots`.

#### Scenario: Rejected transaction rolls back to the authoritative snapshot
- **GIVEN** a client whose prediction will be rejected (e.g. `wrong_state_id` or
  `drag_not_started`).
- **WHEN** the server rejects with an authoritative snapshot.
- **THEN** the reconciler MUST return a `ClientRollbackDirective` carrying the authoritative slots
  and cursor, and the client window MUST be restored to that snapshot.

#### Scenario: Wrong state id is rejected without mutation
- **GIVEN** a server validator at `stateId = S` and a transaction carrying a different `stateId`.
- **WHEN** the transaction is processed.
- **THEN** the result MUST be `{ accepted: false, reason: 'wrong_state_id' }`, the server `stateId`
  MUST remain `S`, and the slot state MUST be unchanged.

#### Scenario: Duplicate drag start and end-without-start are rejected
- **GIVEN** an active drag.
- **WHEN** a second drag `start` (or an `end` without any prior `start`) is processed.
- **THEN** the result MUST be `{ accepted: false, reason: 'drag_not_started' }` and the original
  drag and slot state MUST remain intact.

#### Scenario: Two clients on a shared window converge
- **GIVEN** two client sessions whose validators share the same authoritative window.
- **WHEN** the clients submit interleaved transactions (accepted and rejected) and all corrections
  are applied.
- **THEN** both clients' windows MUST equal the server `currentSlots`, both reconcilers MUST hold no
  pending prediction, and the server `stateId` MUST reflect the accepted mutations only.

---

### Requirement: REQ-C6 Multi-client convergence

The harness SHALL demonstrate that interleaved chunk, entity, and inventory operations across
multiple clients converge every client to the authoritative state.

#### Scenario: Interleaved operations converge all clients
- **GIVEN** a harness with 4 clients where clients A and B stream chunks, clients A/C/D receive
  entity replicas, and all four submit inventory transactions with at least one rejection each.
- **WHEN** the scenario runs to quiescence (no further inputs).
- **THEN** every client MUST be converged: chunk interest matches, entity store matches the
  authoritative in-range set, window/cursor match the server, and no reconciler holds a pending
  prediction.

---

### Requirement: REQ-C7 Determinism and replay

Identical scenario + identical scripted schedule MUST produce identical per-client observation
sequences and identical final convergence, including across repeated runs and a restore-then-step
replay.

#### Scenario: Repeated identical runs are identical
- **GIVEN** a fixture scenario and its scripted schedule.
- **WHEN** the scenario is run twice.
- **THEN** the two runs MUST record identical per-client chunk/entity/inventory observation
  sequences and identical final convergence.

#### Scenario: Restore-then-step equals a fresh run
- **GIVEN** the harness `snapshot` at tick `T` (per 055 conventions) and a continuation schedule.
- **WHEN** the harness is restored to `T` and stepped, versus a fresh run of the full schedule.
- **THEN** the post-`T` observations MUST be identical.

---

### Requirement: REQ-C8 Boundary and failure fixtures

The fixtures SHALL assert the existing modules' documented boundary and failure behaviors through
the harness, without building a general fuzzer.

#### Scenario: Out-of-range inputs throw without mutation
- **GIVEN** a client inventory validator and an out-of-range `slotId` (or hotbar slot outside
  `[0,8]`).
- **WHEN** the transaction is processed.
- **THEN** a descriptive `InventoryTransaction: <detail>` error MUST be thrown and the validator
  state MUST be unchanged.

#### Scenario: Invalid entity input throws without mutation
- **GIVEN** a server `EntityReplicationManager`.
- **WHEN** an entity is registered with `NaN` coordinates or a negative id.
- **THEN** a descriptive `EntityReplication: <detail>` error MUST be thrown and the manager state
  MUST be unchanged.

#### Scenario: Invalid chunk input throws without consuming accumulators
- **GIVEN** a client `ChunkStreamManager` with unconsumed accumulators.
- **WHEN** `pendingUpdates` is called with an invalid tick.
- **THEN** a descriptive `ChunkStream: <detail>` error MUST be thrown and the accumulators MUST NOT
  be consumed.

## Error and failure behavior

All errors surface the underlying module's documented `Module: <detail>` messages unchanged. The
harness itself throws `MultiClientHarness: <detail>` for invalid construction options and
`MultiClientBudgets: <detail>` (see the performance spec) for invalid budgets. A throwing world
system stops the authoritative process; the fixture preserves every client's last consistent state
for inspection via `process.lastError`/`process.isStopped`.

## Performance and resource bounds

Correctness fixtures run over bounded scenarios (canonical 4-client, 1200-tick run) and assert
capacity invariants (store ≤ `maxSnapshots`/`maxTracked`, empty reconciler predictions at
quiescence). Deterministic-timing and wall-clock throughput budgets are specified separately in
`multi-client-performance-fixtures`.

## Compatibility and migration

Additive test/measurement contract only. No production module, public symbol, persistent data, or
protocol version is changed.

## Security and integrity

The fixtures assert that rejected inputs never mutate authoritative state (wrong `stateId`,
out-of-range inputs, `maxTracked` overflow, invalid ticks) — integrity is preserved under invalid
or misordered client input.

## Observability

The harness exposes `process.tick`, `process.isStopped`, `process.lastError`, and per-client
sessions for assertion; the collector exposes `clientTotals(i)` and `totals()`.

## Verification mapping

- `tests/unit/multi-client-correctness.test.ts` verifies REQ-C1..REQ-C8 scenarios.
- Requirement coverage is recorded per scenario in `verification.md`.
