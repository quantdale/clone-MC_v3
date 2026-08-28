# Spec: server-save-lifecycle

## Contract

The server-owned save lifecycle (`ServerSaveLifecycle`) owns the persistence of a server's authoritative world state: it loads a world through a `SaveLoadBoundary` using the shared persistent codecs, tracks dirty world units, drains them through the boundary with bounded, no-loss, retry semantics, autosaves on a `WorldTickProcess` tick cadence, gates writes on storage health, and flushes gracefully on stop. It is pure and headless — no IndexedDB, no DOM, no network transport. Persistence primitives (queue/sink/repositories/autosave/health) from 034-043 are consumed through injectable seams, not referenced directly.

## Definitions

- **Save state**: `unloaded | loading | running | flushing | closed`.
- **Dirty unit**: a `ServerWorldUnit` marked for persistence; identified by `unitKey = `${kind}|${worldId}|${chunkX}|${chunkZ}``.
- **Drain**: writing up to a bounded number of pending units through the boundary, removing each only after its write resolves.
- **Boundary**: the injected `SaveLoadBoundary` (read world snapshot, write queue-kind units, write player-state) backed in production by the 034-040 repositories.
- **Storage gate**: the injected `{ canWrite(): boolean }`; when false, the lifecycle MUST NOT attempt writes.

## Invariants

- **State ordering**: transitions are exactly `unloaded → loading → running → flushing → closed`; a `loading` failure returns to `unloaded`; `closed` is terminal.
- **No silent loss**: a pending unit is removed only after its write resolves successfully; failed writes and failed encodes re-queue the unit at the end.
- **FIFO + dedupe**: pending units drain in FIFO order; re-marking an existing key keeps its FIFO position but replaces its value.
- **Write latest**: a unit is encoded at drain time from its current in-memory `value`.
- **All-or-nothing load**: no `restore` call is made for any unit unless every record decoded and validated; any failure leaves the server world untouched and the state at `unloaded`.
- **Storage gating**: no write is attempted while `storageGate.canWrite()` is false; pending units remain pending.
- **Determinism**: identical boundary/codec/gate and identical schedules yield identical drain order, write calls, and outcomes.

## Requirements

### Requirement: REQ-1 — Lifecycle state machine and load

`ServerSaveLifecycle` SHALL enforce the state ordering and perform `load(worldId, restore)` that either restores an existing world or creates a fresh one, transitioning to `running` only on success.

#### Scenario: Load of an existing world transitions to running
- **GIVEN** an `unloaded` lifecycle and a boundary whose `readWorld('w1')` returns a snapshot with one column, one block-entity chunk, and one entity chunk.
- **WHEN** `load('w1', restore)` resolves.
- **THEN** the state MUST be `running`, `restore` MUST have been called once per decoded unit, and the returned `LoadResult` MUST have `outcome = 'loaded'` with `columns = 1`, `blockEntityChunks = 1`, `entityChunks = 1`.

#### Scenario: New world with no records creates
- **GIVEN** an `unloaded` lifecycle and a boundary whose `readWorld('w1')` resolves to `null`.
- **WHEN** `load('w1', restore)` resolves.
- **THEN** the state MUST be `running`, `restore` MUST NOT be called, and the returned `LoadResult` MUST have `outcome = 'created'` with all counts zero.

#### Scenario: Load failure rolls back to unloaded and touches no world
- **GIVEN** a boundary whose snapshot contains a column that fails `codec.decode` (mis-versioned record).
- **WHEN** `load('w1', restore)` is called.
- **THEN** it MUST reject, the state MUST be `unloaded`, and `restore` MUST NOT have been called for any unit.

---

### Requirement: REQ-2 — Dirty-unit marking and de-duplication

`markDirty(unit)` SHALL accept dirty units only while `running`, de-duplicate them by `unitKey`, and preserve FIFO position on re-mark.

