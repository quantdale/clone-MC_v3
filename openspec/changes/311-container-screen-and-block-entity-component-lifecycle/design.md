# Design: 311-container-screen-and-block-entity-component-lifecycle

## Context/current state

Change 310 resolved item component data loss during block entity persistence (Chest, Furnace, DoubleChest) and automated hopper/dropper/dispenser operations.
However, the screen interaction layer (`InventoryScreenParity.ts`) and validation/host layers still treat item components as second-class or ignore them entirely:
- `validateSlot` and `validateCursor` in `MenuTransaction.ts` permit `components !== undefined` on empty slots/cursors (`item === null`).
- `dragEnd` in `InventoryScreenParity.ts` distributes items into slots without setting `slot.components` on empty slots, without checking `menuComponentsEqual` on occupied slots, and without retaining `cursor.components` on remainder stacks.
- `doubleClickGather` in `InventoryScreenParity.ts` merges disparate stacks that have matching item IDs but differing components, strips components when gathering into an empty cursor, and fails to delete `components` when an inventory slot reaches count 0.
- `sameSlot` and `sameMenu` in `InventoryScreenParity.ts` ignore `components`, falsely treating distinct items as identical.
- `BrewingStandBlockEntity.ts` permits empty slots with components in `validateSlot`, and `consumeOne` preserves components via object spread when count reaches 0.
- `LiveBlockEntityHost.ts` uses `brewingStateEquals` and `furnaceStateEquals`, both of which ignore `components`.

## Target state

1. **Strict Slot and Cursor Hygiene**:
   - `validateSlot(slot, index)` in `MenuTransaction.ts` throws `MenuTransaction: slot ${index} with a null item must not have components` if `slot.item === null && slot.components !== undefined`.
   - `validateCursor(cursor)` in `MenuTransaction.ts` throws `MenuTransaction: cursor with a null item must not have components` if `cursor.item === null && cursor.components !== undefined`.
   - `validateSlot(slot, what)` in `BrewingStandBlockEntity.ts` throws `BrewingStandBlockEntity: ${what} with a null item must not have components` if `slot.item === null && slot.components !== undefined`.
   - `consumeOne(slot)` in `BrewingStandBlockEntity.ts` returns `{ item: null, count: 0, maxStack: slot.maxStack }` without `components` when count reaches 0.

2. **Component-Preserving Drag Distribution**:
   - In `InventoryScreenParity.dragEnd`:
     - If `menu.cursor.components !== undefined`, placing into an empty slot sets `slot.components = menu.cursor.components`.
     - Placing into an occupied slot (`slot.item === item`) requires `menuComponentsEqual(menu.cursor.components, slot.components)`. If false, the slot cannot receive items from this drag (progress remains false, remainder stays on cursor).
     - The returned cursor preserves `menu.cursor.components` when `remaining > 0`, and omits components when `remaining === 0`.

3. **Component-Aware Double-Click Gather**:
   - In `InventoryScreenParity.doubleClickGather`:
     - Target item and target components are determined by the active cursor (if non-empty) or the clicked slot:
       `targetItem = menu.cursor.item ?? slot.item;`
       `targetComponents = menu.cursor.item !== null ? menu.cursor.components : slot.components;`
     - When iterating slots, only slots with `s.item === targetItem && menuComponentsEqual(s.components, targetComponents)` are gathered.
     - The returned cursor gets `{ item: targetItem, count, ...(targetComponents !== undefined ? { components: targetComponents } : {}) }`.
     - When `s.count === 0`, `s.item = null; delete s.components;`.

4. **Component-Aware Equality**:
   - `sameSlot(a, b)` returns `a.item === b.item && a.count === b.count && a.maxStack === b.maxStack && menuComponentsEqual(a.components, b.components)`.
   - `sameMenu(a, b)` checks `menuComponentsEqual(a.cursor.components, b.cursor.components)` in addition to item/count, and calls `sameSlot`.
   - `brewingStateEquals(a, b)` checks `menuComponentsEqual(x.components, y.components)` for bottle, fuel, and ingredient slots.
   - `furnaceStateEquals(a, b)` checks `menuComponentsEqual(x.components, y.components)` for input, fuel, and output slots.

