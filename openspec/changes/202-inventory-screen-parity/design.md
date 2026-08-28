# Design: 202-inventory-screen-parity

## Context/current state
- 106 provides `ContainerMenu` (validated slots + player region + cursor) and click/quickMove
  transactions. Screen-level interactions (drag, double-click, hotbar keys) are missing. 203's
  screen framework will bind a UI to these transforms.

## Target state
- `src/inventory/InventoryScreenParity.ts` holding the drag state machine + distribution, the
  double-click gather, and the hotbar swap — all immutable transforms over 106's menu model.

## Invariants
- Pure and headless-safe: no mutation of inputs; every transform returns a NEW menu/drag state
  (or the IDENTICAL object for a no-op).
- Counts never exceed `MAX_CURSOR_COUNT` (64) or per-slot `maxStack`; items only merge when equal.
- `dragEnd` with an inactive drag is an identity no-op (both menu and drag state).
- `doubleClickGather` with a mismatched cursor or no item anywhere is an identity no-op.
- `hotbarSwap` throws descriptively for out-of-bounds or non-hotbar indices (106-style); identity
  no-ops when the indices match or both slots are empty.
- Hotbar range: the player region's first 9 slots, clamped to the region end.

## API and data model
```ts
// src/inventory/InventoryScreenParity.ts (new)
export type DragButton = 'left' | 'right';
export interface DragState {
  active: boolean;
  button: DragButton;
  startSlot: number;
  hovered: readonly number[];
}
export function createDragState(): DragState;                                    // inactive
export function dragStart(state: DragState, button: DragButton, startSlot: number): DragState;
export function dragHover(state: DragState, index: number): DragState;           // unique add
export function dragEnd(menu: ContainerMenu, state: DragState):
  { menu: ContainerMenu; drag: DragState };

export function doubleClickGather(menu: ContainerMenu, index: number): ContainerMenu;
export function hotbarSwap(menu: ContainerMenu, hotbarIndex: number, targetIndex: number): ContainerMenu;
export const HOTBAR_SIZE = 9;
```

## Control/data flow
1. The wiring routes mouse events: dragStart on a slot (after the cursor picked the item up via
   106's leftClick), dragHover per slot entered, dragEnd on release.
2. Double-click routes to `doubleClickGather`; number keys route to `hotbarSwap` with the
   absolute hotbar slot index.

## Detailed behavior
- `dragStart`: a NEW state with `active: true`, the button, and `hovered: [startSlot]` (a restart
  replaces the previous drag).
- `dragHover`: adds the index when not already present and the drag is active; otherwise identity.
- `dragEnd(menu, state)`:
  - inactive -> `{ menu, drag: state }` (identical objects).
  - cursor empty -> clears the drag (active false, hovered []) and returns the same menu (new
    object only if distribution happened; an empty cursor changes nothing -> identical menu).
  - left: rounds — per round, each hovered slot takes 1 when it is empty or holds the cursor item
    below `maxStack`; rounds continue while the cursor has items and some slot took one; the
    remainder stays on the cursor.
  - right: `n = hovered.length`; `base = floor(count / n)`, `rem = count % n`; in hover order each
    slot takes `base + (i < rem ? 1 : 0)` subject to fit (item match + `maxStack`); the unfitted
    remainder stays on the cursor.
  - The result drag is inactive with an empty hovered list.
- `doubleClickGather(menu, index)`:
  - cursor.item !== null and slot.item !== cursor.item -> identity.
  - target item = cursor.item ?? slot.item; both null -> identity.
  - from slot order (0..n-1, skipping `index`-independent — the clicked slot is included like any
    other), move `min(slot.count, room)` per slot into the cursor (room = 64 - cursor.count),
    draining slots; stop when the cursor is full.
- `hotbarSwap(menu, hotbarIndex, targetIndex)`:
  - `assertIndex` both (106 message); `hotbarIndex` must be in `[playerSlotStart, min(playerSlotStart
    + HOTBAR_SIZE, slots.length))` else `Error('InventoryScreenParity: hotbarIndex <i> is outside the
    hotbar range')`.
  - same index -> identity; both empty -> identity; target empty -> move the hotbar slot's item
    there; else swap items (item, count, components).
- All slot copies preserve `components`; the cursor never participates in swaps.

## Failure modes
- Descriptive throws for out-of-bounds indices and non-hotbar `hotbarIndex` (106-style).
- Everything else is total: identity no-ops for inactive/empty/mismatched cases.

## Compatibility/migration
- One new inventory file; 106's core and all existing behavior untouched; no `Game.ts` edit; no
  schema/save-format change.

## Performance/resource constraints
- Left-drag rounds are O(rounds * hovered); worst-case rounds bounded by the cursor count (<= 64).
- Gather and swap are O(slots).

## Testing seams
- Tests build menus via 106's `createContainerMenu` with hand-picked slots and drive every path
  with fixed counts; immutability is pinned by deep-equality of inputs after calls.

## Observability/debugging
- Menus and drag states are plain immutable objects; every transform is a total function.

## Affected files/symbols
- `src/inventory/InventoryScreenParity.ts` (new).
- Tests: `tests/unit/InventoryScreenParity.test.ts` (new). No other files.

## Rejected alternatives
- **Extending 106's transaction union with drag types**: rejected — the core stays stable (its
  characterization tests untouched); the screen semantics layer composes over it instead.

## Downstream dependencies
- 203 (`container-screen-framework`) binds a UI to these transforms; 204-205 continue the
  inventory-parity arc.
