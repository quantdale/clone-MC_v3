# Proposal: 039-transactional-autosave

## Problem

038 built a bounded, ordered `DirtySaveQueue` and a `RepositorySaveSink` that routes units to the
034-037 IndexedDB repositories. Nothing yet *schedules* drains, so dirty units would only be persisted if
a caller remembered to drain — and a crash/close before an explicit drain loses all unflushed work. There
is no periodic autosave and no pagehide/visibility flush.

## Goals

- Provide an `AutosaveCoordinator` that drives `DirtySaveQueue.drain` on a periodic interval with a
  bounded `limitPerTick`, so world saves happen continuously and never block the simulation.
- Flush all pending units on `pagehide` (and `visibilitychange`→hidden), best-effort, so a tab close /
  navigation persists as much as possible.
- Be crash-resistant: because drains run periodically, recent dirty units are persisted well before a
  crash; the pagehide flush pushes the remainder.
- Be dependency-free and testable: timers and the flush event target are injectable (defaults to
  `globalThis` / `window`), so Node unit tests use fake timers and a fake event target without a browser.

## Non-goals

- The world/simulation code that *discovers* dirty units and enqueues them (out of 039 scope; 039 only
  provides the scheduling policy + flush). The producer calls `coordinator.markDirty(unit)`.
- Migration/quota handling (043) and localStorage import (040); 039 reuses the 034-037 repositories.
- Transactional atomicity guarantees beyond the per-unit write semantics the repositories already provide.

## Preconditions

- Changes 034-038 are VERIFIED; `DirtySaveQueue`, `RepositorySaveSink`, and the four repositories exist.
- `npm test` / `npm run test:e2e` green at the 038 baseline (552 unit / 19 e2e).

## Dependencies

- 038 `DirtySaveQueue` + `SaveSink` (`RepositorySaveSink`).
- 034-037 repository classes for the sink.

## Proposed change

- `src/storage/AutosaveCoordinator.ts` (NEW): `AutosaveCoordinator` constructed with `{ queue, sink,
  limitPerTick?, intervalMs?, timer?, flushTarget? }`. `markDirty(unit)` enqueues and (re)starts the
  interval if idle; `start()` begins the periodic interval and registers `pagehide`/`visibilitychange`
  flush listeners on `flushTarget`; `stop()` clears the interval and listeners; `tick()` drains one bounded
  batch; `flush()` drains to empty (best effort, with a progress guard against infinite loops on
  persistent failures). When the queue is empty a `tick` is a no-op (idle).

## Compatibility and migration

No schema/`WORLD_DB_VERSION` change. 039 only schedules drains over the existing 034-038 layer.

## Risks

- A persistently failing sink would keep units pending; `flush` guards against an infinite loop by
  bailing after a run of zero-progress drains. No data loss (units stay pending), just deferred.
- `pagehide` may not always allow async IndexedDB writes to finish before unload; best-effort only.
- Timer/listener leakage if `stop()` is not called; `start()` is idempotent and reuses one interval.

## Rollback strategy

Revert the commit. 039 adds no schema and no persisted data of its own; reverting leaves 034-038 intact.

## Definition of Done

- Periodic interval drains at most `limitPerTick` units per `tick`.
- `pagehide`/`visibilitychange`(hidden) trigger a best-effort full `flush`.
- `start()`/`stop()` manage the interval and listeners cleanly and idempotently.
- Idle queues cost no drain work.
- Unit tests cover periodic bounded drain, retry of failing units, pagehide flush, and lifecycle.
- Full gate green; 039 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 039 suite; E2E stays 19/19.
