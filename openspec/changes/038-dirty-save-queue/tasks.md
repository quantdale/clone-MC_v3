# Tasks: 038-dirty-save-queue

> IMPLEMENTED. 037 was VERIFIED; 038 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (037 VERIFIED; baseline 545 unit / 19 e2e green).
- [x] 2. Add `src/storage/DirtySaveQueue.ts` (`SaveUnitKind`, `SaveUnit`, `SaveSink`, `DirtySaveQueue` with `markDirty`/`drain(limit)`/`size`/`has`/`keys`/`clear`; ordered, de-duplicated, bounded, failure-requeue).
- [x] 3. Add `src/storage/RepositorySaveSink.ts` (`RepositorySaveSink` mapping each `SaveUnitKind` to the matching 034-037 repository).
- [x] 4. Add `tests/unit/DirtySaveQueue.test.ts` (bounded ordered drain, dedupe, failure-retry, size/has/keys/clear, and repository-sink integration over in-memory mocks).
- [x] 5. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
