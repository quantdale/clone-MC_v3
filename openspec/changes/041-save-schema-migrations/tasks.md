# Tasks: 041-save-schema-migrations

> IMPLEMENTED. 040 was VERIFIED; 041 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (040 VERIFIED; baseline 570 unit / 19 e2e green).
- [x] 2. Add `src/storage/DataMigration.ts` (`DataMigration<T>`, `DataMigrationError` kinds, `DataMigrationChain<T>` with `register`/`migrate`/`needsMigration`/`currentVersion`/`steps`; contiguous ordered application, GAP/DUPLICATE/DOWNGRADE/UNKNOWN_VERSION rejection, purity).
- [x] 3. Add typed chains `WORLD_METADATA_MIGRATIONS` / `CHUNK_COLUMN_MIGRATIONS` (base version 1) + `migrateWorldMetadata` / `migrateChunkColumn` helpers.
- [x] 4. Add `tests/unit/DataMigration.test.ts` (ordered application + appliedSteps, identity, registration errors, downgrade/unknown rejection, purity, typed-chain identity).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
