# Tasks: 165-slime-honey-move-groups

## Implementation
- [x] `src/world/BlockRegistry.ts`: `BlockId.StickyPiston = 49` reusing `PISTON_SCHEMA` and
      `piston`'s default state.
- [x] `src/inventory/ItemRegistry.ts`: `ItemId.StickyPiston = 49` with `placeBlock`.
- [x] `src/simulation/PistonStickyGroups.ts`: `StickyKind`, `StickyWorld`.
- [x] `wouldDrag`.
- [x] `StickyGroupResult`; `expandStickyGroup` (bounded BFS via `classifyPistonBlock`,
      immovable/exceeded-limit failure).
- [x] `orderGroupForMove` (projection-based sort).
- [x] `extendPushPlanWithStickyGroup` (no-op passthrough when blocked/non-sticky; expanded +
      reordered otherwise).
- [x] `planStickyRetract` (single-seed pull, terminator no-op success, immovable failure).

## Tests
- [x] `tests/unit/PistonStickyGroups.test.ts`: `sticky_piston` shares `piston`'s schema instance
      and default; item places it; cross-reference passes; enumerates exactly 12 states.
- [x] `wouldDrag`: non-sticky neighbor always drags.
- [x] `wouldDrag`: same sticky kind drags.
- [x] `wouldDrag`: different sticky kinds do not drag.
- [x] `expandStickyGroup`: a same-kind chain grows the group.
- [x] `expandStickyGroup`: a non-sticky passenger does not further expand.
- [x] `expandStickyGroup`: a different sticky kind stops expansion at that neighbor.
- [x] `expandStickyGroup`: an immovable neighbor fails the whole group.
- [x] `expandStickyGroup`: exceeding `maxGroupSize` fails the whole group.
- [x] `orderGroupForMove` + `executePistonPush`: an L-shaped group ends in the correct final world
      state (no block lost or overwritten).
- [x] `extendPushPlanWithStickyGroup`: a plan with no sticky blocks is returned unchanged.
- [x] `extendPushPlanWithStickyGroup`: a plan containing a sticky block grows to include its
      attachment, correctly ordered, `blocksToDestroy` unchanged.
- [x] `planStickyRetract`: nothing in front is a genuine no-op success.
- [x] `planStickyRetract`: a single movable block is pulled back.
- [x] `planStickyRetract`: a sticky block in front cascades the pull.
- [x] `planStickyRetract`: an immovable block in front blocks the retract.
- [x] Characterization updates for the new block/item.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2231/2231 baseline) — 188 files / 2249 tests green.
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to 166-hopper-transfer).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
