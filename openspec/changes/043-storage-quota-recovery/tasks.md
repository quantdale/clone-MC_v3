# Tasks: 043-storage-quota-recovery

> IMPLEMENTED. 042 was VERIFIED; 043 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (042 VERIFIED; baseline 585 unit / 19 e2e green).
- [x] 2. Add `src/storage/StorageHealth.ts` (`StorageStatus`, `StorageFailureKind`, `classifyStorageError`, `StorageProbe`, `StorageHealthMonitor` with `check`/`status`/`lastFailure`/`canWrite`/`onStatusChange`/`reset`, `WORLD_PROBE_WORLD_ID`, `createWorldStorageProbe`).
- [x] 3. Add `tests/unit/StorageHealth.test.ts` (classification matrix, ok→degraded→failed→recovery, write gate, listeners + reset, world probe success + classified failure).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
