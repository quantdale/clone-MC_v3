# Proposal: 040-legacy-localstorage-migration

## Problem

034-039 built the new persistent-world layer (`voxel-world-db` v4: world-metadata, chunk-sections,
block-entities, entities; dirty-save queue; autosave policy). The game still persists the old way:
`window.localStorage` keys `voxel-game-edits-v1:${seed}` (sparse edit overlay as `WorldEditSnapshot`)
and `voxel-game-state-v1:${seed}` (player/inventory/survival as `GameSaveSnapshot`). Nothing imports
those legacy saves into the new database, so existing players' edits and state would be orphaned once
the new persistence takes over.

## Goals

- Add a `player-state` object store to the same `voxel-world-db` database (bump `WORLD_DB_VERSION`
  `4 → 5`), so player/inventory/survival state has a typed target in the new layer.
- Provide `LegacyLocalStorageMigrator`: read the two legacy localStorage keys, validate them against
  the legacy shapes, convert the sparse edit overlay into `SerializedChunkColumn` records (legacy id
  `0` = air, so conversion is registry-free), convert the game snapshot into a `PlayerStateRecord`,
  and persist everything through the existing repositories.
- Non-destructive: legacy keys are read but never removed by the migrator.
- Deterministic and testable: storage is injected (`StorageLike`), repositories are the injectable
  mock-backed ones, and the conversion functions are pure.

## Non-goals

- Wring the migrator into the game startup (the game wiring is a later change; 040 is the migration
  primitive + its tests).
- Full-column terrain persistence of *generated* (un-edited) cells: legacy localStorage never contained
  generated terrain, only the edit overlay. Migrated columns contain the edited cells with air for
  untouched cells; the world runtime decides how to merge with regenerated terrain when it consumes
  the store.
- Quota/private-mode handling (043), export/import (042), schema migrations (041), or removing legacy
  keys after import.
- Changing the legacy format or the repository formats.

## Preconditions

- Change 039 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 039 baseline (559 unit / 19 e2e).
- Legacy shapes exist and are stable: `WorldEditSnapshot` (`version 1`, `seed`, `edits` of
  `{ chunk: [cx, cy, cz], changes: [[index, blockId]] }`) and `GameSaveSnapshot`
  (`version 1`, `seed`, `player.position/yaw/pitch`, `inventory`, `survival`).

## Dependencies

- 035 `ChunkSectionRepository` + `SerializedChunkColumn`/`SerializedPalettedContainer` shapes.
- 022 `PackedIntegerArray` + `MIN_PALETTE_BITS`/`PALETTED_CONTAINER_VERSION`.
- 034 `WorldMetadata` constants + `ensureWorldStores`.
- Legacy id `0` = air (`BlockId.Air`), enabling registry-free palette construction.

## Proposed change

- `src/storage/WorldMetadata.ts`: `WORLD_DB_VERSION` → `5`; add `WORLD_PLAYER_STATE_STORE = 'player-state'`.
- `src/storage/WorldMetadataRepository.ts`: add the `player-state` branch (keyPath `key`) to
  `ensureWorldStores`.
- `src/storage/PlayerStateRecord.ts` (NEW): `PlayerStateRecord`
  (`key`, `worldId`, `seed`, `position: [x, y, z]`, `yaw`, `pitch`, `inventory: unknown`, `survival: unknown`)
  + `validatePlayerStateRecord`.
- `src/storage/PlayerStateRepository.ts` (NEW): injectable-factory repository over `player-state`
  (`putPlayerState`/`getPlayerState`/`deletePlayerState`/`listPlayerStates`/`close`).
- `src/storage/LegacyLocalStorageMigrator.ts` (NEW): `StorageLike`, validated legacy snapshot types,
  pure converters (`editsToSerializedChunkColumn` incl. per-section paletted containers; `toPlayerStateRecord`),
  and `LegacyLocalStorageMigrator.migrate(seed)` returning a `LegacyMigrationReport`.
- `tests/unit/LegacyLocalStorageMigrator.test.ts` (NEW).

## Compatibility and migration

`WORLD_DB_VERSION` 4→5 adds `player-state` via `ensureWorldStores`, preserving the four prior stores
(the v4→v5 migration test proves it). The migrator only writes; it never deletes legacy keys or rewrites
prior stores.

## Risks

- Migrated chunk columns are air-filled outside edited cells; consumers must merge with regenerated
  terrain. Documented in the spec and report; the store contract itself is unchanged.
- Malformed legacy data must be rejected per-field, never partially written.
- `yaw`/`pitch` and `position` may be missing/malformed in a legacy snapshot; the validator must reject
  the record (no partial write).

## Rollback strategy

Revert the commit. The v4→v5 migration is additive (one store); no legacy data is modified. Reverting
during development is safe (no real save depends on it yet).

## Definition of Done

- `WORLD_DB_VERSION = 5`; `WORLD_PLAYER_STATE_STORE` defined; `ensureWorldStores` creates all five stores.
- `PlayerStateRepository` round-trips `PlayerStateRecord` by `worldId`.
- `LegacyLocalStorageMigrator.migrate(seed)` imports edits → chunk-sections and state → player-state,
  with a truthful report; malformed input is rejected without partial writes.
- Unit tests cover conversion (palette/bit-width/storage round-trip through `ChunkColumn.deserialize`),
  repository behavior, migrator end-to-end over in-memory storage + mocks, and v4→v5 migration.
- Full gate green; 040 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 040 suite; E2E stays 19/19.
