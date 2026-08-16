# Tasks: 202-inventory-screen-parity

## Implementation
- [x] `src/inventory/InventoryScreenParity.ts`: `DragButton` / `DragState` / `createDragState` /
      `dragStart` / `dragHover`.
- [x] `dragEnd` (inactive identity; left rounds; right even distribution; caps/mismatch; clears
      the drag).
- [x] `doubleClickGather` (same-item gather to 64, drain slots; mismatched/both-empty identity).
- [x] `hotbarSwap` (swap / move-to-empty / identity no-ops; hotbar-range and out-of-bounds
      descriptive throws).

## Tests
- [x] `tests/unit/InventoryScreenParity.test.ts`: drag lifecycle (start/hover unique/inactive
      identity).
- [x] Left drag: rounds plain (5 into 2 slots -> 3/2); cap respected; mismatched item keeps
      remainder.
- [x] Right drag: 10 into 3 -> 4/3/3; cap-limited first slot keeps remainder.
- [x] Inactive dragEnd identity (menu + drag).
- [x] Gather: empty cursor (50 into cursor, slots drained); capped cursor (64 max, remainder
      stays); mismatched cursor identity; both-empty identity.
- [x] Hotbar swap: swap; move to empty; both-empty identity; same-index identity; container-
      region hotbarIndex throws.

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2653/2653 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      203-container-screen-framework).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
