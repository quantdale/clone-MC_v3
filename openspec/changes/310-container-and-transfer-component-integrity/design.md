# Design: 310-container-and-transfer-component-integrity

## Context/current state

Change 123 introduced item components on `MenuSlot` (`components?: Readonly<Record<string, unknown>>`), and Change 260 introduced `menuComponentsEqual` in `src/inventory/MenuTransaction.ts` to govern click-transaction merging.
However, several container block entity models and redstone item transfer systems created earlier were never retrofitted:

1. `ChestBlockEntity`:
   - `serializeChestInventory` strips `components` during `inv.slots.map(...)`.
   - `validateSlots` drops `s.components` during object extraction.
   - `validateSlot` permits `item: null` slots to have `components`.
2. `FurnaceBlockEntity`:
   - `serializeFurnaceState` strips `components` for `input`, `fuel`, and `output`.
   - `parseSlot` drops `s.components`.
   - `validateSlot` permits `item: null` slots to have `components`.
3. `HopperTransfer`:
   - `transferOneItem` matches destination slots solely on `d.item === item && d.count < d.maxStack`, merging stacks even when `menuComponentsEqual(sourceSlot.components, d.components)` is false.
   - Transfer to empty slot never assigns `destSlot.components`.
   - Depletion to count 0 sets `sourceSlot.item = null` but leaves `sourceSlot.components` dangling.
4. `DropperEject` & `DispenserBehavior`:
   - Depletion to count 0 fails to delete `sourceSlot.components`.
   - `DroppedItem` does not model `components`.

## Target state

- `ChestBlockEntity` and `FurnaceBlockEntity` serialize and deserialize `components` losslessly, rejecting components on null-item slots.
- `HopperTransfer.transferOneItem` merges only when `menuComponentsEqual` returns true, transfers components to empty destination slots, and deletes components when source slots reach count 0.
- `DropperEject` and `DispenserBehavior` delete components when source slots reach count 0, and `DroppedItem` reflects the dropped item's components.

## Invariants

- **INV-1 (Slot Hygiene):** A `MenuSlot` with `item: null` SHALL have `count: 0` and SHALL NOT have `components` defined.
- **INV-2 (Serialization Exactness):** For any valid container state `S`, `deserialize(serialize(S))` SHALL produce a state deeply equal to `S`, including all `components` records.
- **INV-3 (Merge Identity):** Two slots in an automated transfer SHALL merge if and only if `a.item === b.item && menuComponentsEqual(a.components, b.components)`.
- **INV-4 (Conservation of Data):** Transferring an item stack unit into an empty slot SHALL preserve its component record without mutation.
- **INV-5 (Total Cleanliness):** When an item count drops to 0, both `item` becomes `null` and `components` is deleted.

## API and data model

In `src/world/ChestBlockEntity.ts`:
```ts
function validateSlot(slot: MenuSlot, index: number): void {
  // ... existing validations ...
  if (slot.item === null) {
    if (slot.count !== 0) {
      throw new Error(`ChestBlockEntity: slot ${index} with a null item must have count 0`);
    }
    if (slot.components !== undefined) {
      throw new Error(`ChestBlockEntity: slot ${index} with a null item must not have components`);
    }
  }
}

function validateSlots(slots: unknown, length: number, what: string): MenuSlot[] {
  // ...
  const parsed: MenuSlot = {
    item: s.item as string | null,
    count: s.count as number,
    maxStack: s.maxStack as number,
    ...(s.components !== undefined && typeof s.components === 'object' && s.components !== null
      ? { components: s.components as Readonly<Record<string, unknown>> }
      : {}),
  };
  validateSlot(parsed, i);
  out.push(parsed);
}

export function serializeChestInventory(inv: ChestInventory): unknown {
  validateChestInventory(inv);
  return {
    slots: inv.slots.map((s) => ({
      item: s.item,
      count: s.count,
      maxStack: s.maxStack,
      ...(s.components !== undefined ? { components: s.components } : {}),
    })),
  };
}
```

In `src/world/FurnaceBlockEntity.ts`:
```ts
function validateSlot(slot: MenuSlot, what: string): void {
  // ... existing validations ...
  if (slot.item === null) {
    if (slot.count !== 0) {
      throw new Error(`FurnaceBlockEntity: ${what} with a null item must have count 0`);
    }
    if (slot.components !== undefined) {
      throw new Error(`FurnaceBlockEntity: ${what} with a null item must not have components`);
    }
  }
}

function parseSlot(input: unknown, what: string): MenuSlot {
  // ...
  const slot: MenuSlot = {
    item: s.item as string | null,
    count: s.count as number,
    maxStack: s.maxStack as number,
    ...(s.components !== undefined && typeof s.components === 'object' && s.components !== null
      ? { components: s.components as Readonly<Record<string, unknown>> }
      : {}),
  };
  validateSlot(slot, what);
  return slot;
}

export function serializeFurnaceState(state: FurnaceState): unknown {
  const valid = validateFurnaceState(state);
  const serializeSlot = (s: MenuSlot) => ({
    item: s.item,
    count: s.count,
    maxStack: s.maxStack,
    ...(s.components !== undefined ? { components: s.components } : {}),
  });
  return {
    input: serializeSlot(valid.input),
    fuel: serializeSlot(valid.fuel),
    output: serializeSlot(valid.output),
    burnTime: valid.burnTime,
    burnTimeTotal: valid.burnTimeTotal,
    smeltTime: valid.smeltTime,
    smeltTimeTotal: valid.smeltTimeTotal,
    xp: valid.xp,
  };
}
```

