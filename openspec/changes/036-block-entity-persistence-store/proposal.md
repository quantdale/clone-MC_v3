# Proposal: 036-block-entity-persistence-store

## Problem

035 persisted chunk-column block-state data in the shared `voxel-world-db` (now at version `2`) via a
typed `ChunkSectionRepository`. Block entities (chests, furnaces, signs, etc.) are a separate
persistence concern: they are sparse, positional, and keyed per chunk, and their payloads will be
owned by a future block-entity framework (052). Today there is no place to persist them, and no
`SerializedBlockEntity` shape exists because the live block-entity lifecycle has not been built yet.

## Goals

- Add a `block-entities` object store to the same `voxel-world-db` database that 034/035 created.
- Bump `WORLD_DB_VERSION` (`2 → 3`) so existing v2 databases are migrated to add the new store.
- Define a decoupled `SerializedBlockEntity` persistence envelope (type key + world position + opaque
  `data` payload) and a `BlockEntityChunkRecord` grouping entities per chunk.
- Provide a typed `BlockEntityRepository` boundary to persist/reload/list/delete these records, keyed
  per world + chunk coordinate.
- Keep the repository injectable-factory testable (reuse the in-memory mock) and dependency-free.

## Non-goals

- Deserializing into live block-entity instances (caller owns the future block-entity framework). The
  repository stores/returns plain `SerializedBlockEntity`/`BlockEntityChunkRecord` data.
- Block-entity ticking, behavior, or registry-coupled validation beyond the opaque `typeKey` string.
- Autosave/transaction policies (038/039), entity stores (037), or localStorage migration (040).
- Any change to how block entities are generated or simulated.

## Preconditions

- Change 035 (`indexeddb-chunk-section-store`) is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 035 baseline (513 unit / 19 e2e).

## Dependencies

- 034/035 database constants (`WORLD_DB_NAME`, `WORLD_DB_VERSION`, `WORLD_METADATA_STORE`,
  `WORLD_CHUNK_SECTION_STORE`) and the injectable `IDBFactory` boundary plus the shared
  `ensureWorldStores` upgrade routine.
- `BlockEntityTypeRegistry` (018) exists for the *type key* namespace, but the repository stores the
  `typeKey` as an opaque string and does not require the registry at construction time.

## Proposed change

- `src/storage/WorldMetadata.ts`: bump `WORLD_DB_VERSION` to `3`; add
  `WORLD_BLOCK_ENTITY_STORE = 'block-entities'`.
- `src/storage/WorldMetadataRepository.ts`: add the `block-entities` store (keyPath `key`) inside the
  shared `ensureWorldStores(db)` routine so a v2→v3 migration adds it while preserving
  `world-metadata` and `chunk-sections`.
- `src/storage/BlockEntityRecord.ts` (NEW): `SerializedBlockEntity`
  (`schemaVersion`, `typeKey`, `x`, `y`, `z`, `data`) and `BlockEntityChunkRecord`
  (`key`, `worldId`, `chunkX`, `chunkZ`, `entities`), plus
  `validateSerializedBlockEntity` and `validateBlockEntityChunkRecord`.
- `src/storage/BlockEntityRepository.ts` (NEW): injectable-factory repository over
  `WORLD_BLOCK_ENTITY_STORE`, with `putChunkEntities(worldId, chunkX, chunkZ, entities)`,
  `getChunkEntities(worldId, chunkX, chunkZ)`, `deleteChunkEntities(worldId, chunkX, chunkZ)`,
  `listChunks(worldId)`, and `close()`. `putChunkEntities` validates the record before writing.
- `tests/unit/BlockEntityRepository.test.ts` (NEW): reuse the in-memory `IDBFactory` mock.

## Compatibility and migration

The same database is shared with 034/035. Bumping `WORLD_DB_VERSION` to `3` makes the first open of an
existing v2 database fire `onupgradeneeded` (oldVersion 2), where `ensureWorldStores` adds the
`block-entities` store while preserving `world-metadata` and `chunk-sections`. A brand-new database
creates all three stores. No existing record is read or rewritten during the migration.

## Risks

- Node has no `indexedDB`; tests inject the mock factory, never the global.
- A malformed `BlockEntityChunkRecord` or entity MUST be rejected by validation, not stored.
- The repository MUST remain decoupled from any live block-entity framework; it stores opaque data.

## Rollback strategy

Revert the commit. No persisted world data depends on the new store yet; the v2→v3 migration is
additive (adds a store), so reverting leaves a v3 DB that a reverted client would reopen at v2
(invalid in IndexedDB). The commit is additive and the version bump contained; rollback is only
needed during development before any real save.

## Definition of Done

- `WORLD_DB_VERSION = 3`; `WORLD_BLOCK_ENTITY_STORE` defined; `ensureWorldStores` creates all three stores.
- `BlockEntityRepository` persists/reloads/list/delete `BlockEntityChunkRecord` by world+chunk key.
- Validation rejects malformed records and writes nothing.
- Unit tests cover store creation, round-trip, absent null, list-by-world, delete, validation, and
  coexistence with the metadata/chunk-section stores.
- Full gate green; 036 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 036 suite; E2E stays 19/19.
