# Spec: Autosave Flush and Dispose Concurrency Integrity

## Contract

`AutosaveCoordinator.flush()` and `GamePersistence.flush()` / `dispose()` MUST coordinate concurrent ticks, concurrent flushes, external queue drains, and in-flight raw metadata writes so healthy writes never cause premature flush completion, false failure reporting, missed failure retries, or database-closed errors during teardown.

## Definitions

- **In-flight queue write**: A unit currently executing `sink.write` inside `DirtySaveQueue.drainReportUnlocked`, reflected by `DirtySaveQueue.outstandingSize > DirtySaveQueue.size`.
- **Active flush**: Execution of `AutosaveCoordinator.flush()` from entry into `flushExclusive()` until its completion.
- **Raw metadata write**: An asynchronous write scheduled via `GamePersistence.scheduleRawOperation` and tracked in `rawWrites`.

## Invariants

- **INV-AFD-1**: At most one `AutosaveCoordinator.flushExclusive()` loop runs at any time.
- **INV-AFD-2**: Periodic `AutosaveCoordinator.tick()` calls triggered while a flush is active perform zero drains (`return 0`).
- **INV-AFD-3**: When `AutosaveCoordinator.flush()` finishes a non-capped, non-failing drain, `DirtySaveQueue.outstandingSize` SHALL equal `0`.
- **INV-AFD-4**: `GamePersistence.dispose()` closes no repository until both `coordinator.flush()` and all queued/active `rawWrites` settle.

## Requirements

### Requirement: REQ-AFD-1 Tick Suppression and In-Flight Settlement in `AutosaveCoordinator.flush()`

`AutosaveCoordinator.flush()` MUST suppress overlapping `tick()` drains while flushing, MUST wait for any in-flight queue drain (whether started prior to flush or externally between rounds) before returning, and MUST retry if an external in-flight write fails rather than exiting early when `queue.size === 0`.

#### Scenario: Concurrent tick during multi-round flush does not cause premature completion or false outstandingSize
- **GIVEN** an `AutosaveCoordinator` with `limitPerTick: 2` and 3 pending units where the final unit slows down mid-write
- **WHEN** `flush()` is running and `tick()` is triggered concurrently during the first batch
- **THEN** `tick()` returns `0` without stealing the remaining unit from `flush()`
- **AND** `flush()` does not resolve until all 3 writes finish, returns `3`, and leaves `coord.size === 0`

#### Scenario: External drain leaving last unit in flight is settled before flush returns
- **GIVEN** a pending unit cleared from `queue.size` into `queue.inFlightKey` by a concurrent direct `queue.drainReport()` between flush rounds
- **WHEN** the external write eventually succeeds or rejects
- **THEN** `flush()` MUST NOT return while `queue.outstandingSize > 0` during the in-flight phase
- **AND** if the external write fails, `flush()` attempts recovery/retry before exiting cleanly

### Requirement: REQ-AFD-2 Single-Flight Serialization of Concurrent `AutosaveCoordinator.flush()` Calls

Overlapping invocations of `AutosaveCoordinator.flush()` MUST serialize sequentially over a FIFO chain so batches never interleave and a second caller sees all work (including marks made right before its call) settled before resolving.

#### Scenario: Overlapping flushes execute cleanly without reporting healthy in-flight work as failed
- **GIVEN** an active `flush()` blocked mid-write on unit `'a'` and a second unit `'b'` marked dirty before a second concurrent `flush()` is called
- **WHEN** the write gate is released
- **THEN** the second `flush()` SHALL NOT resolve before the first completes and `'b'` commits
- **AND** both calls leave `coord.size === 0`

### Requirement: REQ-AFD-3 Complete Settlement of Raw Metadata Writes in `GamePersistence.dispose()`

`GamePersistence.dispose()` MUST await completion/settlement of all active and chained `rawWrites` alongside `coordinator.flush()` BEFORE closing any underlying repository (`this.metadata`, etc.).

#### Scenario: Dispose after queued raw metadata writes completes all writes before closing DB
- **GIVEN** a slower first `putGameModeData` write in flight followed synchronously by a second `saveGameMode` update and immediate `persistence.dispose()`
- **WHEN** the first write gate releases and `dispose()` resolves
- **THEN** both writes finish without throwing `database not open`, `persistence.errors` is empty, and persisted storage contains the second value before the database closes

### Requirement: REQ-AFD-4 Coherent Raw Metadata and Queue Settlement in `GamePersistence.flush()`

`GamePersistence.flush()` MUST settle pending `rawWrites` alongside `coordinator.flush()` and MUST report `failed === 0` whenever all queued units and raw writes complete cleanly.

#### Scenario: Flush after delayed chained raw metadata write waits until persistence lands
- **GIVEN** a slow queued `putWeatherData` write started immediately before `persistence.flush()`
- **WHEN** `flush()` is awaited and the slow gate resolves
- **THEN** `flush()` does not resolve before the weather record is written, and reports `{ failed: 0, health: 'ok' }`

## Error and failure behavior

- Persistent queue write failures hit `FLUSH_ZERO_PROGRESS_LIMIT` (3), keep failed units in `pending`, and report `failed > 0` in `GamePersistence.flush()`.
- Rejected raw metadata writes record an error in `this.errors` and resolve `false` without stalling `settleRawWrites()` or preventing repository teardown in `dispose()`.

## Performance and resource bounds

- `settleRawWrites()` uses at most `16` passes and skips Promise/array work entirely when `this.rawWrites.size === 0`.
- External-drain wait checks inside `flushExclusive()` are capped by `FLUSH_MAX_ROUNDS` (128).

## Compatibility and migration

No persisted data schema or API signature changes. Zero migration required.

## Security and integrity

Prevents teardown data loss (`database not open`) and eliminates false failure states on concurrent autosave activity.

## Observability

Preserves `this.errors`, `failureCount`, `lastFailure`, and `GamePersistenceFlushResult` fields accurately.

## Verification mapping

| Requirement | Target | Tests |
|---|---|---|
| REQ-AFD-1 | `src/storage/AutosaveCoordinator.ts` (`tick`, `flushExclusive`) | `tests/unit/AutosaveCoordinator.test.ts` |
| REQ-AFD-2 | `src/storage/AutosaveCoordinator.ts` (`flush`) | `tests/unit/AutosaveCoordinator.test.ts`, `tests/unit/RecoveryBackupAndAtomicReset.test.ts` |
| REQ-AFD-3 | `src/storage/GamePersistence.ts` (`dispose`, `settleRawWrites`) | `tests/unit/GamePersistence.test.ts` |
| REQ-AFD-4 | `src/storage/GamePersistence.ts` (`flush`, `settleRawWrites`) | `tests/unit/GamePersistence.test.ts`, `tests/e2e/persistence.spec.ts` |
