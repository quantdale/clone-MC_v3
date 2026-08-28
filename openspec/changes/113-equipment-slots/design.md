# Design: 113-equipment-slots

## Context / current state

`Inventory` (`src/inventory/Inventory.ts`) models the player's 9 hotbar slots and
up to 27 main-storage stacks as `ItemStack` values (`{id, count, components?}`).
It exposes `snapshot(): InventorySnapshot` and `restore(snapshot, isValidItem,
maxDurabilityForItem)` for browser persistence; `Game` saves the snapshot at
`Game.ts:755` and restores at `Game.ts:722` inside the 037 save envelope.

There is **no equipment concept**. Equipment matters for parity: the four armor
slots (Head/Chest/Legs/Feet) and the Offhand each hold one worn `ItemStack`, while
the *mainhand* is simply whichever hotbar slot is currently `selected`. Armor
durability and tool components must survive equipping, so slots store full
`ItemStack | null` values, not bare ids. `ItemTypeDefinition`
(`src/inventory/ItemRegistry.ts`) has no armor-type/slot field, so 113 stores any
`ItemStack` and leaves type enforcement to 116.

## Target state

A `PlayerEquipment` value object owns five slots keyed by `EquipmentSlot`
(`Head`, `Chest`, `Legs`, `Feet`, `Offhand`). `Inventory` owns one
`PlayerEquipment` (`this.equipment`), created in its constructor, so equipment is
always present and is saved/restored as part of the inventory snapshot. The
selected hotbar slot remains the mainhand and is *not* duplicated into equipment.

```ts
// src/inventory/Equipment.ts
export enum EquipmentSlot { Head='head', Chest='chest', Legs='legs', Feet='feet', Offhand='offhand' }
export const EQUIPMENT_SLOT_ORDER = [Head, Chest, Legs, Feet, Offhand] as const; // serialize order
export const ARMOR_SLOTS = EQUIPMENT_SLOT_ORDER.slice(0, 4);                      // 116 input order
export interface EquipmentSnapshot { version: 1; slots: (ItemStack|null)[] }     // length 5

export class PlayerEquipment {
  getEquipment(slot): ItemStack | null;
  setEquipment(slot, stack: ItemStack | null): ItemStack | null; // returns previous
  clear(): void;
  getArmorStacks(): ItemStack[];                                // non-null ARMOR_SLOTS order
  serialize(): EquipmentSnapshot;
  restore(data, isValidItem): boolean;                          // atomic; false = no mutation
  static validateSnapshot(data, isValidItem): boolean;         // no mutation
}
```

```ts
// src/inventory/Inventory.ts (delta)
export interface InventorySnapshot { ..., equipment?: EquipmentSnapshot }
export class Inventory {
  readonly equipment: PlayerEquipment;          // new field, ctor-initialized
  // snapshot() now returns { ..., equipment: this.equipment.serialize() }
  // restore(): equipment validated in the early block, then populated
}
```

## Invariants

- There are exactly five equipment slots; `mainhand` is **not** one of them — it is
  `inventory.slots[inventory.selected]`.
- Each slot holds `ItemStack | null`; null means empty. Setting a slot to null
  clears it; setting it to a stack replaces whatever was there and returns the
  previous stack (or null).
- A stored `ItemStack` preserves its `components` map verbatim, so armor durability
  and tool wear survive equip/unequip/serialize/restore.
- `setEquipment` clamps `count` into `[1, MAX_STACK]` (equipment items are
  non-stackable in practice, but the clamp prevents a corrupt stack from escaping).
- `serialize()` is pure (no mutation). `restore()` is atomic: it validates the whole
  payload first and, on any failure, returns `false` without changing any slot.
- `Inventory.restore` rejects the entire restore (inventory + equipment) when the
  equipment block is malformed or references an invalid item id — matching the
  atomicity of the inventory block itself.

## API and data model

`EquipmentSlot` is a string enum (stable save keys). `EQUIPMENT_SLOT_ORDER`
fixes the parallel-array order of `EquipmentSnapshot.slots` so serialization is
deterministic and 116's `getArmorStacks` reads Head→Chest→Legs→Feet.

`setEquipment(slot, stack)`:
- stores `stack` (or null) after clamping `count`;
- copies `components` by reference (immutable `StackComponentMap`);
- returns the previous `ItemStack | null` (the swap primitive).

`getArmorStacks()` returns only non-null armor slots, in `ARMOR_SLOTS` order —
the exact input 116 needs to sum protection and resolve durability.

`EquipmentSnapshot = { version: 1, slots: (ItemStack|null)[] }` with
`slots.length === EQUIPMENT_SLOT_ORDER.length`. `serialize()` maps slots in order;
`validateSnapshot` rejects non-objects, wrong `version`, wrong array length, and
any non-null entry with a non-integer/non-positive/over-cap `count` or an
`isValidItem`-rejected id. `restore` calls `validateSnapshot` then populates.

## Control / data flow

