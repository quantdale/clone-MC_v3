# Tasks: 037-entity-persistence-store

> PLANNED. Started only after 036 was VERIFIED.

- [ ] 1. Confirm entry gate (036 VERIFIED; baseline 529 unit / 19 e2e green).
- [ ] 2. Bump `WORLD_DB_VERSION` to `4` in `src/storage/WorldMetadata.ts`; add `WORLD_ENTITY_STORE = 'entities'`.
- [ ] 3. Add the `entities` branch to `ensureWorldStores(db)` in `src/storage/WorldMetadataRepository.ts` (creates all four stores idempotently).
- [ ] 4. Add `src/storage/EntityRecord.ts` (`SerializedEntity`, `EntityChunkRecord`, `validateSerializedEntity`, `validateEntityChunkRecord`).
- [ ] 5. Add `src/storage/EntityRepository.ts` (`putChunkEntities`/`getChunkEntities`/`listChunks`/`deleteChunkEntities`/`close`, injectable factory, keyPath `key`).
- [ ] 6. Add `tests/unit/EntityRepository.test.ts` (store creation, round-trip, list-by-world, delete, validation, absent null, coexistence + v3→v4 migration).
- [ ] 7. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
