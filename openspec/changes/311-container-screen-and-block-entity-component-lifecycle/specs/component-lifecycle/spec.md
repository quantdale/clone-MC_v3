# Spec: Component Lifecycle in Screens and Block Entities

## Contract

Components attached to items (`components?: Readonly<Record<string, unknown>>`) MUST be preserved across all screen interactions (dragging, gathering) and block entity lifecycles, MUST NOT be merged with incompatible components, and MUST NOT linger on empty slots or empty cursors.

## Definitions

- **Empty Slot**: A slot with `item === null` and `count === 0`.
- **Empty Cursor**: A cursor with `item === null` and `count === 0`.
- **Component Equality**: Two component records `a` and `b` are equal if and only if `menuComponentsEqual(a, b)` returns `true`.

## Invariants

- **INV-CLC-1**: An empty slot (`item === null`) MUST NOT carry `components`.
- **INV-CLC-2**: An empty cursor (`item === null`) MUST NOT carry `components`.
- **INV-CLC-3**: Moving an item with `components` to an empty slot MUST preserve identical `components` on the destination slot.
- **INV-CLC-4**: Merging items with `components` MUST require identical components via `menuComponentsEqual`.
- **INV-CLC-5**: Depleting a slot or cursor to count 0 MUST remove `components`.
- **INV-CLC-6**: Two states differ if any slot's components differ.

## Requirements

### Requirement: REQ-CLC-1 MenuTransaction Slot and Cursor Hygiene

`MenuTransaction.validateSlot` and `MenuTransaction.validateCursor` MUST reject empty slots and cursors that carry `components`.

#### Scenario: Slot with null item and components throws
- GIVEN a `MenuSlot` with `item: null`, `count: 0`, and `components: { test: 1 }`
- WHEN `validateContainerMenu` or `validateSlot` is executed
- THEN it SHALL throw an Error matching `/slot \d+ with a null item must not have components/`

#### Scenario: Cursor with null item and components throws
- GIVEN a `MenuCursor` with `item: null`, `count: 0`, and `components: { test: 1 }`
- WHEN `validateContainerMenu` or `validateCursor` is executed
- THEN it SHALL throw an Error matching `/cursor with a null item must not have components/`

### Requirement: REQ-CLC-2 Drag Distribution Component Preservation

`InventoryScreenParity.dragEnd` MUST preserve `cursor.components` when placing into empty slots, MUST NOT merge into occupied slots unless `menuComponentsEqual` matches, and MUST retain `cursor.components` on any remaining cursor count.

#### Scenario: Drag into empty slot sets components
- GIVEN an active drag with a cursor holding `{ item: 'minecraft:potion', count: 2, components: { type: 'speed' } }` over two empty slots
- WHEN `dragEnd` is executed
- THEN both destination slots SHALL have `item: 'minecraft:potion'`, `count: 1`, and `components: { type: 'speed' }`
- AND the cursor SHALL have `item: null`, `count: 0`, and no `components`

#### Scenario: Drag onto mismatched slot leaves remainder on cursor
- GIVEN an active drag with a cursor holding `{ item: 'minecraft:potion', count: 2, components: { type: 'speed' } }` over a slot holding `{ item: 'minecraft:potion', count: 1, components: { type: 'healing' } }`
- WHEN `dragEnd` is executed
- THEN the occupied slot SHALL remain `{ item: 'minecraft:potion', count: 1, components: { type: 'healing' } }`
- AND the cursor SHALL retain `{ item: 'minecraft:potion', count: 2, components: { type: 'speed' } }`

#### Scenario: Drag with remainder preserves cursor components
- GIVEN an active drag distributing 1 unit of a 3-unit stack with components
- WHEN `dragEnd` is executed
- THEN the cursor SHALL retain `count: 2` and the exact same `components`

### Requirement: REQ-CLC-3 Double-Click Gather Component Matching and Clean Depletion

`InventoryScreenParity.doubleClickGather` MUST only gather stacks with identical components, MUST transfer components to the cursor, and MUST clean up components on depleted slots.

#### Scenario: Gather skips mismatched components
- GIVEN an inventory with one slot holding healing potion and another holding speed potion
- WHEN doubleClickGather is called targeting the healing potion
- THEN only the healing potion slot SHALL be gathered into the cursor
- AND the speed potion slot SHALL remain untouched

#### Scenario: Gather into empty cursor sets components
- GIVEN an empty cursor and doubleClickGather called on a slot with components
- WHEN gather completes
- THEN the cursor SHALL carry the slot's components

#### Scenario: Depleted gathered slot removes components
- GIVEN a slot with components that is fully drained by doubleClickGather
- WHEN gather completes
- THEN the slot SHALL have `item: null`, `count: 0`, and NO `components` property

### Requirement: REQ-CLC-4 Menu and Slot Equality Component Check

`InventoryScreenParity.sameSlot` and `sameMenu` MUST check `menuComponentsEqual` on slots and cursors.

#### Scenario: Slots with different components are not sameSlot
- GIVEN two slots with identical item and count but different components
- WHEN `sameSlot(a, b)` is called
- THEN it SHALL return `false`

#### Scenario: Menus with different cursor components are not sameMenu
- GIVEN two menus identical except for `cursor.components`
- WHEN `sameMenu(a, b)` is called
- THEN it SHALL return `false`

### Requirement: REQ-CLC-5 Brewing Stand Empty Slot Hygiene and Clean Consumption

`BrewingStandBlockEntity.validateSlot` MUST reject empty slots carrying components, and `consumeOne` MUST remove components upon count reaching 0.

#### Scenario: Validate brewing state rejects empty slot with components
- GIVEN a brewing state where `fuel` or `ingredient` or `bottle` has `item: null`, `count: 0`, and `components: { ... }`
- WHEN `validateBrewingState` is called
- THEN it SHALL throw an Error matching `/with a null item must not have components/`

#### Scenario: consumeOne removes components when count drops to zero
- GIVEN a slot with `item: 'minecraft:blaze_powder'`, `count: 1`, and `components: { custom: true }`
- WHEN `consumeOne(slot)` is called
- THEN it SHALL return `{ item: null, count: 0, maxStack: 64 }` with NO `components` property

### Requirement: REQ-CLC-6 Live Block Entity Host Component-Aware Equality

`LiveBlockEntityHost.brewingStateEquals` and `furnaceStateEquals` MUST compare slot components via `menuComponentsEqual`.

#### Scenario: brewingStateEquals returns false on component difference
- GIVEN two brewing states identical in timers, item IDs, and counts, but differing in bottle `components`
- WHEN `brewingStateEquals(a, b)` is called
- THEN it SHALL return `false`

#### Scenario: furnaceStateEquals returns false on component difference
- GIVEN two furnace states identical in timers, item IDs, and counts, but differing in input `components`
- WHEN `furnaceStateEquals(a, b)` is called
- THEN it SHALL return `false`