In `src/simulation/HopperTransfer.ts`:
```ts
import { menuComponentsEqual } from '../inventory/MenuTransaction';

export function transferOneItem(
  source: readonly MenuSlot[],
  destination: readonly MenuSlot[],
): HopperTransferResult {
  const sourceSlots = source.map((s) => ({ ...s }));
  const destinationSlots = destination.map((s) => ({ ...s }));

  const sourceIndex = sourceSlots.findIndex((s) => s.item !== null && s.count > 0);
  if (sourceIndex === -1) {
    return { moved: false, source: sourceSlots, destination: destinationSlots };
  }
  const sourceSlot = sourceSlots[sourceIndex]!;
  const item = sourceSlot.item!;
  const sourceComponents = sourceSlot.components;

  let destIndex = destinationSlots.findIndex(
    (d) => d.item === item && d.count < d.maxStack && menuComponentsEqual(sourceComponents, d.components),
  );
  if (destIndex === -1) {
    destIndex = destinationSlots.findIndex((d) => d.item === null);
  }
  if (destIndex === -1) {
    return { moved: false, source: sourceSlots, destination: destinationSlots };
  }

  const destSlot = destinationSlots[destIndex]!;
  if (destSlot.item === null) {
    destSlot.item = item;
    destSlot.count = 1;
    if (sourceComponents !== undefined) {
      destSlot.components = sourceComponents;
    }
  } else {
    destSlot.count += 1;
  }
  sourceSlot.count -= 1;
  if (sourceSlot.count === 0) {
    sourceSlot.item = null;
    delete sourceSlot.components;
  }

  return { moved: true, source: sourceSlots, destination: destinationSlots };
}
```

In `src/simulation/DropperEject.ts`:
```ts
export interface DroppedItem {
  readonly item: string;
  readonly count: number;
  readonly position: readonly [number, number, number];
  readonly components?: Readonly<Record<string, unknown>>;
}
```
And inside `ejectFromDropper`:
```ts
  const itemComponents = sourceSlot.components;
  sourceSlot.count -= 1;
  if (sourceSlot.count === 0) {
    sourceSlot.item = null;
    delete sourceSlot.components;
  }
  return {
    kind: 'drop',
    moved: true,
    source: sourceSlots,
    drop: {
      item,
      count: 1,
      position: [dropPosition[0], dropPosition[1], dropPosition[2]],
      ...(itemComponents !== undefined ? { components: itemComponents } : {}),
    },
  };
```

In `src/simulation/DispenserBehavior.ts`:
```ts
  if (behavior !== null) {
    sourceSlot.count -= 1;
    if (sourceSlot.count === 0) {
      sourceSlot.item = null;
      delete sourceSlot.components;
    }
    return { kind: 'behavior', behavior, source: sourceSlots };
  }
```

## Control/data flow

1. Player/system places item with components into Chest or Furnace.
2. `serializeChestInventory`/`serializeFurnaceState` preserves `components` in the serialized record.
3. On reload, `deserializeChestInventory`/`deserializeFurnaceState` restores `components` identically.
4. Hopper transfers item: verifies matching components before merging into existing stack; sets components when filling empty slot; cleans up source slot cleanly.
5. Dropper ejects item: preserves components in `DroppedItem` and cleans up source slot cleanly.

## Detailed behavior

See capability spec in `specs/component-integrity/spec.md`.

## Failure modes

- Empty slot carrying components: Throws validation error during `validateSlot` (fail-closed).
- Mismatched components in destination: `transferOneItem` bypasses full or mismatched slots and looks for an empty slot; if none, `moved: false` and source untouched.

## Compatibility/migration

Fully backward-compatible. Existing saved states lacking `components` continue to deserialize with `components: undefined`.

## Performance/resource constraints

Zero performance overhead. Slot counts per chest/furnace are small (27/3 slots). `menuComponentsEqual` executes in microseconds and only when items match.

## Testing seams

- `tests/unit/ChestBlockEntity.test.ts`
- `tests/unit/FurnaceBlockEntity.test.ts`
- `tests/unit/HopperTransfer.test.ts`
- `tests/unit/DropperEject.test.ts`
- `tests/unit/DispenserBehavior.test.ts`

## Observability/debugging

Descriptive error messages when an empty slot carries components or when serialization fails validation.

## Affected files/symbols

- `src/world/ChestBlockEntity.ts` (`validateSlot`, `validateSlots`, `serializeChestInventory`)
- `src/world/FurnaceBlockEntity.ts` (`validateSlot`, `parseSlot`, `serializeFurnaceState`)
- `src/simulation/HopperTransfer.ts` (`transferOneItem`)
- `src/simulation/DropperEject.ts` (`DroppedItem`, `ejectFromDropper`)
- `src/simulation/DispenserBehavior.ts` (`dispenseFromDispenser`)
- Unit test files in `tests/unit/`

## Rejected alternatives

1. *Allowing null-item slots with components:* Rejected because `MenuTransaction.validateSlot` specifies that an empty slot must represent absence of an item; carrying components on null is inconsistent and leads to ghost items.
2. *Deep cloning components on every move:* Rejected as unnecessary because component maps are treated as immutable `Readonly<Record<string, unknown>>` throughout the engine.

## Downstream dependencies

None broken; all existing callers pass identical types.
