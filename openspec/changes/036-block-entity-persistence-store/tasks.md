# Tasks: 036-block-entity-persistence-store

> IMPLEMENTED. 035 was VERIFIED; 036 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (035 VERIFIED; baseline 513 unit / 19 e2e green).
- [x] 2. Bump `WORLD_DB_VERSION` to `3` in `src/storage/WorldMetadata.ts`; add `WORLD_BLOCK_ENTITY_STORE = 'block-entities'`.
- [x] 3. Add the `block-entities` branch to `ensureWorldStores(db)` in `src/storage/WorldMetadataRepository.ts` (creates all three stores idempotently).
- [x] 4. Add `src/storage/BlockEntityRecord.ts` (`SerializedBlockEntity`, `BlockEntityChunkRecord`, `validateSerializedBlockEntity`, `validateBlockEntityChunkRecord`).
- [x] 5. Add `src/storage/BlockEntityRepository.ts` (`putChunkEntities`/`getChunkEntities`/`listChunks`/`deleteChunkEntities`/`close`, injectable factory, keyPath `key`).
- [x] 6. Add `tests/unit/BlockEntityRepository.test.ts` (store creation, round-trip, list-by-world, delete, validation, absent null, coexistence + v2→v3 migration).
- [x] 7. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
