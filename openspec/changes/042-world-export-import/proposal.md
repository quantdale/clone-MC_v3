# Proposal: 042-world-export-import

## Problem

034-041 persist world data in five IndexedDB stores (`world-metadata`, `chunk-sections`,
`block-entities`, `entities`, `player-state`). There is no portable, validated representation of a
whole world — so a world cannot be backed up, transferred between browsers/devices, or restored into a
fresh database.

## Goals

- Define a validated `WorldArchive` format (`voxel-world` v1) containing a world's metadata, player
  state, chunk columns, block-entity chunks, and entity chunks.
- Provide `WorldArchiver.exportWorld(worldId)` that reads all five stores for one world and produces
  the archive.
- Provide `WorldArchiver.importWorld(archive)` that validates the archive and restores its records
  into the five stores (overwriting that world's prior records — import restores the archived state).
- Reuse the existing record validators so malformed archives are rejected before any write.

## Non-goals

- Download/upload UX, file formats other than the JSON archive, or compression.
- Cross-world merging (import targets the archive's `worldId`).
- Quota/private-mode recovery (043), save-schema migrations (041 already exists), or multiplayer
  transfer.

## Preconditions

- Change 041 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 041 baseline (580 unit / 19 e2e).

## Dependencies

- The five repositories (034-040) and their validators (`validateWorldMetadata`,
  `validateSerializedChunkColumn`, `validateSerializedBlockEntity`, `validateSerializedEntity`,
  `validatePlayerStateRecord`).

## Proposed change

- `src/storage/WorldArchive.ts` (NEW): `WorldArchive` type (`format: 'voxel-world'`, `version: 1`,
  `exportedAt`, `worldId`, `metadata`, `playerState`, `columns`, `blockEntityChunks`, `entityChunks`)
  + `validateWorldArchive` (rejects malformed archives before any write).
- `src/storage/WorldArchiver.ts` (NEW): `WorldArchiver` over an injectable five-repository deps object
  with `exportWorld(worldId)` and `importWorld(archive)` (returns a `WorldImportReport`).
- `tests/unit/WorldArchiver.test.ts` (NEW).

## Compatibility and migration

No `WORLD_DB_VERSION` change. Export is read-only; import validates first and only then writes,
overwriting the target world's records with the archived state.

## Risks

- A malformed archive must be rejected atomically (nothing written). `validateWorldArchive` runs
  fully before the first write.
- Import must normalize `playerState.worldId` to the archive's `worldId` so a mismatched record cannot
  leak into another world's key.
- Export reads can fail mid-way (storage error); the archive is simply not produced — no writes occur.

## Rollback strategy

Revert the commit; the archiver is additive and writes nothing on its own.

## Definition of Done

- `WorldArchive` v1 validates strictly (format/version/worldId/arrays + per-record validation).
- `exportWorld` produces an archive containing all five stores' records for the world.
- `importWorld` restores every record and reports counts; malformed archives are rejected with nothing
  written.
- Unit tests cover export round-trip, import round-trip, export→import→export equality, and validation
  rejection.
- Full gate green; 042 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 042 suite; E2E stays 19/19.
