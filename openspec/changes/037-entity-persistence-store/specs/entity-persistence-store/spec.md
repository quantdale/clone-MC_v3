# Spec: entity-persistence-store

## Contract

The game MUST persist and reload entity records in the same versioned IndexedDB database used for world
metadata and chunk/block-entity data (034/035/036), via a typed repository boundary. The repository
MUST be constructable with an injected `IDBFactory`, MUST open the database at the current
`WORLD_DB_VERSION`, and MUST add the `entities` object store on first open / on migration. Persisted
records MUST be validated before write. The repository stores plain `EntityChunkRecord` data and is
decoupled from any live entity framework.

## Definitions

- **Database**: IndexedDB database `WORLD_DB_NAME` (`voxel-world-db`) at version `WORLD_DB_VERSION` (`4`).
- **Object store**: `entities`, keyPath `key`, where `key = ${worldId}|${chunkX}|${chunkZ}`.
- **EntityChunkRecord**: a grouping of the entities within one chunk, with `key`, `worldId`,
  `chunkX`, `chunkZ`, and `entities: SerializedEntity[]`.
- **SerializedEntity**: `{ schemaVersion, typeKey, x, y, z, data }` — an opaque persistence envelope
  with `typeKey` (entity type registry key) and positional world coordinates, plus an opaque `data`
  payload owned by a future entity framework.

## Invariants

- `WORLD_DB_VERSION = 4`; `WORLD_ENTITY_STORE = 'entities'`.
- `entities` keyPath is `'key'`; the composite key is unique per `(worldId, chunkX, chunkZ)`.
- `ensureWorldStores` creates `world-metadata`, `chunk-sections`, `block-entities`, and `entities`
  idempotently.
- `putChunkEntities` MUST validate the record; an invalid record MUST NOT be written.
- `getChunkEntities` of an absent key MUST return `null`, not throw.
- The repository MUST be constructable without a global `indexedDB`.

## Requirements

### Requirement: versioned database with entities store
The repository MUST open `WORLD_DB_NAME` at `WORLD_DB_VERSION` and create the `entities` store
(keyPath `key`) on first open, and a v3→v4 migration MUST add the store without disturbing the three
prior stores.

#### Scenario: open creates all stores
- **GIVEN** a repository backed by a fresh in-memory `IDBFactory`
- **WHEN** `open()` resolves
- **THEN** the `entities` object store exists and subsequent reads/writes succeed.

#### Scenario: migration adds the store to an existing v3 database
- **GIVEN** a repository whose `open()` runs the shared `ensureWorldStores` upgrade path
- **WHEN** the database is opened at version `4`
- **THEN** `entities` is created while `world-metadata`, `chunk-sections`, and `block-entities` remain.

### Requirement: typed serialized chunk record
`putChunkEntities` MUST accept a `SerializedEntity[]` for a chunk and persist it under the composite key
`worldId|chunkX|chunkZ`.

#### Scenario: valid record is accepted
- **GIVEN** an `EntityChunkRecord` with well-formed fields and valid entities
- **WHEN** `validateEntityChunkRecord(record)` is called
- **THEN** it returns the record (no throw).

### Requirement: validation rejects invalid records
`validateSerializedEntity` / `validateEntityChunkRecord` MUST throw (and `putChunkEntities` MUST reject)
on: missing/non-integer `schemaVersion`, empty `typeKey`, non-integer coordinates, `undefined` `data`,
non-array `entities`, or a malformed entity element.

#### Scenario: malformed records rejected
- **GIVEN** a record with a non-array `entities` (or an entity missing `typeKey`)
- **WHEN** `validateEntityChunkRecord(record)` is called
- **THEN** it throws and `putChunkEntities` does not write a partial record.

### Requirement: put/get/list/delete chunk records
The repository MUST support round-trip `putChunkEntities`/`getChunkEntities` by `(worldId, chunkX,
chunkZ)`, list all chunk records for a world, and delete by `(worldId, chunkX, chunkZ)`.

#### Scenario: put then get returns the same entities
- **GIVEN** valid entities for `worldId = 'a'`, `(cx,cz) = (1,2)`
- **WHEN** `putChunkEntities` then `getChunkEntities('a', 1, 2)`
- **THEN** the returned array's `typeKey`/coordinate/data equal the stored ones.

#### Scenario: get absent key returns null
- **GIVEN** an open repository with no records
- **WHEN** `getChunkEntities('missing', 0, 0)` is called
- **THEN** it resolves to `null`.

#### Scenario: list returns only that world's chunk records
- **GIVEN** chunk records for `(worldId 'a', (1,1))` and `(worldId 'a', (2,3))`, and `(worldId 'b', (1,1))`
- **WHEN** `listChunks('a')` is called
- **THEN** it returns exactly two records, both with `worldId = 'a'`.

#### Scenario: delete removes the chunk record
- **GIVEN** a stored chunk record for `worldId = 'a'`, `(1,2)`
- **WHEN** `deleteChunkEntities('a', 1, 2)` then `getChunkEntities('a', 1, 2)`
- **THEN** `getChunkEntities('a', 1, 2)` resolves to `null`.

### Requirement: injectable factory, no global dependence
The repository MUST accept an `IDBFactory` and MUST NOT require a global `indexedDB` to be constructed.

#### Scenario: constructable with a mock factory
- **GIVEN** an in-memory `IDBFactory` mock
- **WHEN** `new EntityRepository({ factory: mock })`
- **THEN** construction succeeds and `open()` works against the mock.

## Error and failure behavior

- Validators throw `Error` with a descriptive message on any invalid field.
- `putChunkEntities` rejects (does not write) when validation fails.
- `getChunkEntities` resolves `null` for absent keys; request `onerror` rejects the promise.
- `open()` rejects if the factory/open fails.

## Performance and resource bounds

A chunk record holds only the entities within that chunk. `listChunks` scans all stored chunk records
and filters by `worldId`; bounded by chunks saved per world. No per-frame work.

## Compatibility and migration

`WORLD_DB_VERSION` is the migration pivot; bumping to `4` adds `entities` via `ensureWorldStores`. The
repository only stores plain serialized data, so a future entity framework owns any payload evolution;
this store is forward-compatible with future entity `schemaVersion`/`data` shapes as long as the
`SerializedEntity` envelope is honored.

## Security and integrity

Validation prevents storing partial/malformed entity data that could corrupt a future reload.

## Observability

`dbName`/`dbVersion` are overridable for tests; the repository is self-contained.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Versioned database with store | mock open creates entities; migration adds store alongside metadata + chunk-sections + block-entities |
| Typed serialized record | `validateEntityChunkRecord` accepts valid |
| Validation rejects invalid | bad entity / non-array / empty typeKey / undefined data throw; put rejects |
| put/get/list/delete | round-trip, null-on-absent, list-by-world, delete |
| Injectable factory | construct + open with mock factory |