#### Scenario: Marked unit drains once
- **GIVEN** a `running` lifecycle with an empty pending set.
- **WHEN** `markDirty(unitA)` is called and a drain runs.
- **THEN** `boundary.write` MUST be called exactly once for `unitA`, and `pendingCount` MUST be 0 afterward.

#### Scenario: Re-mark replaces value and keeps FIFO position
- **GIVEN** a `running` lifecycle; `markDirty(unitA)` then `markDirty(unitB)`.
- **WHEN** `markDirty(unitA)` is called again with a newer `value`, then a bounded drain runs.
- **THEN** the drain MUST write `unitA` first (its original FIFO position is preserved) with the newer `value`, then `unitB` (no stale write).

#### Scenario: Marking after close is rejected
- **GIVEN** a lifecycle whose state is `closed`.
- **WHEN** `markDirty(unit)` is called.
- **THEN** it MUST throw an error matching `ServerSaveLifecycle: markDirty requires state 'running'` and the pending set MUST be unchanged.

---

### Requirement: REQ-3 — Bounded drain with retry and no-loss

Drain SHALL write at most `limitPerDrain` units per call in FIFO order, remove a unit only on success, and re-queue failed units and failed encodes at the end for retry.

#### Scenario: Drain is bounded
- **GIVEN** `limitPerDrain = 2` and 5 pending units.
- **WHEN** one drain runs.
- **THEN** exactly 2 units are written and `pendingCount` is 3.

#### Scenario: Failed write re-queues and is retried
- **GIVEN** a boundary whose `write` rejects for `unitX`, then succeeds on a later call.
- **WHEN** a drain runs (unitX fails), then a second drain runs.
- **THEN** `unitX` remains pending after the first drain, `pendingCount` is unchanged for it, and the second drain writes it; the failure is recorded in `lastFailures`.

#### Scenario: Failed encode keeps the unit pending
- **GIVEN** a codec whose `encode` throws for a pending unit.
- **WHEN** a drain runs.
- **THEN** the unit is not written, remains pending, and a failure of kind `encode` is recorded in `lastFailures`.

---

### Requirement: REQ-4 — Tick-driven autosave cadence

`tick(tick)` SHALL trigger a bounded drain exactly when `tick % autosaveEveryTicks === 0` while `running`, and drain nothing otherwise.

#### Scenario: Autosave fires on cadence
- **GIVEN** `autosaveEveryTicks = 100` and one pending unit.
- **WHEN** `tick(100)` is called.
- **THEN** the pending unit is written.
- **WHEN** `tick(101)` is then called.
- **THEN** no additional write occurs (the unit is already drained and `pendingCount` is 0).

#### Scenario: No drain off-cadence
- **GIVEN** `autosaveEveryTicks = 100` and one pending unit.
- **WHEN** `tick(50)` is called.
- **THEN** no write occurs and `pendingCount` remains 1.

#### Scenario: Empty queue drains zero
- **GIVEN** a `running` lifecycle with `pendingCount = 0`.
- **WHEN** `tick(100)` is called.
- **THEN** zero writes occur and `boundary.write` is not called.

---

### Requirement: REQ-5 — Graceful flush and save-and-close

`flush()` SHALL drain to empty with a zero-progress guard, and `saveAndClose()` SHALL flush and then transition to `closed`.

#### Scenario: Flush drains to empty and saveAndClose closes
- **GIVEN** a `running` lifecycle with pending units.
- **WHEN** `saveAndClose()` resolves.
- **THEN** `pendingCount` is 0, all units were written, and the state is `closed`.

#### Scenario: Persistently failing flush stops at the zero-progress guard
- **GIVEN** a boundary whose `write` always rejects and `flushZeroProgressLimit = 3`.
- **WHEN** `saveAndClose()` is called.
- **THEN** it MUST throw after at most the zero-progress limit of empty-progress drain runs, the state MUST be `flushing`, and a failure MUST be recorded in `lastFailures`.

#### Scenario: No further marking after close
- **GIVEN** a lifecycle in state `closed`.
- **WHEN** `markDirty(unit)` is attempted.
- **THEN** it MUST throw matching `ServerSaveLifecycle: markDirty requires state 'running'`.

