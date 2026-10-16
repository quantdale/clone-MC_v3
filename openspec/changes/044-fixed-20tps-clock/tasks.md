# Tasks: 044-fixed-20tps-clock

> IMPLEMENTED. 043 was VERIFIED; 044 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (043 VERIFIED; baseline 592 unit / 19 e2e green).
- [x] 2. Add `src/engine/SimulationClock.ts` (`TICK_RATE = 20`, `TICK_MS = 50`, `SimulationClock` with `update(nowMs)`/`totalTicks`/`totalMs`/`accumulatorMs`/`isRunning`/`reset`; bounded catch-up, backward-time clamp, anchoring).
- [x] 3. Add `tests/unit/SimulationClock.test.ts` (exact emission, frame-rate independence, bounded catch-up, backward time, anchoring/reset).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
