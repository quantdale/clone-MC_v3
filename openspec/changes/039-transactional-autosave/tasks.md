# Tasks: 039-transactional-autosave

> IMPLEMENTED. 038 was VERIFIED; 039 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (038 VERIFIED; baseline 552 unit / 19 e2e green).
- [x] 2. Add `src/storage/AutosaveCoordinator.ts` (`AutosaveCoordinator` with injectable `timer`/`flushTarget`; `markDirty`/`start`/`stop`/`tick`/`flush`/`size`; bounded periodic drain, idle no-op, pagehide/hidden flush with zero-progress guard, wake-on-dirty re-arm).
- [x] 3. Add `tests/unit/AutosaveCoordinator.test.ts` (fake timers + fake event target: bounded periodic drain, idle no-op, failure retry, pagehide flush, zero-progress guard, lifecycle).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
