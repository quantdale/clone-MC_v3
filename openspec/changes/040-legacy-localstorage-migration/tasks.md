# Tasks: 040-legacy-localstorage-migration

> IMPLEMENTED. 039 was VERIFIED; 040 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (039 VERIFIED; baseline 559 unit / 19 e2e green).
- [x] 2. Bump `WORLD_DB_VERSION` to `5` in `src/storage/WorldMetadata.ts`; add `WORLD_PLAYER_STATE_STORE = 'player-state'`; add the branch to `ensureWorldStores`.
- [x] 3. Add `src/storage/PlayerStateRecord.ts` (`PlayerStateRecord` + `validatePlayerStateRecord`).
- [x] 4. Add `src/storage/PlayerStateRepository.ts` (`putPlayerState`/`getPlayerState`/`deletePlayerState`/`listPlayerStates`/`close`, injectable factory, keyPath `key`).
- [x] 5. Add `src/storage/LegacyLocalStorageMigrator.ts` (`StorageLike`, legacy snapshot types, `buildSectionContainer`/`editsToSerializedChunkColumn`/`toPlayerStateRecord` converters, `LegacyLocalStorageMigrator.migrate(seed)` + report).
- [x] 6. Add `tests/unit/LegacyLocalStorageMigrator.test.ts` (converters + round-trip through `ChunkColumn.deserialize`, player-state repository, end-to-end migrate, malformed-input errors, v4→v5 migration).
- [x] 7. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
