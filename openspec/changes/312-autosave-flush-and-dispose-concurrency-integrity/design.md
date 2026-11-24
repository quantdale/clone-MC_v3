# Design: 312-autosave-flush-and-dispose-concurrency-integrity

## Context/current state

Currently:
1. `AutosaveCoordinator` (`src/storage/AutosaveCoordinator.ts`):
   - `tick()` checks `if (this.queue.size === 0) return 0;` and calls `this.queue.drainReport(...)`.
   - `flush()` calls `await this.queue.runExclusive(async () => undefined);` once at entry, then loops `while (this.queue.size > 0 && zeroProgressRuns < FLUSH_ZERO_PROGRESS_LIMIT && rounds < FLUSH_MAX_ROUNDS)`.
   - Neither `tick()` nor a second concurrent `flush()` is excluded during `flush()`. When `DirtySaveQueue.drainReport` resolves, its extra `async` return-unwrapping microtask runs after `runExclusive`'s `noop` settles `drainTail`, letting a queued `tick()` (or concurrent `flush()` or direct `queue.drainReport()`) pull the last pending item from `pending` into `inFlightKey` before `flush()` re-evaluates `this.queue.size > 0`. `flush()` sees `0`, exits early, undercounts written units, misses retry if that write fails, and causes `GamePersistence.flush()` to observe `this.queue.outstandingSize === 1` (`failed: 1`) on a healthy in-flight write.
2. `GamePersistence` (`src/storage/GamePersistence.ts`):
   - Tracks 14 raw metadata operations in `this.rawWrites` (values keyed by non-rejecting `Promise<boolean>`), chained per key on `this.rawTails`.
   - `dispose()` sets `this.disposed = true`, awaits ONLY `this.coordinator.flush()`, then calls `repo.close()` on all six repositories (`metadata` etc.), aborting/failing any active or queued `rawWrites` (`WorldMetadataRepository: database not open`).
   - `flush()` awaits ONLY `this.coordinator.flush()`, returning before `this.rawWrites` finish committing.

## Target state

1. **Serialized, Settled `AutosaveCoordinator.flush()`**:
   - Track `private flushingDepth = 0` and `private flushTail: Promise<unknown> = Promise.resolve()`.
   - `tick()` returns `0` immediately when `this.flushingDepth > 0 || this.queue.size === 0`.
   - `flush()` queues onto `this.flushTail` so overlapping calls (`pagehide`, `visibilitychange`, caller `flush()`) execute sequentially without interleaving batches, while each call still performs its own fresh bounded drain check after the prior flush completes (preserving persistent-failure detection for all waiters).
   - `flushExclusive()` increments `this.flushingDepth` in `try/finally`, joins prior queue drains at entry, loops while `(this.queue.size > 0 || this.queue.outstandingSize > 0) && zeroProgressRuns < FLUSH_ZERO_PROGRESS_LIMIT && rounds < FLUSH_MAX_ROUNDS && settleWaits < FLUSH_MAX_ROUNDS` (when `size === 0`, joining `await this.queue.runExclusive(...)` with `settleWaits++` to let external in-flight writes settle or requeue), and runs a final `await this.queue.runExclusive(async () => undefined)` before returning `total`.
2. **Raw-Write Settlement in `GamePersistence.dispose()` and `GamePersistence.flush()`**:
   - Add `private async settleRawWrites(): Promise<void>`:
     - Loops up to `MAX_RAW_SETTLE_PASSES = 16` while `this.rawWrites.size > 0`, awaiting `Promise.all([...this.rawWrites.keys()])`. Because cleanup `.then(() => this.rawWrites.delete(pending))` is registered before `settleRawWrites` awaits `pending`, settled keys are removed synchronously in microtasks before `Promise.all` resolves.
   - `dispose()`: after `this.disposed = true`, `stopRecoveryTimer()`, and `coordinator.stop()`, runs `await Promise.allSettled([this.coordinator.flush(), this.settleRawWrites()])` before closing the six repositories.
   - `flush()`: drains both `coordinator.flush()` and `settleRawWrites()` (when `rawWrites.size > 0`), repeating up to 4 passes only if new queue/raw work arrived and progress was made (immediately breaking on persistent failure `batchCommitted === 0 && this.rawWrites.size === 0` so zero-progress retry budget is not multiplied). Reads `failed = this.queue.outstandingSize` synchronously right after `coordinator.flush()` completes.

## Invariants

