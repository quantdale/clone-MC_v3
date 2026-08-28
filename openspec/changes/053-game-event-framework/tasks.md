# Tasks: 053-game-event-framework

> IMPLEMENTED. 052 was VERIFIED; 053 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (052 VERIFIED; baseline 651 unit / 19 e2e green).
- [x] 2. Add `src/simulation/GameEventBus.ts` (`GameEvent`, `GameEventListener`, `GameEventBus` with `emit` (typed-then-wildcard, subscription order, defensive isolation, nested-queue)/`on`/`once`/`clear`).
- [x] 3. Add `tests/unit/GameEventBus.test.ts` (typed + wildcard delivery, order, unsubscribe, once, isolation, nested emits, clear).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
