# Design: 035-indexeddb-chunk-section-store

## Context / current state

034 created `voxel-world-db` (version `1`) with one store `world-metadata` (keyPath `worldId`)
behind `WorldMetadataRepository` (injectable `IDBFactory`, mock-testable). `ChunkColumn` (024) can
already `serialize()` to a `SerializedChunkColumn` of per-section `SerializedPalettedContainer`
data (022). Nothing persists that data.

## Target state

The same database, now at version `2`, contains two stores: `world-metadata` (034) and a new
`chunk-sections` store keyed by a composite `worldId|chunkX|chunkZ` key. A new
`ChunkSectionRepository` persists and reloads `SerializedChunkColumn` records. Both repositories
open the DB at `WORLD_DB_VERSION` and run a shared `ensureWorldStores` on `onupgradeneeded` so a
single open creates/migrates all stores.

## Invariants

- `WORLD_DB_NAME = 'voxel-world-db'`, `WORLD_DB_VERSION = 2`, `WORLD_METADATA_STORE = 'world-metadata'`,
  `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`.
- `chunk-sections` store keyPath is `'key'`; composite key `worldId|chunkX|chunkZ` is unique per world.
- Every persisted record MUST pass `validateSerializedChunkColumn` before `putColumn`; rejection
  MUST NOT write a partial record.
- `getColumn(worldId, chunkX, chunkZ)` returns `null` when absent (never throws for a missing key).
- The repository MUST be constructable without a global `indexedDB` (factory injected).
- The repository is decoupled from `BlockStateRegistry`; it stores/returns plain `SerializedChunkColumn`.

## API and data model

```ts
// src/storage/WorldMetadata.ts (changed)
export const WORLD_DB_VERSION = 2;                    // was 1
export const WORLD_CHUNK_SECTION_STORE = 'chunk-sections'; // NEW

// src/storage/WorldMetadataRepository.ts (changed)
export function ensureWorldStores(db: IdbDatabaseLike): void; // creates all known stores idempotently

// src/storage/ChunkSectionRepository.ts (NEW)
export interface ChunkColumnRecord extends SerializedChunkColumn {
  key: string;     // `${worldId}|${chunkX}|${chunkZ}`
  worldId: string;
}
export class ChunkSectionRepository {
  constructor(opts: { factory?: IdbFactoryLike; dbName?: string; dbVersion?: number });
  open(): Promise<void>;
  putColumn(worldId: string, column: SerializedChunkColumn): Promise<void>;
  getColumn(worldId: string, chunkX: number, chunkZ: number): Promise<SerializedChunkColumn | null>;
  deleteColumn(worldId: string, chunkX: number, chunkZ: number): Promise<void>;
  listColumns(worldId: string): Promise<SerializedChunkColumn[]>;
  close(): void;
}
export function validateSerializedChunkColumn(input: unknown): SerializedChunkColumn;
```

## Control / data flow

1. `open()` calls `factory.open(dbName, dbVersion)`; on `onupgradeneeded` it calls
   `ensureWorldStores(req.result)`. On `onsuccess` it caches the `IDBDatabase`.
2. `putColumn(worldId, column)` → `validateSerializedChunkColumn(column)` → build
   `record = { key: `${worldId}|${chunkX}|${chunkZ}`, worldId, ...column }` → `store.put(record)`.
3. `getColumn(worldId, cx, cz)` → `store.get(key)` → returns the stored record (minus key/worldId,
   structurally a `SerializedChunkColumn`) or `null`.
4. `listColumns(worldId)` → `store.getAll()` → filter by `worldId` → map to `SerializedChunkColumn`.
5. `deleteColumn(worldId, cx, cz)` → `store.delete(key)`.

## Detailed behavior

- `ensureWorldStores(db)` checks `db.objectStoreNames.contains` for each known store and creates any
  that are missing with its keyPath. Idempotent; safe to call from either repository's upgrade path.
- `validateSerializedChunkColumn` checks: object; `version` finite integer; `chunkX`/`chunkZ`/
  `sectionCount`/`minSectionY` finite integers with `sectionCount >= 1`; `sections` a non-null object.
  On failure it throws `Error` with a descriptive message. It does NOT coerce types. (Section payloads
  are validated lazily by `ChunkColumn.deserialize`/`PalettedContainer.deserialize` on reload.)
- Double `open()` is idempotent (reuses the cached db).
- The composite key uses `|` separators; chunk coordinates are integers so the key is unambiguous.

## Failure modes

- Missing/invalid `IDBFactory` → `open()` rejects.
- Invalid column → `putColumn` rejects before touching the store.
- `getColumn` of an absent key → `null` (no throw).
- Request `onerror` → rejecting Promise with the DOMException/error.

## Compatibility / migration

`WORLD_DB_VERSION` is the single migration pivot. Bumping to `2` makes a v1 DB fire `onupgradeneeded`
on next open; `ensureWorldStores` adds `chunk-sections` while leaving `world-metadata` intact. This is
additive and reversible during development.

## Performance / resource constraints

Chunks are bounded by `renderDistance`; a column record is one `SerializedChunkColumn` (a handful of
section palettes/storages). `getAll` in `listColumns` is bounded by the chunks saved per world; the
incremental dirty-save queue (038) will bound writes later. No per-frame work here.

## Testing seams

- `tests/unit/ChunkSectionRepository.test.ts` injects the in-memory `IDBFactory` mock (reused from 034).
  Covers: store creation on open; put/get round-trip; absent-key null; list-by-world isolation; delete;
  validation rejection; coexistence with the metadata store (opening a `WorldMetadataRepository` against
  the same mock name yields both stores).

## Observability / debugging

The repository is self-contained; `dbName`/`dbVersion` are overridable for tests.

## Affected files / symbols

- `src/storage/WorldMetadata.ts` — bump `WORLD_DB_VERSION`, add `WORLD_CHUNK_SECTION_STORE`.
- `src/storage/WorldMetadataRepository.ts` — add + export `ensureWorldStores`; route `open()` through it.
- `src/storage/ChunkSectionRepository.ts` — NEW repository boundary + `validateSerializedChunkColumn`.
- `tests/unit/ChunkSectionRepository.test.ts` — NEW tests (reuses `tests/unit/IdbFactoryMock.ts`).

## Rejected alternatives

- *Bump version only inside ChunkSectionRepository and let it alone own the upgrade*: the shared DB
  needs a single authoritative upgrade routine; scattering store creation across two repos risks a
  half-created schema. A shared `ensureWorldStores` is the minimal correct fix.
- *Store whole worlds as one record*: too coarse; 038/039 need per-chunk granularity for dirty saves.
  Per-chunk-column records match the 024/033 streaming unit.
- *Persist live `ChunkColumn` (registry-coupled)*: couples storage to `BlockStateRegistry` and breaks
  the injectable, dependency-free testability; the caller deserializes with its registry.

## Downstream dependencies

036/037 add block-entity/entity stores to the same DB (further `WORLD_DB_VERSION` bumps +
`ensureWorldStores` branches); 038/039 add the incremental dirty-save queue over these repositories.
