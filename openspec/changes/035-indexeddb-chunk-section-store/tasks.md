# Tasks: 035-indexeddb-chunk-section-store

> IMPLEMENTED. 034 was VERIFIED; 035 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (034 VERIFIED; baseline 499 unit / 19 e2e green).
- [x] 2. Bump `WORLD_DB_VERSION` to `2` in `src/storage/WorldMetadata.ts`; add `WORLD_CHUNK_SECTION_STORE = 'chunk-sections'`.
- [x] 3. Add `ensureWorldStores(db)` to `src/storage/WorldMetadataRepository.ts` (creates `world-metadata` + `chunk-sections` idempotently) and route `open()`'s `onupgradeneeded` through it.
- [x] 4. Add `src/storage/ChunkSectionRepository.ts` (`validateSerializedChunkColumn`, `putColumn`/`getColumn`/`listColumns`/`deleteColumn`/`close`, injectable factory, keyPath `key`).
- [x] 5. Add `tests/unit/ChunkSectionRepository.test.ts` (store creation, round-trip, list-by-world, delete, validation, absent null, coexistence with metadata store).
- [x] 6. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
