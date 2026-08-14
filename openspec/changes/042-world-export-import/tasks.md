# Tasks: 042-world-export-import

> IMPLEMENTED. 041 was VERIFIED; 042 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (041 VERIFIED; baseline 580 unit / 19 e2e green).
- [x] 2. Add `src/storage/WorldArchive.ts` (`WorldArchive`, `BlockEntityChunkPayload`, `EntityChunkPayload`, `WORLD_ARCHIVE_FORMAT`/`WORLD_ARCHIVE_VERSION`, `validateWorldArchive`).
- [x] 3. Add `src/storage/WorldArchiver.ts` (`WorldArchiverDeps`, `WorldImportReport`, `WorldArchiver.exportWorld`/`importWorld` with worldId normalization).
- [x] 4. Add `tests/unit/WorldArchiver.test.ts` (export contains all records, import restores + report, export→import→export equality, validation atomicity, worldId normalization).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
