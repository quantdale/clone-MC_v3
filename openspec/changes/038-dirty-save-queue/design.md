# Design: 038-dirty-save-queue

## Context / current state

034-037 built four typed repositories over `voxel-world-db` (v4): `WorldMetadataRepository`,
`ChunkSectionRepository`, `BlockEntityRepository`, `EntityRepository`. Each can `open()` and `put*`
independently, but nothing bounds or batches writes. A save must not block the simulation, so writes
need an ordered, bounded, de-duplicated drain.

## Target state

A generic `DirtySaveQueue` holds dirty `SaveUnit`s keyed by a unique string. A `drain(sink, limit)`
call writes at most `limit` units in insertion order through an injected `SaveSink`, removing the
succeeded ones and re-queueing failures for later retry. A `RepositorySaveSink` maps each unit to the
correct 034-037 repository so the queue actually persists. The queue is in-memory and synchronous in
structure; `drain` is async because sinks (IndexedDB) are async.

## Invariants

- `SaveUnit.key` is unique; re-`markDirty` with the same key updates the stored unit (payload/coords)
  but preserves its original FIFO position.
- `drain(sink, limit)` performs at most `limit` `sink.write` calls.
- Units written successfully are removed from the pending set.
- Units whose `sink.write` rejects are re-added to pending (moved to the end) so they retry next drain.
- `size` equals the number of pending units; `has(key)`/`keys()` reflect pending state.
- `RepositorySaveSink` dispatches by `unit.kind` and never throws on a known kind; an unknown kind
  rejects (surfaced as a failed unit).

## API and data model

```ts
// src/storage/DirtySaveQueue.ts
export type SaveUnitKind = 'world-metadata' | 'chunk-sections' | 'block-entities' | 'entities';

export interface SaveUnit {
  key: string;        // unique unit key, e.g. `chunk-sections|a|1|2`
  kind: SaveUnitKind;
  worldId: string;
  chunkX: number;     // 0 for world-metadata
  chunkZ: number;     // 0 for world-metadata
  payload: unknown;   // kind-specific data (WorldMetadata | SerializedChunkColumn | SerializedBlockEntity[] | SerializedEntity[])
}

export interface SaveSink {
  write(unit: SaveUnit): Promise<void>;
}

export class DirtySaveQueue {
  markDirty(unit: SaveUnit): void;
  drain(sink: SaveSink, limit: number): Promise<number>; // returns units written
  get size(): number;
  has(key: string): boolean;
  keys(): string[];
  clear(): void;
}

// src/storage/RepositorySaveSink.ts
export interface RepositorySaveSinkDeps {
  metadata?: WorldMetadataRepository;
  chunkSections?: ChunkSectionRepository;
  blockEntities?: BlockEntityRepository;
  entities?: EntityRepository;
}
export class RepositorySaveSink implements SaveSink {
  constructor(deps: RepositorySaveSinkDeps);
  write(unit: SaveUnit): Promise<void>;
}
```

## Control / data flow

1. A producer (later: world/save coordinator) calls `queue.markDirty(unit)` whenever a unit becomes
   dirty. The unit carries its payload so the sink needs no external lookup.
2. On a save tick (later: 039), the coordinator calls `await queue.drain(sink, limit)`.
3. `drain` slices the pending entries (insertion order) to `limit`, deletes each from pending, and
   awaits `sink.write(unit)`. On success the unit stays removed; on rejection it is re-added (end of
   queue). Returns the count of successful writes.
4. `RepositorySaveSink.write(unit)` switches on `unit.kind`:
   - `world-metadata` → `metadata.putMetadata(unit.payload as WorldMetadata)`.
   - `chunk-sections` → `chunkSections.putColumn(unit.worldId, unit.payload as SerializedChunkColumn)`.
   - `block-entities` → `blockEntities.putChunkEntities(unit.worldId, unit.chunkX, unit.chunkZ, unit.payload as SerializedBlockEntity[])`.
   - `entities` → `entities.putChunkEntities(unit.worldId, unit.chunkX, unit.chunkZ, unit.payload as SerializedEntity[])`.
   - Unknown/missing repository → reject.

## Detailed behavior

- `markDirty` uses `Map.set(key, unit)`; for an existing key the value is replaced but the insertion
  position is retained (JS `Map` semantics), so FIFO order is by first mark.
- `drain` reads `[...pending.entries()].slice(0, limit)`, deletes each key up front (so a unit is not
  processed twice if `drain` is re-entered), then writes. A rejected write re-`set`s the key (moves to
  end).
- `limit <= 0` drains nothing and returns `0` (no writes, no removals).
- `clear()` empties pending.

## Failure modes

- `sink.write` rejects → unit re-queued, `drain` continues with remaining batch; returned count
  excludes failures.
- Missing repository for a kind → `write` rejects → unit re-queued.
- Concurrent `drain` calls: each snapshots its own slice; because entries are deleted before writing,
  two overlapping drains do not double-write the same unit.

## Compatibility / migration

No schema change; `WORLD_DB_VERSION` stays `4`. 038 layers above 034-037 only.

## Performance / resource constraints

Each `drain` does at most `limit` async writes; the limit is the caller's budget knob (per tick /
per frame). Pending set is bounded by the number of distinct dirty units; de-dupe by key prevents
unbounded growth from repeated marks on the same unit.

## Testing seams

- `tests/unit/DirtySaveQueue.test.ts`:
  - Generic: marks units, drains in order, respects `limit`, de-dupes by key, re-queues failures,
    `size`/`has`/`keys`/`clear`.
  - Integration: builds `RepositorySaveSink` with the four repositories backed by in-memory `IDBFactory`
    mocks, enqueues one unit per kind, drains, and asserts each landed in the correct store
    (`getMetadata`/`getColumn`/`getChunkEntities`).

## Observability / debugging

`keys()` and `size` let a coordinator log/monitor pending save work; `drain` returns the written count
for metrics.

## Affected files / symbols

- `src/storage/DirtySaveQueue.ts` — NEW queue + types + `SaveSink`.
- `src/storage/RepositorySaveSink.ts` — NEW dispatcher over the four repositories.
- `tests/unit/DirtySaveQueue.test.ts` — NEW tests.

## Rejected alternatives

- *Each repository owns its own dirty flag + flush*: scatters save policy across four boundaries and
  makes bounded cross-store draining hard. A single queue is the minimal correct coordination point.
- *Queue stores closures instead of `SaveUnit`*: closures are harder to inspect/log and not
  serializable; a typed unit keyed by kind is simpler and testable.
- *Make the queue itself call the repositories directly*: couples the queue to all four classes and
  their constructors; an injected `SaveSink` keeps the queue generic and the repositories swappable.

## Downstream dependencies

039 (transactional-autosave) drives `drain` on a periodic/ pagehide policy with a chosen `limit` and
backoff; 040 (localStorage migration) imports legacy saves into the same repositories (and can enqueue
them via the queue).
