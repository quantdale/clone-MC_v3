# Tasks: 160-comparator

## Implementation
- [x] `src/world/BlockRegistry.ts`: `COMPARATOR_SCHEMA` (facing 4-way, mode compare/subtract,
      powered); `BlockId.RedstoneComparator = 43` with its definition and default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.RedstoneComparator = 43` with `placeBlock`.
- [x] `src/simulation/RedstoneComparator.ts`: `ComparatorMode`, `ComparatorFacing` types;
      `COMPARATOR_UPDATE_DELAY_TICKS`.
- [x] `cycleComparatorMode`; `resolveComparatorOutput` (compare + subtract, clamped inputs);
      `comparatorIsPowered`.
- [x] `scheduleComparatorUpdate` / `dueComparatorUpdates` (047 bridge).
- [x] `comparatorStateProperties`.

## Tests
- [x] `tests/unit/RedstoneComparator.test.ts`: block carries schema + default.
- [x] Item places the block; cross-reference passes.
- [x] Block enumerates exactly 16 states including the default.
- [x] `cycleComparatorMode` toggles both ways.
- [x] Compare mode: front above side passes through.
- [x] Compare mode: front exactly equal to side passes through (boundary).
- [x] Compare mode: front below side yields zero.
- [x] Subtract mode: positive difference passes through.
- [x] Subtract mode: negative difference floors at zero.
- [x] Out-of-range front input is clamped.
- [x] Non-finite input is clamped to the minimum.
- [x] `comparatorIsPowered` zero/positive cases.
- [x] Scheduling not-due-before-tick case.
- [x] Scheduling fires-at-tick case.
- [x] Same-tick updates deterministically ordered (repeatable).
- [x] `comparatorStateProperties` projection matches the schema.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2157/2157 baseline) — 183 files / 2176 tests green.
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 161-observer).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
