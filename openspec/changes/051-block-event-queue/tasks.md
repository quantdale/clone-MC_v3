# Tasks: 051-block-event-queue

> IMPLEMENTED. 050 was VERIFIED; 051 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (050 VERIFIED; baseline 638 unit / 19 e2e green).
- [x] 2. Add `src/simulation/BlockEventQueue.ts` (`BlockEvent`, `BlockEventHandler`, `BlockEventQueue` with `add` (per-(position,eventId) dedupe with newest-param-wins, cap with false return)/`drain(handler)` (FIFO, maxPerDrain)/`size`/`clear`).
- [x] 3. Add `tests/unit/BlockEventQueue.test.ts` (FIFO + budget, dedupe/param update, eventId coexistence, overflow drop, size/clear).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
