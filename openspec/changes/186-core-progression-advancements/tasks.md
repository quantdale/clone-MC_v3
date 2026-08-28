# Tasks: 186-core-progression-advancements

## Implementation
- [x] `src/simulation/CoreProgressionAdvancements.ts`: the 7-advancement chain (stone_age,
      acquire_hardware, iron_tools, diamonds, enter_the_nether, enter_the_end, free_the_end).
- [x] Criteria use only 185's typed union (obtain_item ×4, dimension_enter ×2, boss_defeat ×1).
- [x] Rewards: `free_the_end` experience 500; others none.
- [x] `coreProgressionAdvancements` (order) / `getCoreProgressionAdvancement` / first / final.

## Tests
- [x] `tests/unit/CoreProgressionAdvancements.test.ts`: chain order + arc (first item, last dragon,
      both dimension keys present).
- [x] Every criterion has a non-empty payload.
- [x] Lookup found/unknown.
- [x] Vanilla experience reward on free_the_end.
- [x] `enter_the_nether` completes via 185's framework with the tick recorded.
- [x] `free_the_end` completes via the dragon-defeat trigger.
- [x] Wrong-dimension trigger is an identity no-op.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2467/2467 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 187-statistics-framework).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
