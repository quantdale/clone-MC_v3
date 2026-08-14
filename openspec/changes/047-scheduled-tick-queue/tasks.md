# Tasks: 047-scheduled-tick-queue

> IMPLEMENTED. 046 was VERIFIED; 047 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (046 VERIFIED; baseline 611 unit / 19 e2e green).
- [x] 2. Add `src/simulation/ScheduledTickQueue.ts` (`ScheduledTick`, `SCHEDULED_TICK_QUEUE_VERSION`, `validateSerializedScheduledTickQueue`, `ScheduledTickQueue` with `schedule`/`scheduleIn`/`tick(nowTick)`/`has`/`cancel`/`clear`/`size`/`serialize`/`deserialize`; position dedupe, (tickTime, seq) ordering, validate-before-mutate).
- [x] 3. Add `tests/unit/ScheduledTickQueue.test.ts` (threshold pop, tie-break order, dedupe, scheduleIn, cancel/clear, round-trip, rejection).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
