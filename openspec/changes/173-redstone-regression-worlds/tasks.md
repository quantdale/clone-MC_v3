# Tasks: 173-redstone-regression-worlds

## Implementation
- [x] `tests/unit/RedstoneRegressionWorlds.test.ts` (NEW): F1 repeater delay chain (159) with
      tick-2/tick-4 timeline.
- [x] F2 comparator modes + 2-tick update delay (160).
- [x] F3 torch inversion, 15-signal, and burnout (>8 toggles burns out, 8 does not) (158).
- [x] F4 piston push chain: farthest-first plan + atomic execute (163/164).
- [x] F5 hopper→dropper item pipeline: tick-8 transfer, tick-16 drop (166/167).
- [x] F6 dispenser plain-item parity with dropper (168).
- [x] F7 TNT detonation timeline: not due at fuse 1, due at fuse 0, stone destroyed + drop (169/170).
- [x] F8 rail traversal + minecart timing: straight constraint, corner turn (171/172).

## Tests
- [x] F1 asserts nothing due at tick 1, `(1,0,0)` at tick 2, `(2,0,0)` at tick 4.
- [x] F2 asserts all four compare/subtract outputs and the exact 2-tick delay.
- [x] F3 asserts inversion, signal strengths, and the strict-exceeds burnout rule.
- [x] F4 asserts `blocksToMove` order and the exact post-execute store.
- [x] F5 asserts the exact transferred/dropped item counts and positions.
- [x] F6 asserts the container merge result.
- [x] F7 asserts fuse not-due/due and the destroyed/drop entries.
- [x] F8 asserts the axis constraint, max-speed, and corner turn.
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2360/2360 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated — **Redstone and automation (154-173) section
      CLOSED**; next change pointer to 174-dimension-manager.
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
