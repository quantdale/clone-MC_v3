# Proposal: 035-indexeddb-chunk-section-store

## Problem

034 established a versioned IndexedDB database (`voxel-world-db`) with a single `world-metadata`
store. The persistent-world roadmap needs the actual voxel data persisted: per-chunk vertical
columns of section block-state data. Today a `ChunkColumn` (024) can `serialize()` to a
`SerializedChunkColumn` (per-section `SerializedPalettedContainer` data), but nothing persists or
reloads it across page sessions.

## Goals

- Add a `chunk-sections` object store to the same `voxel-world-db` database that 034 created.
- Bump `WORLD_DB_VERSION` (1 → 2) so existing 034 databases are migrated to add the new store.
- Provide a typed `ChunkSectionRepository` boundary to persist/reload/list/delete
  `SerializedChunkColumn` records, keyed per world + chunk coordinate.
- Keep the repository injectable-factory testable (reuse the in-memory mock) and dependency-free.

## Non-goals

- Deserializing into live `ChunkColumn` objects (caller owns the `BlockStateRegistry` and calls
  `ChunkColumn.deserialize`). The repository stores/returns plain `SerializedChunkColumn`.
- Autosave/transaction policies (038/039), block-entity/entity stores (036/037), or localStorage
  migration (040).
- Any change to `ChunkColumn`/`ChunkSection` serialization formats.

## Preconditions

- Change 034 (`indexeddb-world-metadata`) is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 034 baseline (499 unit / 19 e2e).
- `ChunkColumn.serialize()` / `ChunkColumn.deserialize()` (024) and `SerializedPalettedContainer`
  (022) exist and are stable.

## Dependencies

- 034 database constants (`WORLD_DB_NAME`, `WORLD_DB_VERSION`, `WORLD_METADATA_STORE`) and the
  injectable `IDBFactory` boundary.
- `ChunkColumn` serialization shapes from `src/world/ChunkColumn.ts`.

## Proposed change

- `src/storage/WorldMetadata.ts`: bump `WORLD_DB_VERSION` to `2`; add
  `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`.
- `src/storage/WorldMetadataRepository.ts`: add `ensureWorldStores(db)` that creates *all* known
  stores (`world-metadata`, `chunk-sections`) idempotently, and route `open()`'s
  `onupgradeneeded` through it (so a v1→v2 migration adds the new store).
- `src/storage/ChunkSectionRepository.ts` (NEW): injectable-factory repository over
  `WORLD_CHUNK_SECTION_STORE` (keyPath `key`), with `putColumn(worldId, serialized)`,
  `getColumn(worldId, chunkX, chunkZ)`, `deleteColumn(worldId, chunkX, chunkZ)`,
  `listColumns(worldId)`, and `close()`. `putColumn` validates the record before writing.
- `tests/unit/ChunkSectionRepository.test.ts` (NEW): reuse the in-memory `IDBFactory` mock.

## Compatibility and migration

The same database is shared with 034. Bumping `WORLD_DB_VERSION` to `2` makes the first open of an
existing v1 database fire `onupgradeneeded` (oldVersion 1), where `ensureWorldStores` adds the
`chunk-sections` store while preserving `world-metadata`. A brand-new database creates both stores.
No existing record is read or rewritten during the migration.

## Risks

- Node has no `indexedDB`; tests inject the mock factory, never the global.
- A malformed/v1-incompatible `SerializedChunkColumn` MUST be rejected by validation, not stored.
- The repository MUST remain decoupled from `BlockStateRegistry`; it stores opaque serialized data.

## Rollback strategy

Revert the commit. No persisted world data depends on the new store yet; the v1→v2 migration is
additive (adds a store), so reverting leaves a v2 DB that a reverted client would simply reopen at
v1... which is invalid in IndexedDB (`VersionError` opening lower than current). To avoid a broken
state, the commit is additive and the version bump is contained; rollback is only needed during
development before any real save.

## Definition of Done

- `WORLD_DB_VERSION = 2`; `WORLD_CHUNK_SECTION_STORE` defined; `ensureWorldStores` creates both stores.
- `ChunkSectionRepository` persists/reloads/list/delete `SerializedChunkColumn` by world+chunk key.
- Validation rejects malformed records and writes nothing.
- Unit tests cover store creation, round-trip, absent null, list-by-world, delete, validation, and
  coexistence with the metadata store.
- Full gate green; 035 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 035 suite; E2E stays 19/19.
