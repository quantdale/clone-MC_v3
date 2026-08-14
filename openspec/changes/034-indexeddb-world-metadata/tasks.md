# Tasks: 034-indexeddb-world-metadata

> VERIFIED. 033 was VERIFIED at 75be0cc (baseline 485 unit / 19 e2e green).

- [x] 1. Confirm entry gate (033 VERIFIED; baseline 485 unit / 19 e2e green).
- [x] 2. Add `src/storage/WorldMetadata.ts` (constants `WORLD_DB_NAME`/`WORLD_DB_VERSION`/`WORLD_METADATA_STORE`, `WorldMetadata` type, `validateWorldMetadata`).
- [x] 3. Add `src/storage/WorldMetadataRepository.ts` (injectable `IDBFactory`, `open` with store creation, `putMetadata`/`getMetadata`/`listMetadata`/`deleteMetadata`, `close`).
- [x] 4. Add in-memory `IDBFactory` mock + `tests/unit/WorldMetadataRepository.test.ts` (store creation, round-trip, list, delete, validation, absent null, idempotent open).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
