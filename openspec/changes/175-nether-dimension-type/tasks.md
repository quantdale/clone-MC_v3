# Tasks: 175-nether-dimension-type

## Implementation
- [x] `src/data/DimensionTypes.ts`: `OVERWORLD_DIMENSION_TYPE` (minecraft:overworld, -64/384,
      skylight, natural, no fixed time).
- [x] `NETHER_DIMENSION_TYPE` (minecraft:the_nether, 0/256, no skylight, ultrawarm, non-natural,
      fixedTime 18000).
- [x] `dimensionSaveNamespace(key)` (validates a legal full resource id; returns the key; throws
      `INVALID_ID` otherwise).

## Tests
- [x] `tests/unit/DimensionTypes.test.ts`: overworld bounds/rules (minY -64, 24 sections, skylight,
      natural, ultrawarm false, fixedTime null, containsY edges).
- [x] Nether bounds/rules (minY 0, 16 sections, no skylight, ultrawarm, non-natural,
      fixedTime 18000, containsY 0/255/256/-1).
- [x] Nether registers through the dimension manager under its key with a fresh queue.
- [x] `dimensionSaveNamespace` passes legal keys through unchanged.
- [x] `dimensionSaveNamespace` rejects empty, whitespace, empty-path, and un-namespaced keys with
      `INVALID_ID`.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2381/2381 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      176-nether-world-generation).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
