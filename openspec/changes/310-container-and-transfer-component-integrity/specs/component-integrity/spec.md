# Spec: component-integrity

## Contract

Item stack components (`components?: Readonly<Record<string, unknown>>`) carried by `MenuSlot` instances MUST be preserved across container block-entity serialization and automated redstone transfers, and MUST govern item stack merging.

## Definitions

- **`MenuSlot`**: An inventory or container slot carrying `item: string | null`, `count: number`, `maxStack: number`, and optional `components?: Readonly<Record<string, unknown>>`.
- **`menuComponentsEqual(a, b)`**: Canonical component equality defined in `src/inventory/MenuTransaction.ts` which treats `undefined` on both as equal, and compares serialized canonical forms for defined records.
- **`DroppedItem`**: A world item entity descriptor produced by a dropper upon ejection into air.

## Invariants

- **INV-1:** An empty slot (`item === null`) SHALL have `count === 0` and SHALL NOT have `components` defined.
- **INV-2:** Container serialization and deserialization in `ChestBlockEntity` and `FurnaceBlockEntity` SHALL preserve `components` losslessly for every slot where `components` is present.
- **INV-3:** `transferOneItem` SHALL NOT merge items when their components are not equal according to `menuComponentsEqual`.
- **INV-4:** `transferOneItem` SHALL copy components to empty destination slots.
- **INV-5:** Depleting a slot's count to 0 in `transferOneItem`, `ejectFromDropper`, or `dispenseFromDispenser` SHALL set `item = null` and delete `components`.

## Requirements

### Requirement R1: Container Serialization Component Preservation

Container block-entity serialization and deserialization in `ChestBlockEntity` and `FurnaceBlockEntity` MUST preserve `components?: Readonly<Record<string, unknown>>` on every slot. If an empty slot carries components, validation MUST throw a descriptive error.

#### Scenario R1.1: Chest inventory round-trip preserves slot components
- GIVEN a `ChestInventory` containing an item with components (e.g. `{ item: 'minecraft:potion', count: 1, maxStack: 1, components: { 'minecraft:potion_contents': { potion: 'minecraft:healing' } } }`)
- WHEN `serializeChestInventory` is called and the result is deserialized via `deserializeChestInventory`
- THEN the restored inventory contains the identical `components` on the corresponding slot.

#### Scenario R1.2: Chest inventory rejects empty slot with components
- GIVEN a payload where a slot has `item: null`, `count: 0`, and `components: { test: true }`
- WHEN `deserializeChestInventory` is called
- THEN it throws an error stating that a slot with a null item must not have components.

#### Scenario R1.3: Furnace state round-trip preserves slot components
- GIVEN a `FurnaceState` with components on `input`, `fuel`, or `output`
- WHEN `serializeFurnaceState` is called and the result is deserialized via `deserializeFurnaceState`
- THEN the restored state contains the identical `components` on each slot.

#### Scenario R1.4: Furnace state rejects empty slot with components
- GIVEN a furnace payload where `input` has `item: null`, `count: 0`, and `components: { test: true }`
- WHEN `deserializeFurnaceState` is called
- THEN it throws an error stating that a null item must not have components.

---

### Requirement R2: Automated Transfer Component Match & Preservation

`transferOneItem` in `HopperTransfer.ts` MUST require component equality via `menuComponentsEqual` before merging into an existing slot, MUST copy components when transferring into an empty destination slot, and MUST delete components when the source slot reaches count 0.

#### Scenario R2.1: Hopper does not merge items with different components
- GIVEN a source containing `{ item: 'minecraft:potion', count: 1, maxStack: 16, components: { potion: 'healing' } }`
- AND a destination containing `{ item: 'minecraft:potion', count: 1, maxStack: 16, components: { potion: 'harming' } }` followed by an empty slot
- WHEN `transferOneItem` is called
- THEN the item does NOT merge into the harming potion slot
- AND the item is placed into the empty slot with its healing components preserved.

#### Scenario R2.2: Hopper transfers components to an empty destination slot
- GIVEN a source containing `{ item: 'minecraft:potion', count: 1, maxStack: 1, components: { potion: 'healing' } }`
- AND a destination containing an empty slot
- WHEN `transferOneItem` is called
- THEN the destination slot receives `item: 'minecraft:potion'`, `count: 1`, and `components: { potion: 'healing' }`.

#### Scenario R2.3: Hopper deletes components when source is depleted
- GIVEN a source containing `{ item: 'minecraft:potion', count: 1, maxStack: 1, components: { potion: 'healing' } }`
- AND a destination that accepts the transfer
- WHEN `transferOneItem` is called
- THEN the source slot becomes `{ item: null, count: 0, maxStack: 1 }` with no `components` property.

---

### Requirement R3: Ejection and Dispense Component Hygiene & Descriptors

`ejectFromDropper` and `dispenseFromDispenser` MUST clean up `components` when a source slot is depleted to 0, and `DroppedItem` MUST include the item's components.

#### Scenario R3.1: Dropper world drop preserves components
- GIVEN a dropper source containing `{ item: 'minecraft:potion', count: 1, maxStack: 1, components: { potion: 'healing' } }`
- WHEN `ejectFromDropper` is called facing no container
- THEN the returned `drop` descriptor contains `components: { potion: 'healing' }`
- AND the source slot becomes `{ item: null, count: 0, maxStack: 1 }` with no `components`.

#### Scenario R3.2: Dispenser special behavior cleans up components on depletion
- GIVEN a dispenser source containing a special item (e.g. `{ item: 'minecraft:arrow', count: 1, maxStack: 64, components: { tipped: 'poison' } }`)
- WHEN `dispenseFromDispenser` is called
- THEN the source slot becomes `{ item: null, count: 0, maxStack: 64 }` with no `components`.
