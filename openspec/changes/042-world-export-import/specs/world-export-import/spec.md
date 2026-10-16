# Spec: world-export-import

## Contract

The game MUST be able to export a world's persisted records (metadata, player state, chunk columns,
block-entity chunks, entity chunks) into a validated `WorldArchive` and import a validated archive
back into the five stores. The archive format MUST be `voxel-world` version `1`. Export MUST be
read-only; import MUST validate the entire archive before any write and MUST normalize
`playerState.worldId` to the archive's `worldId`.

## Definitions

- **WorldArchive**: `{ format: 'voxel-world', version: 1, exportedAt, worldId, metadata | null,
  playerState | null, columns, blockEntityChunks, entityChunks }`.
- **BlockEntityChunkPayload / EntityChunkPayload**: `{ chunkX, chunkZ, entities }`.
- **Import**: restoring the archive's records into the repositories, overwriting the target world's
  prior records (documented restore semantics).

## Invariants

- `format === 'voxel-world'`, `version === 1`, `worldId` non-empty, `exportedAt` finite.
- `metadata`/`playerState` are `null` or validated records; the three arrays contain only validated
  records.
- `validateWorldArchive` throws before any repository write on any violation.
- `importWorld` writes `playerState` under the archive's `worldId`.
- `exportWorld` performs no writes.

## Requirements

### Requirement: export contains all records
`exportWorld(worldId)` MUST return an archive containing every record of that world in the five stores.

#### Scenario: populated world exports
- **GIVEN** a world with metadata, player state, 2 columns, 1 block-entity chunk, and 1 entity chunk
- **WHEN** `exportWorld(worldId)` runs
- **THEN** the archive's `metadata`/`playerState` match and `columns`/`blockEntityChunks`/`entityChunks`
  have the expected lengths.

### Requirement: import restores all records
`importWorld(archive)` MUST validate the archive and restore every record, reporting counts.

#### Scenario: import into fresh stores
- **GIVEN** a valid archive and fresh repositories
- **WHEN** `importWorld` runs
- **THEN** every record is readable from the repositories and the report counts match the archive.

### Requirement: round-trip stability
Exporting, importing, then exporting again MUST produce an archive equal to the first (ignoring
`exportedAt`).

#### Scenario: export→import→export
- **GIVEN** a populated world
- **WHEN** `exportWorld` → `importWorld` (fresh stores) → `exportWorld`
- **THEN** the two archives match apart from `exportedAt`.

### Requirement: validation rejects malformed archives
`validateWorldArchive` MUST reject a bad `format`/`version`/`worldId`, malformed record arrays, and
invalid records; `importWorld` MUST write nothing when validation fails.

#### Scenario: malformed archive rejected atomically
- **GIVEN** an archive with a bad column record (or `format: 'nope'`)
- **WHEN** `importWorld` runs
- **THEN** it throws and all five stores remain empty.

### Requirement: playerState worldId normalization
An imported `playerState` whose `worldId` differs from the archive's `worldId` MUST be stored under the
archive's `worldId`.

#### Scenario: mismatched playerState
- **GIVEN** an archive with `worldId: 'a'` and `playerState.worldId: 'other'`
- **WHEN** `importWorld` runs
- **THEN** `getPlayerState('a')` returns the record and `getPlayerState('other')` is null.

## Error and failure behavior

- Any validation failure throws a descriptive `Error`; nothing is written.
- Export/import repository failures propagate as the repositories' normal errors.

## Performance and resource bounds

Cost proportional to stored records; one-shot operations, no per-frame work.

## Compatibility and migration

No `WORLD_DB_VERSION` change. Archives are versioned (`version: 1`) for future format evolution.

## Security and integrity

Atomic validation-before-write prevents partial imports; per-record validation prevents corrupt data
from entering the stores.

## Observability

`WorldImportReport` (`worldId`, counts, `metadataImported`, `playerStateImported`) is the import audit
trail.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Export contains all records | populated world → archive lengths/fields match |
| Import restores all records | fresh stores → records readable, report matches |
| Round-trip stability | export→import→export equal apart from exportedAt |
| Validation rejects malformed archives | bad format/column/playerState → throw, stores empty |
| playerState worldId normalization | mismatched worldId stored under archive worldId |
