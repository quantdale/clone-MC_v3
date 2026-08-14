# Proposal: 038-dirty-save-queue

## Problem

034-037 established four typed IndexedDB repositories over the shared `voxel-world-db`
(`WorldMetadataRepository`, `ChunkSectionRepository`, `BlockEntityRepository`, `EntityRepository`).
There is no coordinating layer that gathers dirty world units and writes them with *bounded* work so a
save never blocks the simulation or starves the frame budget. Today every caller would write
synchronously and unboundedly.

## Goals

- Provide a generic, ordered `DirtySaveQueue` that collects dirty save units by a unique key and drains
  them in bounded batches.
- Bound each drain to at most `limit` writes so per-tick/per-frame save work is predictable.
- Preserve insertion order (FIFO) and de-duplicate by key (re-marking a unit updates its payload
  without creating a second entry).
- On a write failure, leave the unit pending so it is retried on a later drain (no silent loss).
- Provide a `RepositorySaveSink` that maps a save unit to the correct 034-037 repository, so the queue
  actually persists through the established stores.

## Non-goals

- The world/tick coordinator that *discovers* dirty units and supplies their payloads (that lives in the
  simulation/save-manager, 039+). 038 is the bounded queue primitive + repository wiring.
- Transactional/autosave scheduling policy (039), pagehide flush (039), or crash recovery (039).
- Any change to the repository schemas (no `WORLD_DB_VERSION` bump; 038 reuses the existing stores).

## Preconditions

- Changes 034-037 are VERIFIED; the four repositories and `ensureWorldStores` exist.
- `npm test` / `npm run test:e2e` green at the 037 baseline (545 unit / 19 e2e).

## Dependencies

- 034-037 repository classes and their `open`/`put*` surfaces.
- `SerializedChunkColumn` (024), `WorldMetadata` (034), `SerializedBlockEntity` (036),
  `SerializedEntity` (037) as the per-kind payload shapes.

## Proposed change

- `src/storage/DirtySaveQueue.ts` (NEW): `SaveUnitKind`, `SaveUnit`, `SaveSink` interface, and
  `DirtySaveQueue` (`markDirty(unit)`, `drain(sink, limit)`, `size`, `has(key)`, `keys()`, `clear()`).
- `src/storage/RepositorySaveSink.ts` (NEW): `RepositorySaveSink` wrapping the four repositories;
  `write(unit)` dispatches by `unit.kind` to the matching repository's `put*` method with the unit's
  `payload` and coordinates.
- `tests/unit/DirtySaveQueue.test.ts` (NEW): generic queue behavior (order, dedupe, bounded limit,
  failure-retry, size/clear) plus a `RepositorySaveSink` integration test using the in-memory
  `IDBFactory` mocks for all four repositories, asserting the units land in the correct stores.

## Compatibility and migration

No stored-data or `WORLD_DB_VERSION` change. 038 only adds an in-memory coordination layer above the
existing repositories. Fully backward/forward compatible with 034-037.

## Risks

- Re-marking an in-flight unit could reorder it; defined behavior keeps the original position (FIFO by
  first mark). Documented.
- A persistently failing sink would re-queue forever; bounded drain keeps it from blocking, and the
  caller decides backoff (out of 038 scope).
- The queue is in-memory only; a crash before drain loses unflushed units (handled by 039/040).

## Rollback strategy

Revert the commit. 038 adds no schema and no persisted data of its own; reverting leaves the four
repositories (and their v4 database) intact.

## Definition of Done

- `DirtySaveQueue` drains at most `limit` units per call, in insertion order, de-duplicated by key.
- Failed writes remain pending (retried next drain); successful writes are removed.
- `RepositorySaveSink` routes each `SaveUnitKind` to the correct 034-037 repository.
- Unit tests cover bounded drain, ordering, dedupe, failure-retry, size/clear, and the repository sink.
- Full gate green; 038 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 038 suite; E2E stays 19/19.
