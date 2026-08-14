# Design: 036-block-entity-persistence-store

## Context / current state

035 created `voxel-world-db` (version `2`) with two stores: `world-metadata` (034) and
`chunk-sections` (035), both created by the shared `ensureWorldStores` routine behind injectable,
mock-testable repositories. Block entities are not yet persisted, and no live block-entity instance
or serialization exists (018 only defines the `BlockEntityTypeRegistry`). A future framework (052)
will own block-entity lifecycle and payloads.

## Target state

The same database, now at version `3`, contains three stores: `world-metadata`, `chunk-sections`, and
a new `block-entities` store keyed by a composite `worldId|chunkX|chunkZ` key grouping the block
entities within one chunk. A new `BlockEntityRepository` persists and reloads `BlockEntityChunkRecord`
records. Both 034/035 repositories and the new 036 repository open the DB at `WORLD_DB_VERSION` and run
the shared `ensureWorldStores` on `onupgradeneeded`.

## Invariants

- `WORLD_DB_NAME = 'voxel-world-db'`, `WORLD_DB_VERSION = 3`, `WORLD_METADATA_STORE = 'world-metadata'`,
  `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`, `WORLD_BLOCK_ENTITY_STORE = 'block-entities'`.
- `block-entities` store keyPath is `'key'`; composite key `worldId|chunkX|chunkZ` is unique per world.
- Every persisted record MUST pass `validateBlockEntityChunkRecord` before `putChunkEntities`; rejection
  MUST NOT write a partial record.
- `getChunkEntities(worldId, chunkX, chunkZ)` returns `null` when absent (never throws for a missing key).
- The repository MUST be constructable without a global `indexedDB` (factory injected).
- The repository is decoupled from any live block-entity framework; it stores/returns plain
  `SerializedBlockEntity`/`BlockEntityChunkRecord` data with an opaque `data` payload.

## API and data model

```ts
// src/storage/WorldMetadata.ts (changed)
export const WORLD_DB_VERSION = 3;                        // was 2
export const WORLD_BLOCK_ENTITY_STORE = 'block-entities'; // NEW

// src/storage/BlockEntityRecord.ts (NEW)
export interface SerializedBlockEntity {
  schemaVersion: number;
  typeKey: string;     // block-entity type registry key, e.g. 'minecraft:chest'
  x: number; y: number; z: number; // world block coordinates
  data: unknown;       // opaque block-entity payload (future framework fills this)
}
export interface BlockEntityChunkRecord {
  key: string;         // `${worldId}|${chunkX}|${chunkZ}`
  worldId: string;
  chunkX: number;
  chunkZ: number;
  entities: SerializedBlockEntity[];
}
export function validateSerializedBlockEntity(input: unknown): SerializedBlockEntity;
export function validateBlockEntityChunkRecord(input: unknown): BlockEntityChunkRecord;

// src/storage/BlockEntityRepository.ts (NEW)
export class BlockEntityRepository {
  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number });
  open(): Promise<void>;
  putChunkEntities(worldId: string, chunkX: number, chunkZ: number, entities: SerializedBlockEntity[]): Promise<void>;
  getChunkEntities(worldId: string, chunkX: number, chunkZ: number): Promise<SerializedBlockEntity[] | null>;
  deleteChunkEntities(worldId: string, chunkX: number, chunkZ: number): Promise<void>;
  listChunks(worldId: string): Promise<BlockEntityChunkRecord[]>;
  close(): void;
}
```

## Control / data flow

1. `open()` calls `factory.open(dbName, dbVersion)`; on `onupgradeneeded` it calls
   `ensureWorldStores(req.result)`. On `onsuccess` it caches the `IDBDatabase`.
2. `putChunkEntities(worldId, cx, cz, entities)` → `validateBlockEntityChunkRecord({ worldId, chunkX: cx,
   chunkZ: cz, entities })` → build `record = { key: `${worldId}|${cx}|${cz}`, worldId, chunkX: cx,
   chunkZ: cz, entities }` → `store.put(record)`.