Construction: `new Inventory()` (and any explicit ctor) creates
`this.equipment = new PlayerEquipment()`. No caller changes.

Save (unchanged call site): `Inventory.snapshot()` adds `equipment:
this.equipment.serialize()`; `Game.savePlayerState` serializes the whole
`InventorySnapshot` through 037 unchanged.

Load (unchanged call site): `Inventory.restore(snapshot.inventory, has,
maxDurability)` now:
1. validates the inventory block as before;
2. additionally, if `snapshot.equipment` is present, requires
   `PlayerEquipment.validateSnapshot(snapshot.equipment, has)` — else returns false
   (atomic, pre-mutation);
3. mutates inventory slots/storage as before;
4. if present, `this.equipment.restore(snapshot.equipment, has)` (already validated).

## Detailed behavior

- **Empty slot read**: `getEquipment(slot)` returns null when never set.
- **Equip / swap**: `setEquipment(slot, stack)` returns the prior stack; a later
  swap again returns this one. Setting `null` clears and returns the prior stack.
- **Clear**: `clear()` resets all five slots to null.
- **Armor accessor**: `getArmorStacks()` walks `ARMOR_SLOTS`, pushing only
  non-null stacks (in order); empty slots are skipped, preserving the fixed order.
- **Serialize**: `serialize()` returns a versioned snapshot with slots in
  `EQUIPMENT_SLOT_ORDER` (null for empty). Pure.
- **Restore atomicity**: `validateSnapshot` performs all checks without touching
  state; `restore` aborts (returns false) before any write if validation fails, so
  a corrupt payload never partially applies.

## Failure modes

- `restore` with `version !== 1` → false, no mutation.
- `restore` with wrong array length / non-array → false.
- `restore` with an invalid item id (per `isValidItem`) → false.
- `restore` with a non-null entry whose `count <= 0`, non-integer, or `> MAX_STACK`
  → false.
- `Inventory.restore` with malformed `equipment` → whole restore rejected, inventory
  left unchanged.
- `Inventory.restore` with no `equipment` field → equipment stays empty (default).
- `setEquipment` with a non-positive/over-cap count → clamped into `[1, MAX_STACK]`.

## Compatibility / migration

- `InventorySnapshot.equipment` is optional; pre-113 saves load with empty
  equipment. Post-113 saves carry it inside the unchanged 037 envelope. No registry
  or codec change.
- `EquipmentSnapshot` is new but lives entirely within the inventory snapshot; 131
  (autosave) will persist it for free through 037.

## Performance / resource constraints

- `PlayerEquipment` is five `Map`/array entries; get/set/clear/serialize are O(1)/
  O(5). No allocation beyond the small snapshot. Runs only on player action and
  load/save, never in the per-tick hot path.
- `Inventory.restore` equipment validation is O(5). Negligible.

## Testing seams

- `PlayerEquipment` is constructed standalone; tests drive get/set/clear/swap,
  `serialize` round-trip, and adversarial `restore` inputs (bad version, length,
  id, count) asserting atomicity.
- `Inventory` integration tests: new inventory starts empty-equipment; snapshot
  carries equipment; restore round-trips; malformed equipment rejects the whole
  restore; absent equipment stays empty.
- Component preservation tested by equipping a stack carrying `DAMAGE_COMPONENT` and
  asserting the component survives set/serialize/restore.

## Observability / debugging

- `Inventory.equipment` is readable for the debug overlay and e2e hooks
  (`window.__voxelGame.inventory.equipment`) without new surface beyond the field.

## Affected files / symbols

- NEW `src/inventory/Equipment.ts` (`EquipmentSlot`, `EQUIPMENT_SLOT_ORDER`,
  `ARMOR_SLOTS`, `EquipmentSnapshot`, `PlayerEquipment`).
- EDIT `src/inventory/Inventory.ts` (`equipment` field, `InventorySnapshot.equipment`,
  `snapshot()`, `restore()`).
- NEW `tests/unit/Equipment.test.ts`.

## Rejected alternatives

- *Store equipment on `Player`*: `Player` is a plain physics data holder with no
  inventory link; equipment belongs with the item store and its save path. Rejected.
- *Make `mainhand` a sixth equipment slot*: duplicates the selected hotbar slot and
  risks divergence; delegation is simpler and matches Minecraft's data model.
  Rejected.
- *Validate armor type at equip time*: `ItemTypeDefinition` has no slot/armor-type
  flag; strict enforcement is 116's scope. 113 stores any stack and only rejects
  unknown ids via `isValidItem`. Rejected for now.
- *Persist equipment as a separate top-level save key*: reuses the 037 envelope and
  risks two-phase load inconsistencies; nesting in `InventorySnapshot` keeps one
  atomic restore. Rejected.

## Downstream dependencies

- 116 (armor protection) consumes `getArmorStacks()` and the slot `components`.
- 144 (offhand shield) reads/writes the `Offhand` slot.
- 205 (equipment HUD) renders `Inventory.equipment`.
- 131 (autosave) persists the nested `equipment` through 037 unchanged.
