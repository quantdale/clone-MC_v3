# Proposal: 312-autosave-flush-and-dispose-concurrency-integrity

## Problem

An exhaustive audit and browser verification run following Change 311 uncovered and deterministically reproduced two persistence concurrency and teardown integrity defects in `src/storage/`:

1. **Concurrent Tick / Flush Race & Premature Return (`AutosaveCoordinator.ts`, `GamePersistence.ts`)**:
   - `AutosaveCoordinator.flush()` joins earlier queue drains at entry (`await this.queue.runExclusive(...)`), then loops `while (this.queue.size > 0 ...)` without suppressing scheduled `tick()` runs or serializing concurrent `flush()` calls (`pagehide` + `visibilitychange` + explicit `GamePersistence.flush()`), and without checking `this.queue.outstandingSize` (in-flight writes).
   - Because `DirtySaveQueue.drainReport` is an `async` wrapper around `runExclusive`, its extra promise-resolution microtask hop lets a queued `tick()` or concurrent drain enter `drainReportUnlocked` and move the last pending unit from `this.pending` (`queue.size === 0`) into `this.inFlightKey` (`queue.outstandingSize === 1`) right before `flush()`'s `while` condition re-evaluates.
   - `AutosaveCoordinator.flush()` exits prematurely with an in-flight write still executing, under-reports its written count, cannot retry if that in-flight write fails, and causes `GamePersistence.flush()` (`const failed = this.queue.outstandingSize`) to report `failed: 1` and trigger spurious health probes on a completely healthy save — observed directly in Playwright `persistence.spec.ts` (`flush committed=118 failed=1` while `errors: []` and `outstandingSize` settled to `0` milliseconds later) and reproduced deterministically in Node.
2. **Unsettled Raw Metadata Writes on `dispose()` and `flush()` (`GamePersistence.ts`)**:
   - Fourteen subsystem saves (`withers`, `itementities`, `xporbs`, `gamemode`, `hardcore`, `difficulty`, `statistics`, `sleep`, `weather`, `trading`, `raid`, `advancements`, `recipebook`, `gamerules`) use `scheduleRawWrite()` tracked via `this.rawWrites` / `this.rawTails` outside `DirtySaveQueue`.
   - `GamePersistence.dispose()` flushes only `this.coordinator.flush()` and immediately closes `this.metadata` (`repo.close()`, clearing `this.db = null`), leaving pending or chained `rawWrites` (such as those enqueued by `Game.dispose()` immediately prior) to hit `WorldMetadataRepository: database not open` and silently drop state.
   - `GamePersistence.flush()` similarly returns without settling `this.rawWrites`, exposing callers to incomplete metadata commits and missed queued saves if autosave ticks enqueue work while raw writes settle.

## Goals

- Eliminate premature `AutosaveCoordinator.flush()` completion while any queue drain is in flight (`outstandingSize > 0`).
- Serialize concurrent `AutosaveCoordinator.flush()` executions and suppress redundant periodic `tick()` interference during an active flush while keeping failure bounds (`FLUSH_ZERO_PROGRESS_LIMIT = 3`, `FLUSH_MAX_ROUNDS = 128`) strictly intact.
- Settle all tracked `rawWrites` in both `GamePersistence.dispose()` (before closing any repository) and `GamePersistence.flush()`.
- Preserve existing health classification, reset barriers (`resetCurrentWorld`), and single-flight queue guarantees.

## Non-goals

- Merging `rawWrites` into `DirtySaveQueue` or altering repository storage schemas/keys.
- Altering `FLUSH_ZERO_PROGRESS_LIMIT` or `FLUSH_MAX_ROUNDS` bounds.
- Touching headed GPU certification (Change 258 remains BLOCKED).

## Preconditions

- Change 311 is VERIFIED and published on `origin/main` at `98df628ec9adf7a839d94f484203d8e66f2570a9`.
- Repository working tree is clean.

## Dependencies

- `src/storage/AutosaveCoordinator.ts`
- `src/storage/GamePersistence.ts`

## Proposed change

- Serialize `AutosaveCoordinator.flush()` over a FIFO flush chain, suppress `tick()` while a flush is active (`flushingDepth > 0`), include `this.queue.outstandingSize > 0` (settling in-flight external drains up to a round cap) in the drain loop condition, and settle the queue mutex before returning.
- Add bounded `settleRawWrites()` in `GamePersistence.ts`, invoke it alongside `coordinator.flush()` before repository teardown in `dispose()`, and settle both `coordinator.flush()` and `rawWrites` coherently in `flush()`.

## Compatibility and migration

Zero schema, wire-format, or stored-record changes. Fully backward compatible with all persisted worlds and callers.

## Risks

- A buggy or hanging mock `put*Data` during `flush()`/`dispose()` could stall if unbounded; existing `rawWrites` are bounded per call and existing test cleanups release gates before `dispose()`. Setting `flushingDepth` must strictly use `try/finally`, and external in-flight settling must stay bounded by `FLUSH_MAX_ROUNDS`.

## Rollback strategy

Revert via Git commit; zero data format changes.

## Definition of Done

- Failing-first unit tests reproduce both concurrency/race bugs before production edits and pass after.
- Targeted unit tests, `persistence.spec.ts` E2E, full 13 `verify:all` gates, and `test:perf:multiplayer` pass.
- Checkpoint committed and pushed to `origin/main` per `openspec/REVIEW_HANDOFF.md`.

## Advancement gate

100% of tasks completed, all mandatory requirements verified, 0 regressions, and complete evidence recorded in `verification.md`.
