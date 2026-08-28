# Tasks: 049-neighbor-update-queue

> IMPLEMENTED. 048 was VERIFIED; 049 implementation, tests, and baseline gate are complete.

- [x] 1. Confirm entry gate (048 VERIFIED; baseline 627 unit / 19 e2e green).
- [x] 2. Add `src/simulation/NeighborUpdateQueue.ts` (`NeighborUpdateHandler`, `NeighborUpdateQueue` with `enqueue` (dedupe, cap with false return)/`drain(handler)` (FIFO, maxPerDrain, iterative handler enqueues)/`size`/`has`/`clear`).
- [x] 3. Add `tests/unit/NeighborUpdateQueue.test.ts` (FIFO order, budget split, dedupe, cascade without recursion, overflow drop, state queries).
- [x] 4. Run typecheck, lint, new test, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
