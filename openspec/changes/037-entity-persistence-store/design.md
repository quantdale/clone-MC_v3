# Design: 037-entity-persistence-store

## Context / current state

036 created `voxel-world-db` (version `3`) with three stores: `world-metadata` (034), `chunk-sections`
(035), and `block-entities` (036), all created by the shared `ensureWorldStores` routine behind
injectable, mock-testable repositories. Entities are not yet persisted, and no live entity instance
or serialization exists (017 only defines the `EntityTypeRegistry`). A future framework (129+) will
own entity lifecycle and payloads.

## Target state

The same database, now at version `4`, contains four stores: `world-metadata`, `chunk-sections`,
`block-entities`, and a new `entities` store keyed by a composite `worldId|chunkX|chunkZ` key grouping
the entities within one chunk. A new `EntityRepository` persists and reloads `EntityChunkRecord`
records. All repositories open the DB at `WORLD_DB_VERSION` and run the shared `ensureWorldStores` on
`onupgradeneeded`.

## Invariants

- `WORLD_DB_NAME = 'voxel-world-db'`, `WORLD_DB_VERSION = 4`, `WORLD_METADATA_STORE = 'world-metadata'`,
  `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`, `WORLD_BLOCK_ENTITY_STORE = 'block-entities'`,
  `WORLD_ENTITY_STORE = 'entities'`.
- `entities` store keyPath is `'key'`; composite key `worldId|chunkX|chunkZ` is unique per world.
- Every persisted record MUST pass `validateEntityChunkRecord` before `putChunkEntities`; rejection
  MUST NOT write a partial record.
- `getChunkEntities(worldId, chunkX, chunkZ)` returns `null` when absent (never throws for a missing key).
- The repository MUST be constructable without a global `indexedDB` (factory injected).
- The repository is decoupled from any live entity framework; it stores plain `SerializedEntity`/
  `EntityChunkRecord` data with an opaque `data` payload.

## API and data model

```ts
// src/storage/WorldMetadata.ts (changed)
export const WORLD_DB_VERSION = 4;                  // was 3
export const WORLD_ENTITY_STORE = 'entities';       // NEW

// src/storage/EntityRecord.ts (NEW)
export interface SerializedEntity {
  schemaVersion: number;
  typeKey: string;     // entity type registry key, e.g. 'minecraft:zombie'
  x: number; y: number; z: number; // world coordinates
  data: unknown;       // opaque entity payload (future framework fills this)
}
export interface EntityChunkRecord {
  key: string;         // `${worldId}|${chunkX}|${chunkZ}`
  worldId: string;
  chunkX: number;
  chunkZ: number;
  entities: SerializedEntity[];
}
export function validateSerializedEntity(input: unknown): SerializedEntity;
export function validateEntityChunkRecord(input: unknown): EntityChunkRecord;

// src/storage/EntityRepository.ts (NEW)
export class EntityRepository {
  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number });
  open(): Promise<void>;
  putChunkEntities(worldId: string, chunkX: number, chunkZ: number, entities: SerializedEntity[]): Promise<void>;
  getChunkEntities(worldId: string, chunkX: number, chunkZ: number): Promise<SerializedEntity[] | null>;
  deleteChunkEntities(worldId: string, chunkX: number, chunkZ: number): Promise<void>;
  listChunks(worldId: string): Promise<EntityChunkRecord[]>;
  close(): void;
}
```

## Control / data flow

1. `open()` calls `factory.open(dbName, dbVersion)`; on `onupgradeneeded` it calls
   `ensureWorldStores(req.result)`. On `onsuccess` it caches the `IDBDatabase`.
2. `putChunkEntities(worldId, cx, cz, entities)` → `validateEntityChunkRecord({ worldId, chunkX: cx,
   chunkZ: cz, entities })` → build `record = { key: `${worldId}|${cx}|${cz}`, worldId, chunkX: cx,
   chunkZ: cz, entities }` → `store.put(record)`.
3. `getChunkEntities(worldId, cx, cz)` → `store.get(key)` → returns the stored `entities` array or `null`.
4. `listChunks(worldId)` → `store.getAll()` → filter by `worldId` → map to `EntityChunkRecord`.
5. `deleteChunkEntities(worldId, cx, cz)` → `store.delete(key)`.

## Detailed behavior

- `ensureWorldStores(db)` checks `db.objectStoreNames.contains` for each known store and creates any
  that are missing with its keyPath. Idempotent; safe to call from any repository's upgrade path.
- `validateSerializedEntity` checks: object; `schemaVersion` finite integer >= 1; `typeKey` a
  non-empty string; `x`/`y`/`z` finite integers; `data` is present (not `undefined`). On failure it
  throws `Error` with a descriptive message. It does NOT coerce types.
- `validateEntityChunkRecord` checks: object; `worldId` non-empty string; `chunkX`/`chunkZ` finite
  integers; `entities` a non-null array; every element validates via `validateSerializedEntity`.
- Double `open()` is idempotent (reuses the cached db).
- The composite key uses `|` separators; chunk coordinates are integers so the key is unambiguous.

## Failure modes

- Missing/invalid `IDBFactory` → `open()` rejects.
- Invalid record → `putChunkEntities` rejects before touching the store.
- `getChunkEntities` of an absent key → `null` (no throw).
- Request `onerror` → rejecting Promise with the error.

## Compatibility / migration

`WORLD_DB_VERSION` is the single migration pivot. Bumping to `4` makes a v3 DB fire `onupgradeneeded`
on next open; `ensureWorldStores` adds `entities` while leaving the three prior stores intact. This is
additive and reversible during development.

## Performance / resource constraints

Entities are sparse; a chunk record holds only the entities within that chunk. `listChunks` scans all
stored chunk records and filters by `worldId`; bounded by chunks saved per world. No per-frame work.

## Testing seams

- `tests/unit/EntityRepository.test.ts` injects the in-memory `IDBFactory` mock (reused from 034).
  Covers: store creation on open; put/get round-trip; absent-key null; list-by-world isolation; delete;
  validation rejection (bad entity / non-array entities); coexistence with the prior stores (opening
  034/035/036 repositories against the same mock name yields all four stores), and a v3→v4 migration
  that preserves all three prior stores and their records.

## Observability / debugging

The repository is self-contained; `dbName`/`dbVersion` are overridable for tests.

## Affected files / symbols

- `src/storage/WorldMetadata.ts` — bump `WORLD_DB_VERSION`, add `WORLD_ENTITY_STORE`.
- `src/storage/WorldMetadataRepository.ts` — add the `entities` branch inside `ensureWorldStores`.
- `src/storage/EntityRecord.ts` — NEW types + validators.
- `src/storage/EntityRepository.ts` — NEW repository boundary.
- `tests/unit/EntityRepository.test.ts` — NEW tests (reuses `tests/unit/IdbFactoryMock.ts`).

## Rejected alternatives

- *Persist one record per entity keyed by a world-unique id*: too fine-grained; 038/039 save queues
  and unload/reload operate at chunk granularity, so grouping per chunk matches the streaming (033),
  chunk-section (035), and block-entity (036) units and keeps writes bounded.
- *Couple storage to `EntityTypeRegistry`*: couples storage to a registry that owns no instance data
  yet, and breaks injectable, dependency-free testability; the caller deserializes with its framework.
  The `typeKey` is stored as an opaque string.

## Downstream dependencies

038/039 add the incremental dirty-save queue over these repositories (034–037); the future entity
framework (129+) fills the `data` payload.