3. `getChunkEntities(worldId, cx, cz)` → `store.get(key)` → returns the stored `entities` array or `null`.
4. `listChunks(worldId)` → `store.getAll()` → filter by `worldId` → map to `BlockEntityChunkRecord`.
5. `deleteChunkEntities(worldId, cx, cz)` → `store.delete(key)`.

## Detailed behavior

- `ensureWorldStores(db)` checks `db.objectStoreNames.contains` for each known store and creates any
  that are missing with its keyPath. Idempotent; safe to call from any repository's upgrade path.
- `validateSerializedBlockEntity` checks: object; `schemaVersion` finite integer >= 1; `typeKey` a
  non-empty string; `x`/`y`/`z` finite integers; `data` is present (not `undefined`). On failure it
  throws `Error` with a descriptive message. It does NOT coerce types.
- `validateBlockEntityChunkRecord` checks: object; `worldId` non-empty string; `chunkX`/`chunkZ` finite
  integers; `entities` a non-null array; every element validates via `validateSerializedBlockEntity`.
- Double `open()` is idempotent (reuses the cached db).
- The composite key uses `|` separators; chunk coordinates are integers so the key is unambiguous.

## Failure modes

- Missing/invalid `IDBFactory` → `open()` rejects.
- Invalid record → `putChunkEntities` rejects before touching the store.
- `getChunkEntities` of an absent key → `null` (no throw).
- Request `onerror` → rejecting Promise with the error.

## Compatibility / migration

`WORLD_DB_VERSION` is the single migration pivot. Bumping to `3` makes a v2 DB fire `onupgradeneeded`
on next open; `ensureWorldStores` adds `block-entities` while leaving `world-metadata` and
`chunk-sections` intact. This is additive and reversible during development.

## Performance / resource constraints

Block entities are sparse; a chunk record holds only the entities within that chunk. `listChunks`
scans all stored chunk records and filters by `worldId`; bounded by chunks saved per world. No
per-frame work here.

## Testing seams

- `tests/unit/BlockEntityRepository.test.ts` injects the in-memory `IDBFactory` mock (reused from 034).
  Covers: store creation on open; put/get round-trip; absent-key null; list-by-world isolation; delete;
  validation rejection (bad entity / non-array entities); coexistence with the metadata and
  chunk-section stores (opening 034/035 repositories against the same mock name yields all three
  stores), and a v2→v3 migration that preserves both prior stores and their records.

## Observability / debugging

The repository is self-contained; `dbName`/`dbVersion` are overridable for tests.

## Affected files / symbols

- `src/storage/WorldMetadata.ts` — bump `WORLD_DB_VERSION`, add `WORLD_BLOCK_ENTITY_STORE`.
- `src/storage/WorldMetadataRepository.ts` — add the `block-entities` branch inside `ensureWorldStores`.
- `src/storage/BlockEntityRecord.ts` — NEW types + validators.
- `src/storage/BlockEntityRepository.ts` — NEW repository boundary.
- `tests/unit/BlockEntityRepository.test.ts` — NEW tests (reuses `tests/unit/IdbFactoryMock.ts`).

## Rejected alternatives

- *Persist one record per block entity keyed by world block coords*: too fine-grained; 038/039 save
  queues and unload/reload operate at chunk granularity, so grouping per chunk matches the streaming
  unit (035) and keeps writes bounded.
- *Couple storage to `BlockEntityTypeRegistry`*: couples storage to a registry that owns no instance
  data yet, and breaks injectable, dependency-free testability; the caller deserializes with its
  framework. The `typeKey` is stored as an opaque string.

## Downstream dependencies

037 adds an entity store to the same DB (further `WORLD_DB_VERSION` bump + `ensureWorldStores` branch);
038/039 add the incremental dirty-save queue over these repositories; 052 fills the `data` payload via
the block-entity framework.
