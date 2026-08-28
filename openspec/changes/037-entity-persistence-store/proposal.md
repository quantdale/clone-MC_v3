# Proposal: 037-entity-persistence-store

## Problem

036 persisted block-entity records in the shared `voxel-world-db` (now at version `3`) via a typed
`BlockEntityRepository`. Entities (mobs, item drops, etc.) are a separate persistence concern: they
are also sparse and positional, but a live entity instance and its serialization do not yet exist
(017 only defines the `EntityTypeRegistry`). Today there is no place to persist them, and no
`SerializedEntity` shape exists.

## Goals

- Add an `entities` object store to the same `voxel-world-db` database that 034/035/036 created.
- Bump `WORLD_DB_VERSION` (`3 → 4`) so existing v3 databases are migrated to add the new store.
- Define a decoupled `SerializedEntity` persistence envelope (type key + world position + opaque `data`
  payload) and an `EntityChunkRecord` grouping entities per chunk.
- Provide a typed `EntityRepository` boundary to persist/reload/list/delete these records, keyed per
  world + chunk coordinate.
- Keep the repository injectable-factory testable (reuse the in-memory mock) and dependency-free.

## Non-goals

- Deserializing into live entity instances (caller owns the future entity framework 129+). The
  repository stores/returns plain `SerializedEntity`/`EntityChunkRecord` data.
- Entity ticking, AI, behavior, or registry-coupled validation beyond the opaque `typeKey` string.
- Autosave/transaction policies (038/039), or localStorage migration (040).
- Any change to how entities are spawned or simulated.

## Preconditions

- Change 036 (`block-entity-persistence-store`) is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 036 baseline (529 unit / 19 e2e).

## Dependencies

- 034/035/036 database constants and the injectable `IDBFactory` boundary plus the shared
  `ensureWorldStores` upgrade routine.
- `EntityTypeRegistry` (017) exists for the *type key* namespace, but the repository stores the
  `typeKey` as an opaque string and does not require the registry at construction time.

## Proposed change

- `src/storage/WorldMetadata.ts`: bump `WORLD_DB_VERSION` to `4`; add `WORLD_ENTITY_STORE = 'entities'`.
- `src/storage/WorldMetadataRepository.ts`: add the `entities` store (keyPath `key`) inside the shared
  `ensureWorldStores(db)` routine so a v3→v4 migration adds it while preserving the three prior stores.
- `src/storage/EntityRecord.ts` (NEW): `SerializedEntity` (`schemaVersion`, `typeKey`, `x`, `y`, `z`,
  `data`) and `EntityChunkRecord` (`key`, `worldId`, `chunkX`, `chunkZ`, `entities`), plus
  `validateSerializedEntity` and `validateEntityChunkRecord`.
- `src/storage/EntityRepository.ts` (NEW): injectable-factory repository over `WORLD_ENTITY_STORE`, with
  `putChunkEntities(worldId, chunkX, chunkZ, entities)`, `getChunkEntities(worldId, chunkX, chunkZ)`,
  `deleteChunkEntities(worldId, chunkX, chunkZ)`, `listChunks(worldId)`, and `close()`. `putChunkEntities`
  validates the record before writing.
- `tests/unit/EntityRepository.test.ts` (NEW): reuse the in-memory `IDBFactory` mock.

## Compatibility and migration

The same database is shared with 034/035/036. Bumping `WORLD_DB_VERSION` to `4` makes the first open of
an existing v3 database fire `onupgradeneeded` (oldVersion 3), where `ensureWorldStores` adds the
`entities` store while preserving `world-metadata`, `chunk-sections`, and `block-entities`. A brand-new
database creates all four stores. No existing record is read or rewritten during the migration.

## Risks

- Node has no `indexedDB`; tests inject the mock factory, never the global.
- A malformed `EntityChunkRecord` or entity MUST be rejected by validation, not stored.
- The repository MUST remain decoupled from any live entity framework; it stores opaque data.

## Rollback strategy

Revert the commit. No persisted world data depends on the new store yet; the v3→v4 migration is
additive (adds a store), so reverting leaves a v4 DB that a reverted client would reopen at v3
(invalid in IndexedDB). The commit is additive and the version bump contained; rollback is only
needed during development before any real save.

## Definition of Done

- `WORLD_DB_VERSION = 4`; `WORLD_ENTITY_STORE` defined; `ensureWorldStores` creates all four stores.
- `EntityRepository` persists/reloads/list/delete `EntityChunkRecord` by world+chunk key.
- Validation rejects malformed records and writes nothing.
- Unit tests cover store creation, round-trip, absent null, list-by-world, delete, validation, and
  coexistence with the prior stores.
- Full gate green; 037 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 037 suite; E2E stays 19/19.
