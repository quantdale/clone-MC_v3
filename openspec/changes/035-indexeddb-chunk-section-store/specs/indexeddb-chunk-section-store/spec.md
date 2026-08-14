# Spec: indexeddb-chunk-section-store

## Contract

The game MUST persist and reload chunk-column section block-state data in the same versioned
IndexedDB database used for world metadata (034), via a typed repository boundary. The repository
MUST be constructable with an injected `IDBFactory`, MUST open the database at the current
`WORLD_DB_VERSION`, and MUST add the `chunk-sections` object store on first open / on migration.
Persisted records MUST be validated before write. The repository stores plain `SerializedChunkColumn`
data and is decoupled from the block-state registry.

## Definitions

- **Database**: IndexedDB database `WORLD_DB_NAME` (`voxel-world-db`) at version `WORLD_DB_VERSION` (`2`).
- **Object store**: `chunk-sections`, keyPath `key`, where `key = ${worldId}|${chunkX}|${chunkZ}`.
- **ChunkColumnRecord**: a `SerializedChunkColumn` plus `key` and `worldId` surface fields.
- **SerializedChunkColumn**: `{ version, chunkX, chunkZ, sectionCount, minSectionY, sections }` from
  `ChunkColumn.serialize()` (024); `sections` maps in-column section index → `SerializedPalettedContainer` (022).

## Invariants

- `WORLD_DB_VERSION = 2`; `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`.
- `chunk-sections` keyPath is `'key'`; the composite key is unique per `(worldId, chunkX, chunkZ)`.
- `ensureWorldStores` creates both `world-metadata` and `chunk-sections` idempotently.
- `putColumn` MUST validate the record; an invalid record MUST NOT be written.
- `getColumn` of an absent key MUST return `null`, not throw.
- The repository MUST be constructable without a global `indexedDB`.

## Requirements

### Requirement: versioned database with chunk-sections store
The repository MUST open `WORLD_DB_NAME` at `WORLD_DB_VERSION` and create the `chunk-sections` store
(keyPath `key`) on first open, and a v1→v2 migration MUST add the store without disturbing `world-metadata`.

#### Scenario: open creates both stores
- **GIVEN** a repository backed by a fresh in-memory `IDBFactory`
- **WHEN** `open()` resolves
- **THEN** the `chunk-sections` object store exists and subsequent reads/writes succeed.

#### Scenario: migration adds the store to an existing v1 database
- **GIVEN** a repository whose `open()` runs the shared `ensureWorldStores` upgrade path
- **WHEN** the database is opened at version `2`
- **THEN** `chunk-sections` is created while `world-metadata` remains.

### Requirement: typed serialized record
`putColumn` MUST accept a `SerializedChunkColumn` and persist it under the composite key
`worldId|chunkX|chunkZ`.

#### Scenario: valid record is accepted
- **GIVEN** a `SerializedChunkColumn` with well-formed fields
- **WHEN** `validateSerializedChunkColumn(record)` is called
- **THEN** it returns the record (no throw).

### Requirement: validation rejects invalid columns
`validateSerializedChunkColumn` MUST throw (and `putColumn` MUST reject) on missing fields, wrong
types, `sectionCount < 1`, or a non-object `sections`.

#### Scenario: malformed columns rejected
- **GIVEN** a record with `sectionCount = 0` (or `sections` not an object)
- **WHEN** `validateSerializedChunkColumn(record)` is called
- **THEN** it throws and `putColumn` does not write a partial record.

### Requirement: put/get/list/delete columns
The repository MUST support round-trip put/get by `(worldId, chunkX, chunkZ)`, list all columns for a
world, and delete by `(worldId, chunkX, chunkZ)`.

#### Scenario: put then get returns the same serialized column
- **GIVEN** a valid `SerializedChunkColumn` for `worldId = 'a'`, `(cx,cz) = (1,2)`
- **WHEN** `putColumn` then `getColumn('a', 1, 2)`
- **THEN** the returned record's `chunkX`/`chunkZ`/`sections` equal the stored ones.

#### Scenario: get absent key returns null
- **GIVEN** an open repository with no records
- **WHEN** `getColumn('missing', 0, 0)` is called
- **THEN** it resolves to `null`.

#### Scenario: list returns only that world's columns
- **GIVEN** columns for `(worldId 'a', (1,1))` and `(worldId 'a', (2,3))`, and `(worldId 'b', (1,1))`
- **WHEN** `listColumns('a')` is called
- **THEN** it returns exactly two records, both with `worldId = 'a'`.

#### Scenario: delete removes the column
- **GIVEN** a stored column for `worldId = 'a'`, `(1,2)`
- **WHEN** `deleteColumn('a', 1, 2)` then `getColumn('a', 1, 2)`
- **THEN** `getColumn('a', 1, 2)` resolves to `null`.

### Requirement: injectable factory, no global dependence
The repository MUST accept an `IDBFactory` and MUST NOT require a global `indexedDB` to be constructed.

#### Scenario: constructable with a mock factory
- **GIVEN** an in-memory `IDBFactory` mock
- **WHEN** `new ChunkSectionRepository({ factory: mock })`
- **THEN** construction succeeds and `open()` works against the mock.

## Error and failure behavior

- `validateSerializedChunkColumn` throws `Error` with a descriptive message on any invalid field.
- `putColumn` rejects (does not write) when validation fails.
- `getColumn` resolves `null` for absent keys; request `onerror` rejects the promise.
- `open()` rejects if the factory/open fails.

## Performance and resource bounds

A column record is one `SerializedChunkColumn`. `listColumns` scans all stored columns and filters by
`worldId`; bounded by chunks saved per world. No per-frame work.

## Compatibility and migration

`WORLD_DB_VERSION` is the migration pivot; bumping to `2` adds `chunk-sections` via `ensureWorldStores`.
The repository only stores plain serialized data, so `ChunkColumn.deserialize` (and its block-state
registry) owns any payload-format evolution; this store is forward-compatible with future column
versions as long as `SerializedChunkColumn` shape is honored.

## Security and integrity

Validation prevents storing partial/malformed column data that could corrupt a future reload.

## Observability

`dbName`/`dbVersion` are overridable for tests; the repository is self-contained.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Versioned database with store | mock open creates chunk-sections; migration adds store alongside metadata |
| Typed serialized record | `validateSerializedChunkColumn` accepts valid |
| Validation rejects invalid | sectionCount<1 / non-object sections throw; put rejects |
| put/get/list/delete | round-trip, null-on-absent, list-by-world, delete |
| Injectable factory | construct + open with mock factory |