- **INV-AFD-1 (Single-Flight Flush)**: At most one `AutosaveCoordinator.flushExclusive()` body executes at a time; concurrent `tick()` calls during an active flush are no-ops (`return 0`).
- **INV-AFD-2 (No Premature Flush Exit)**: Unless bounded by `FLUSH_ZERO_PROGRESS_LIMIT` / `FLUSH_MAX_ROUNDS` (or continuous external mutation exceeding caps), `AutosaveCoordinator.flush()` MUST NOT return while `this.queue.inFlightKey !== null` (`queue.outstandingSize > queue.size`).
- **INV-AFD-3 (Complete Teardown Before Close)**: `GamePersistence.dispose()` MUST settle all pending/chained `rawWrites` and queue flushes before calling `close()` on any repository.
- **INV-AFD-4 (Raw Write Settlement on Flush)**: `GamePersistence.flush()` MUST settle active `rawWrites` queued prior to flush completion while leaving `failed` equal to `this.queue.outstandingSize`.

## API and data model

No public method signatures, return types, or persisted record schemas change.
- `AutosaveCoordinator`: adds private `flushingDepth: number`, `flushTail: Promise<unknown>`, and `flushExclusive(): Promise<number>`.
- `GamePersistence`: adds private `settleRawWrites(): Promise<void>`.

## Control/data flow

```
caller 1: flush() ─┐
caller 2: flush() ─┼─▶ flushTail (FIFO) ─▶ flushExclusive() [flushingDepth > 0]
setInterval: tick()┘     (suppressed when flushingDepth > 0)
                                               │
                                               ▼
                                 join prior runExclusive()
                                 while (size > 0 || outstandingSize > 0) ...
                                 final join runExclusive() ─▶ outstandingSize === 0 (unless failed/capped)
```

```
Game.dispose() ─▶ savePlayerStateDurable() (queue) + saveGameMode/Weather/... (rawWrites)
               └▶ persistenceImpl.dispose()
                      ├─ disposed = true; coordinator.stop()
                      ├─ Promise.allSettled([coordinator.flush(), settleRawWrites()])
                      └─ repo.close() × 6 (only after all writes settled)
```

## Detailed behavior

See Requirements REQ-AFD-1 through REQ-AFD-4 in `specs/autosave-flush-concurrency/spec.md`.

## Failure modes

- Persistent sink failures hit `FLUSH_ZERO_PROGRESS_LIMIT` (3 rounds) in `flushExclusive()`, keep failing units queued cleanly in `pending`, and return `written` (`failed === this.queue.outstandingSize` > 0).
- Failing `rawWrites` resolve `pending` to `false` via `scheduleRawOperation`'s rejection handler (`this.recordError(...)`), so `settleRawWrites()` completes without throwing and never blocks `dispose()` or `flush()`.
- Post-`dispose` calls to `markDirty` or `scheduleRawWrite` are no-ops (`this.disposed === true`), guaranteeing `rawWrites.size` reaches 0 during `dispose()`.

## Compatibility/migration

100% backward compatible; fixes latent races on existing call sites.

## Performance/resource constraints

When `this.rawWrites.size === 0` (common chunk-only flush), `settleRawWrites()` is skipped without allocating arrays or awaiting extra microtasks. No hot-path allocations in rendering, meshing, or ticking.

## Testing seams

- `tests/unit/AutosaveCoordinator.test.ts`
- `tests/unit/GamePersistence.test.ts`
- `tests/unit/RecoveryBackupAndAtomicReset.test.ts`
- `tests/e2e/persistence.spec.ts`

## Observability/debugging

All existing diagnostics (`errors`, `failureCount`, `lastFailure`, `outstandingSize`) remain unchanged; spurious `failed: 1` telemetry on healthy interleaved ticks disappears.

## Affected files/symbols

- `src/storage/AutosaveCoordinator.ts` (`AutosaveCoordinator`, `tick`, `flush`, `flushExclusive`)
- `src/storage/GamePersistence.ts` (`GamePersistence`, `dispose`, `flush`, `settleRawWrites`)

## Rejected alternatives

- *Coalescing concurrent `flush()` calls onto a single shared promise*: Rejected. If Caller 2 marks a new unit dirty and then calls `flush()` while Caller 1 is already inside its final round, returning Caller 1's pre-mark result or failing to make Caller 2 perform its own check under persistent-failure recovery probes (`f3` followed by `f4`) could violate caller expectations; sequential `flushTail` chaining handles both fresh marks and persistent-failure assertions cleanly.
- *Awaiting `rawWrites` only in `dispose()` and not in `flush()`*: Rejected. E2E and unit callers invoke `flush()` to ensure all durable state (including weather/sleep/gamemode/trading/raid) has settled before page reload or verification.

## Downstream dependencies

`Game.dispose()`, `Game.onPageHide`, `tests/e2e/persistence.spec.ts`, and persistence suites benefit automatically without signature changes.