---

### Requirement: REQ-6 — Storage-health gating

The lifecycle SHALL refrain from writing while `storageGate.canWrite()` is false, keep pending units pending, and record a classified failure; it SHALL resume draining once the gate reports true again.

#### Scenario: Writes are fenced when storage is down
- **GIVEN** a `running` lifecycle with pending units and a gate whose `canWrite()` returns false.
- **WHEN** a drain (or autosave tick) runs.
- **THEN** `boundary.write` MUST NOT be called, `pendingCount` is unchanged, and a `storage`-kind failure is recorded in `lastFailures`.

#### Scenario: Pending units drain after recovery
- **GIVEN** a `running` lifecycle with pending units, gate false for one drain (units stay pending), then the gate's `canWrite()` returns true.
- **WHEN** a drain runs.
- **THEN** the pending units are written and `pendingCount` reaches 0.

---

### Requirement: REQ-7 — Load data integrity and atomicity

`load` SHALL treat the whole world as a unit: any record that fails decode/migration/validation, is foreign (`worldId` mismatch), or is a duplicate key within one kind MUST fail the entire load, leaving the server world untouched and the state at `unloaded`.

#### Scenario: A single invalid record fails the whole load
- **GIVEN** a boundary snapshot with 10 valid columns and 1 column that fails `codec.decode`.
- **WHEN** `load('w1', restore)` is called.
- **THEN** it MUST reject, the state MUST be `unloaded`, and `restore` MUST NOT have been called for any of the 11 columns.

#### Scenario: Duplicate column key fails the load
- **GIVEN** a boundary snapshot whose `columns` contains the same `(chunkX, chunkZ)` twice.
- **WHEN** `load('w1', restore)` is called.
- **THEN** it MUST reject with a descriptive error and the state MUST be `unloaded`.

## Error and failure behavior

- `load` while not `unloaded` → throw `ServerSaveLifecycle: load requires state 'unloaded'`.
- `markDirty` while not `running` → throw `ServerSaveLifecycle: markDirty requires state 'running'`.
- `tick` with a non-safe-integer or negative tick → throw `ServerSaveLifecycle: tick must be a non-negative safe integer`.
- Invalid option values (`autosaveEveryTicks`, `limitPerDrain`, `flushZeroProgressLimit` not positive integers) → throw `ServerSaveLifecycle: <detail>`.
- Invalid unit (unknown kind, empty `worldId`, non-integer chunk coords, missing `value`) → throw `ServerSaveLifecycle: <detail>`.
- Per-unit write/encode failure during a drain → re-queue + classified `SaveFailure`; the drain does not throw.
- `flush` zero-progress limit reached → recorded failure; `saveAndClose` throws; state stays `flushing`.

## Performance and resource bounds

- Drain is O(limitPerDrain) writes per call; encode is per-unit; autosave cadence bounds drain frequency; empty queues cost a size check only.
- Pending map bounded by the number of distinct dirty keys; no unbounded growth.

## Compatibility and migration

- Pure addition; no record shape, `WORLD_DB_VERSION`, or migration-chain change. Load applies existing 041 chains via the codec; writes are current-version records. A world saved by the existing client path loads on the server and back.

## Security and integrity

- Data integrity is enforced by all-or-nothing load (no partial world) and no-loss drain (no silent drops). Storage failures are classified (043 conventions) and surfaced via `lastFailures` rather than swallowed.

## Observability

- `state`, `pendingCount`, `lastFailures` (classified, with unit keys and timestamps), and `LoadResult` counts/outcome. Optionally `autosaveEveryTicks` inspector.

## Verification mapping

- `tests/unit/ServerSaveLifecycle.test.ts` verifies REQ-1..REQ-7 with a fake `SaveLoadBoundary` and fake `storageGate`.
- An integration test round-trips a small world through a `WorldTickProcess`-hosted lifecycle (load → mutate → drain on cadence → `saveAndClose`) using a real codec adapter and a test boundary, asserting determinism.