## Invariants

- **Empty Slot Component Exclusion**: For any `MenuSlot` or `MenuCursor`, `item === null` if and only if `count === 0`, and `components` MUST be `undefined`.
- **Component Preservation on Placement**: An item placed from a cursor carrying `components` into an empty slot MUST carry the exact same `components`.
- **Component Compatibility on Merge**: An item from a cursor carrying `components` MUST NOT merge into an occupied slot unless `menuComponentsEqual(cursor.components, slot.components)` is true.
- **Clean Depletion**: When a slot's count is decremented to 0 by any operation (gather, consume, transfer), its `item` becomes `null` and its `components` MUST be removed.
- **State Change Detection**: Any mutation of `components` on any slot in a block entity MUST result in `stateEquals` returning `false`.

## API and data model

No changes to type declarations or schemas. `MenuSlot` and `MenuCursor` already declare optional `components?: Readonly<Record<string, unknown>>`. All changes are behavioral enforcement of data contracts.

## Control/data flow

```
[UI / User Interaction]
        |
        v
[InventoryScreenParity (dragEnd, doubleClickGather)]
        | (validates component equality & assigns components)
        v
[ContainerMenu / MenuSlots]
        | (validates no components on empty slots/cursors)
        v
[MenuTransaction.validateContainerMenu]
        |
        v
[LiveBlockEntityHost / World]
        | (detects component changes via stateEquals with menuComponentsEqual)
        v
[Persistence (IndexedDbBlockEntityStore)]
```

## Detailed behavior

See target state and normative requirements in `specs/component-lifecycle/spec.md`.

## Failure modes

- Invalid slot structures throw descriptive `Error`s during validation.
- Attempting to drag-merge items with mismatched components leaves items on the cursor without modifying the destination slot.
- Double-clicking to gather skips slots carrying mismatched components.

## Compatibility/migration

100% backward compatible with valid saves and gameplay. Rejects corrupted in-memory or persisted slot representations with dangling components on empty slots.

## Performance/resource constraints

`menuComponentsEqual` canonicalizes object keys and compares JSON string representations. In hot UI interaction loops (drag, gather), this introduces negligible overhead (< 0.1ms per click/drag) for typically small component bags.

## Testing seams

- `tests/unit/MenuTransaction.test.ts` / `tests/unit/MenuTransactionComponents.test.ts`
- `tests/unit/InventoryScreenParity.test.ts`
- `tests/unit/BrewingStandBlockEntity.test.ts`
- `tests/unit/LiveBlockEntityHost.test.ts`

## Observability/debugging

Descriptive exception messages:
- `"MenuTransaction: slot ${index} with a null item must not have components"`
- `"MenuTransaction: cursor with a null item must not have components"`
- `"BrewingStandBlockEntity: ${what} with a null item must not have components"`

## Affected files/symbols

- `src/inventory/MenuTransaction.ts` (`validateSlot`, `validateCursor`)
- `src/inventory/InventoryScreenParity.ts` (`dragEnd`, `doubleClickGather`, `sameSlot`, `sameMenu`)
- `src/world/BrewingStandBlockEntity.ts` (`validateSlot`, `consumeOne`)
- `src/engine/LiveBlockEntityHost.ts` (`brewingStateEquals`, `furnaceStateEquals`)

## Rejected alternatives

- *Permitting null items with empty components `{}`*: Rejected. It complicates equality checks and creates ambiguous empty-slot representations.
- *Stripping components on drag*: Rejected. Stripping components destroys player data (such as potion contents or durability).

## Downstream dependencies

None. Closes the remaining component integrity gaps across container menus, screens, and block entities.
