# Tasks: 180-end-dimension-type

## Implementation
- [x] `src/data/DimensionTypes.ts`: `END_DIMENSION_TYPE` (minecraft:the_end, 0/256, no skylight,
      not ultrawarm, non-natural, fixedTime 6000); module doc updated.

## Tests
- [x] `tests/unit/EndDimensionType.test.ts`: all End fields pinned (bounds, 16 sections, skylight
      false, ultrawarm false, natural false, fixedTime 6000, containsY 0/255/256/-1).
- [x] Registers through the dimension manager under `minecraft:the_end` with a fresh queue.
- [x] `dimensionSaveNamespace('minecraft:the_end')` passes through.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2424/2424 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 181-end-world-generation).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
