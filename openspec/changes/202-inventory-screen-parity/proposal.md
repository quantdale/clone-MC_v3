# Proposal: 202-inventory-screen-parity

## Problem
106's transaction core covers click and shift-click (quickMove), but screen interactions are
incomplete: no mouse drag with distribution, no double-click gather, no number-key hotbar swap.
203's screen framework needs these pure semantics.

## Goals
- `src/inventory/InventoryScreenParity.ts` (NEW), pure and headless-safe (immutable menu
  transforms over 106's `ContainerMenu`, no mutation of inputs):
  - **Drag**: `DragState { active, button, startSlot, hovered }`; `createDragState()` (inactive);
    `dragStart(state, button, startSlot)` (activates, hovered = [startSlot]);
    `dragHover(state, index)` (adds unique hovered slots); `dragEnd(menu, state)` distributes the
    CURSOR stack across the hovered slots and clears the drag — left drag in rounds (one item per
    slot per round, cycling until the cursor empties or nothing fits), right drag evenly
    (base = floor(count / n), remainder distributed one-per-slot to the earliest hovered slots,
    respecting item match and stack caps; anything unfitted stays on the cursor). Inactive
    `dragEnd` is an identity no-op.
  - **Double-click gather**: `doubleClickGather(menu, index)` — with an empty cursor or a cursor
    of the same item, moves up to cursor room (64) from all same-item slots (in slot order) into
    the cursor, draining them; a mismatched cursor or both-empty is an identity no-op.
  - **Hotbar swap**: `hotbarSwap(menu, hotbarIndex, targetIndex)` — `hotbarIndex` must lie in the
    hotbar range (the player region's first 9 slots); swaps the slots' items (counts and
    components), moves into an empty target, or identity-no-ops when both are empty or the
    indices match; out-of-bounds/hotbar-range violations throw (106-style).

## Non-goals
- **No UI rendering** (203), **no network/click simulation**, **no `Game.ts` edit**, **no change
  to 106's transaction core**, **no save-format change**.

## Preconditions
- Change 201 (`ambient-audio`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 106's `ContainerMenu` / `MenuSlot` / `MenuCursor` types and `MAX_CURSOR_COUNT` (imported types
  only; the core is untouched).

## Proposed change
1. `src/inventory/InventoryScreenParity.ts` (NEW): the drag state machine, drag distribution,
   double-click gather, and hotbar swap.

## Compatibility and migration
- One new inventory file; zero changes to 106 or any registry; no `Game.ts` edit; no schema/
  save-format change.

## Risks
- **Drag distribution drift from vanilla**. Mitigation: the round/even rules are documented
  exactly and pinned with fixed-count tests (including caps and mismatched items).
- **Index misuse**. Mitigation: 106-style descriptive throws for out-of-bounds and hotbar-range
  violations; identity no-ops elsewhere.

## Rollback strategy
One new inventory file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: drag state lifecycle; left-drag rounds (plain, capped, mixed items); right-
  drag even distribution (plain, remainder, capped); inactive dragEnd identity; double-click
  gather (empty cursor, same-item cursor, cap, mismatched, both-empty); hotbar swap (swap, move
  to empty, both-empty identity, same-index identity, hotbar-range throw); input immutability.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
