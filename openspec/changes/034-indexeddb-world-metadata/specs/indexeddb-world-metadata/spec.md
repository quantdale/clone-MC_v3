# Spec: indexeddb-world-metadata

## Contract

The game MUST persist world-level metadata in a named, versioned IndexedDB database through
a typed repository boundary. The repository MUST be constructable with an injected
`IDBFactory` (so it never depends on a browser global at construction) and MUST create its
object store on first open. All metadata records MUST be validated before persistence.

## Definitions

- **Database**: IndexedDB database named `WORLD_DB_NAME` (`voxel-world-db`) at version
  `WORLD_DB_VERSION` (`1`).
- **Object store**: `world-metadata`, keyPath `worldId`, one record per world.
- **WorldMetadata**: `{ schemaVersion, worldId, seed, dimensionId, minY, height, createdAt, updatedAt }`.

## Invariants

- `WORLD_DB_NAME = 'voxel-world-db'`, `WORLD_DB_VERSION = 1`, store keyPath `worldId`.
- `putMetadata` MUST validate the record; an invalid record MUST NOT be written.
- `getMetadata` of an absent `worldId` MUST return `null`, not throw.
- The repository MUST be constructable without a global `indexedDB`.

## Requirements

### Requirement: versioned database and metadata store
The repository MUST open `WORLD_DB_NAME` at `WORLD_DB_VERSION` and create the
`world-metadata` store (keyPath `worldId`) on first open.

#### Scenario: open creates the store
- **GIVEN** a repository backed by a fresh in-memory `IDBFactory`
- **WHEN** `open()` resolves
- **THEN** the `world-metadata` object store exists and subsequent reads/writes succeed.

### Requirement: typed metadata record
`WorldMetadata` MUST carry `schemaVersion` (positive int), `worldId` (non-empty string),
`seed` (finite number), `dimensionId` (non-empty string), `minY` (int), `height` (positive
int), `createdAt`/`updatedAt` (finite numbers).

#### Scenario: valid record is accepted
- **GIVEN** a record with all fields well-formed
- **WHEN** `validateWorldMetadata(record)` is called
- **THEN** it returns the same record (no throw).

### Requirement: validation rejects invalid metadata
`validateWorldMetadata` MUST throw (and `putMetadata` MUST reject) on missing fields, wrong
types, non-positive `schemaVersion`/`height`, empty `worldId`/`dimensionId`, or
non-finite numeric fields.

#### Scenario: missing/empty worldId rejected
- **GIVEN** a record with `worldId = ''`
- **WHEN** `validateWorldMetadata(record)` is called
- **THEN** it throws and `putMetadata` does not write a partial record.

#### Scenario: non-positive height rejected
- **GIVEN** a record with `height = 0`
- **WHEN** `validateWorldMetadata(record)` is called
- **THEN** it throws.

### Requirement: put/get/list/delete metadata
The repository MUST support round-trip put/get by `worldId`, list all metadata, and delete
by `worldId`.

#### Scenario: put then get returns the same record
- **GIVEN** a valid metadata record for `worldId = 'a'`
- **WHEN** `putMetadata` then `getMetadata('a')`
- **THEN** the returned record equals the stored one (`updatedAt` set by the repository).

#### Scenario: get absent key returns null
- **GIVEN** an open repository with no records
- **WHEN** `getMetadata('missing')` is called
- **THEN** it resolves to `null`.

#### Scenario: list returns all stored records
- **GIVEN** records for `worldId` `'a'` and `'b'`
- **WHEN** `listMetadata()` is called
- **THEN** it returns both records.

#### Scenario: delete removes the record
- **GIVEN** a stored record for `worldId = 'a'`
- **WHEN** `deleteMetadata('a')` then `getMetadata('a')`
- **THEN** `getMetadata('a')` resolves to `null`.

### Requirement: injectable factory, no global dependence
The repository MUST accept an `IDBFactory` and MUST NOT require a global `indexedDB` to be
constructed.

#### Scenario: constructable with a mock factory
- **GIVEN** an in-memory `IDBFactory` mock
- **WHEN** `new WorldMetadataRepository({ factory: mock })`
- **THEN** construction succeeds and `open()` works against the mock.

## Error and failure behavior

- `validateWorldMetadata` throws `Error` with a descriptive message on any invalid field.
- `putMetadata` rejects (does not write) when validation fails.
- `getMetadata` resolves `null` for absent keys; request `onerror` rejects the promise.
- `open()` rejects if the factory/open fails.

## Performance and resource bounds

Metadata is one small record per world; `getAll` scales with world count (tiny). The DB is
opened once and reused; `open()` is idempotent.

## Compatibility and migration

`WORLD_DB_VERSION` is the migration pivot; future bumps add `onupgradeneeded` steps. No
localStorage is read (migration is 040).

## Security and integrity

Validation prevents storing partial/malformed metadata that could corrupt future loads.

## Observability

`dbName`/`dbVersion` are overridable for tests; the repository is self-contained.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Versioned database and store | mock open creates store; put/get works |
| Typed metadata record | `validateWorldMetadata` accepts valid |
| Validation rejects invalid | empty worldId / non-positive height throw; put rejects |
| put/get/list/delete | round-trip, null-on-absent, list, delete |
| Injectable factory | construct + open with mock factory |
