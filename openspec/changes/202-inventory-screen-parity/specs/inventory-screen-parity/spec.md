# Spec: inventory-screen-parity

## Contract
This capability adds the screen-level inventory interaction semantics over 106's container menu:
mouse drag with distribution, double-click gather, and number-key hotbar swap — pure, immutable,
headless-safe transforms.

## Definitions
- **Drag**: an active mouse-drag over slots; the carried stack is the menu cursor.
- **Hovered**: the ordered list of slots the drag covered (unique indices).
- **Hotbar**: the player region's first 9 slots (clamped to the region end).

## Invariants
- Pure and headless-safe: inputs are never mutated; results are new objects (or the identical
  object for a no-op).
- Counts never exceed 64 (cursor) or `maxStack` (slots); items only merge when equal.
- `dragEnd` with an inactive drag MUST return the identical menu and drag state.
- `doubleClickGather` with a mismatched cursor or no item anywhere MUST be an identity no-op.
- `hotbarSwap` MUST throw descriptively for out-of-bounds or non-hotbar indices, and MUST be an
  identity no-op when the indices match or both slots are empty.

## Requirements

### Requirement: drag state lifecycle
`createDragState()` MUST be inactive. `dragStart(state, button, startSlot)` MUST return an active
state with `hovered: [startSlot]`. `dragHover(state, index)` MUST append unique indices while
active and MUST be an identity no-op when inactive or already hovered.

#### Scenario: lifecycle
- **GIVEN** an inactive state, `dragStart(state, 'left', 3)`, then `dragHover(4)`, `dragHover(3)`,
  and `dragHover(4)`
- **THEN** the active state is `{ active: true, button: 'left', startSlot: 3, hovered: [3, 4] }`;
  `dragHover` on an inactive state returns the identical state

### Requirement: left drag distributes in rounds
`dragEnd` with a left drag MUST distribute the cursor across the hovered slots one item per slot
per round, cycling until the cursor empties or no slot can take an item; the remainder stays on
the cursor.

#### Scenario: left rounds
- **GIVEN** a menu whose cursor holds 5 of item `a` (maxStack 64 everywhere), hovered slots
  `[2, 5]`, both empty
- **THEN** after `dragEnd` slot 2 holds 3 and slot 5 holds 2 of `a`, the cursor is empty, and the
  drag is inactive; when slot 5 holds `b`, slot 2 gets 1 and the cursor keeps 4

### Requirement: right drag distributes evenly
`dragEnd` with a right drag MUST give each hovered slot `floor(count / n)` plus 1 to the first
`count % n` hovered slots (in hover order), subject to fit; the unfitted remainder stays on the
cursor.

#### Scenario: right distribution
- **GIVEN** a cursor of 10 of item `a` and 3 hovered empty slots
- **THEN** the slots receive 4, 3, 3 and the cursor empties; with a full (cap 2) first slot, the
  first slot receives 2 and the remainder stays on the cursor

### Requirement: double-click gather
`doubleClickGather(menu, index)` MUST move same-item stacks (in slot order) into the cursor up to
64, draining slots, when the cursor is empty or holds the same item as the clicked slot; a
mismatched cursor or no item MUST be an identity no-op.

#### Scenario: gather
- **GIVEN** a menu with `a` x 20 and `a` x 30 in two slots and an empty cursor, clicked on the
  first
- **THEN** the cursor holds 50 of `a` and both slots are empty; with a cursor already holding 50
  of `a`, the result cursor holds 64 and the first slot keeps 6; with a cursor of `b`, the menu
  is unchanged (identity)

### Requirement: hotbar swap
`hotbarSwap(menu, hotbarIndex, targetIndex)` MUST swap the two slots' items (item, count,
components) when both hold items, move the hotbar item into an empty target, and MUST be an
identity no-op when the indices match or both slots are empty; a non-hotbar `hotbarIndex` MUST
throw.

#### Scenario: swap
- **GIVEN** a menu with hotbar slot 9 holding `a` x 1 and target 12 holding `b` x 3
- **THEN** after the swap slot 9 holds `b` x 3 and slot 12 holds `a` x 1; with an empty target
  the hotbar item moves there; with an empty hotbar slot the menu is unchanged (identity);
  `hotbarSwap(menu, 5, 12)` (container region) throws `hotbarIndex 5 is outside the hotbar range`

## Error and failure behavior
- Descriptive throws for out-of-bounds indices and non-hotbar `hotbarIndex` (106-style messages).
- Everything else is total: identity no-ops for inactive/empty/mismatched cases.

## Performance and resource bounds
- Left-drag rounds bounded by the cursor count (<= 64); gather and swap are O(slots).

## Compatibility and migration
- One new inventory file; 106's core untouched; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions; counts are structurally bounded by 64 / `maxStack` at every step.

## Observability
- Menus and drag states are plain immutable objects; every transform is a total function.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 drag lifecycle | `tests/unit/InventoryScreenParity.test.ts` › drag lifecycle |
| REQ-2 left drag | › left drag |
| REQ-3 right drag | › right drag |
| REQ-4 gather | › double-click gather |
| REQ-5 hotbar swap | › hotbar swap |
