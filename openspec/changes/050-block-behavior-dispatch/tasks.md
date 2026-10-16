# Tasks: 050-block-behavior-dispatch

> IMPLEMENTED. 049 was VERIFIED; 050 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (049 VERIFIED; baseline 633 unit / 19 e2e green).
- [x] 2. Add `src/simulation/BlockBehavior.ts` (`BlockWorldAccess`, `BlockBehaviorContext`, `BlockBehavior` optional hooks, `DEFAULT_BLOCK_BEHAVIOR` frozen, `BlockBehaviorRegistry` with `register`/`getBehavior`/`hasBehavior`/`size`/`clear`; validation + duplicate rejection).
- [x] 3. Add `tests/unit/BlockBehavior.test.ts` (default dispatch, per-key isolation, validation, hook invocation with mock world, clear).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
