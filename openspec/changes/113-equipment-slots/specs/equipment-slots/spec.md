# Spec: equipment-slots

## Contract

The player's worn equipment MUST be representable as durable, serializable state
integrated with the existing `Inventory`. `PlayerEquipment` MUST own exactly five
slots — `Head`, `Chest`, `Legs`, `Feet`, `Offhand` — each holding an `ItemStack |
null`. The *mainhand* MUST be the selected hotbar slot and MUST NOT be a stored
equipment slot. `Inventory` MUST own an `equipment` field, MUST include it in
`snapshot()`, and MUST restore it from `restore()` atomically with the rest of the
inventory. Equipment state MUST round-trip through the 037 save envelope and MUST
preserve item components (armor durability, tool wear). This change is state and
integration only: it MUST NOT implement protection math, shield blocking, or HUD
rendering.

## Definitions

- **Equipment slot**: one of `Head`, `Chest`, `Legs`, `Feet`, `Offhand`. Each holds
  an `ItemStack | null` (null = empty).
- **Armor slot**: the four slots `Head`, `Chest`, `Legs`, `Feet` (excludes
  `Offhand`). Consumed by 116.
- **Mainhand**: the `Inventory`'s currently selected hotbar slot
  (`inventory.slots[inventory.selected]`). Delegated, not stored in equipment.
- **Equip**: `setEquipment(slot, stack)` storing a stack (or `null` to clear),
  returning the previous stack.

## Invariants

- E1. There are exactly five equipment slots; the mainhand is not among them.
- E2. Every slot holds `ItemStack | null`; null means empty. A stored stack preserves
  its `components` map verbatim.
- E3. `setEquipment` clamps `count` into `[1, MAX_STACK]`; it replaces the prior
  content and returns the previous `ItemStack | null`.
- E4. `serialize()` is pure. `restore()` is atomic: on any invalid input it returns
  `false` and changes no slot.
- E5. `Inventory.restore` rejects the whole restore (inventory + equipment) when the
  equipment block is malformed or references an invalid item id.
- E6. `getArmorStacks()` returns non-null armor stacks only, in `Head, Chest, Legs,
  Feet` order.

## Requirements

### Requirement: slot model and mainhand delegation

`PlayerEquipment` MUST expose exactly the five slots `Head`, `Chest`, `Legs`,
`Feet`, `Offhand`. The mainhand MUST be the selected hotbar slot and MUST NOT be a
stored equipment slot. New equipment MUST start empty (all slots null).

#### Scenario: equipment starts empty with five slots
- **GIVEN** a freshly constructed `PlayerEquipment` (and a freshly constructed
  `Inventory`)
- **WHEN** `getEquipment` is called for each of `Head`, `Chest`, `Legs`, `Feet`,
  `Offhand`
- **THEN** every slot returns null and no sixth (mainhand) slot exists

#### Scenario: mainhand is the selected hotbar slot
- **GIVEN** an `Inventory` with a non-empty selected hotbar slot
- **WHEN** the mainhand is read
- **THEN** it is `inventory.slots[inventory.selected]` and is not duplicated into
  `inventory.equipment`

### Requirement: get equipment

`getEquipment(slot)` MUST return the stored `ItemStack` for an occupied slot and
MUST return null for an empty slot.

#### Scenario: empty slot returns null
- **GIVEN** a `PlayerEquipment` that has never been written
- **WHEN** `getEquipment(Head)` is called
- **THEN** the result is null

#### Scenario: occupied slot returns the stored stack
- **GIVEN** `setEquipment(Chest, { id: 12, count: 1 })` was called
- **WHEN** `getEquipment(Chest)` is called
- **THEN** the result is `{ id: 12, count: 1 }`

### Requirement: set / swap equipment

`setEquipment(slot, stack)` MUST store `stack` (or null to clear), replace any
existing content, and return the previous `ItemStack | null`. It MUST clamp `count`
into `[1, MAX_STACK]` and MUST preserve `components`.

#### Scenario: equip stores and returns the previous (empty) slot
- **GIVEN** an empty `Head` slot
- **WHEN** `setEquipment(Head, { id: 1, count: 1 })` is called
- **THEN** the returned previous value is null and `getEquipment(Head)` is
  `{ id: 1, count: 1 }`

#### Scenario: re-equip swaps and returns the old stack
- **GIVEN** `Head` holds `{ id: 1, count: 1 }`
- **WHEN** `setEquipment(Head, { id: 2, count: 1 })` is called
- **THEN** the returned previous value is `{ id: 1, count: 1 }` and `getEquipment(Head)`
  is `{ id: 2, count: 1 }`

#### Scenario: setting null clears and returns the previous
- **GIVEN** `Feet` holds `{ id: 3, count: 1 }`
- **WHEN** `setEquipment(Feet, null)` is called
- **THEN** the returned previous value is `{ id: 3, count: 1 }` and `getEquipment(Feet)`
  is null

#### Scenario: components are preserved through equip
- **GIVEN** a stack `s` carrying `DAMAGE_COMPONENT` (damaged tool)
- **WHEN** `setEquipment(Offhand, s)` is called and `getEquipment(Offhand)` is read
- **THEN** the returned stack carries the same `DAMAGE_COMPONENT` value

#### Scenario: count is clamped into the valid range
- **GIVEN** a corrupt stack with `count: 0` (or `count: 999`)
- **WHEN** `setEquipment(Head, { id: 1, count: 0 })` is called
- **THEN** the stored `count` is clamped to `1` (or `MAX_STACK` for the over-cap case)

### Requirement: clear

`clear()` MUST reset all five slots to null.

#### Scenario: clear empties every slot
- **GIVEN** `Head` holds `{ id: 1, count: 1 }` and `Offhand` holds
  `{ id: 2, count: 1 }`
- **WHEN** `clear()` is called
- **THEN** `getEquipment(slot)` returns null for all five slots

### Requirement: armor stack accessor

`getArmorStacks()` MUST return the non-null armor slots only, in `Head, Chest,
Legs, Feet` order.

#### Scenario: non-null armor returned in fixed order
- **GIVEN** `Chest` holds `{ id: 12, count: 1 }`, `Feet` holds `{ id: 3, count: 1 }`,
  `Head` and `Legs` are empty, `Offhand` holds `{ id: 2, count: 1 }`
- **WHEN** `getArmorStacks()` is called
- **THEN** the result is `[{ id: 12, count: 1 }, { id: 3, count: 1 }]` (Head and
  Legs skipped; Offhand excluded)

### Requirement: serialize and restore

`serialize()` MUST return a versioned (`version: 1`) snapshot whose `slots` array is
parallel to `EQUIPMENT_SLOT_ORDER` (length 5). `restore(data, isValidItem)` MUST
populate the slots from a valid snapshot and MUST return `true`; on any malformed
input (wrong version, wrong array length, invalid item id, non-positive/over-cap
count) it MUST return `false` without mutating any slot. `restore` MUST round-trip a
`serialize()` result.

#### Scenario: serialize round-trips through restore
- **GIVEN** equipment with `Head = { id: 1, count: 1 }` and `Offhand = { id: 2, count: 1 }`
- **WHEN** `restore(serialize(), () => true)` is applied to a fresh `PlayerEquipment`
- **THEN** the new instance equals the original for those slots and `restore` returns `true`

#### Scenario: wrong version is rejected atomically
- **GIVEN** a snapshot with `version: 2`
- **WHEN** `restore(snapshot, () => true)` is called on equipment holding
  `{ id: 1, count: 1 }`
- **THEN** the result is `false` and the `Head` slot is unchanged (`{ id: 1, count: 1 }`)

#### Scenario: wrong array length is rejected
- **GIVEN** a snapshot whose `slots` has 4 entries
- **WHEN** `restore(snapshot, () => true)` is called
- **THEN** the result is `false` and no slot changes

#### Scenario: invalid item id is rejected
- **GIVEN** a snapshot whose `Head` entry has id `999` (unknown to `isValidItem`)
- **WHEN** `restore(snapshot, (id) => id !== 999)` is called on empty equipment
- **THEN** the result is `false` and all slots remain null

#### Scenario: non-positive or over-cap count is rejected
- **GIVEN** a snapshot whose `Head` entry is `{ id: 1, count: 0 }` (or `{ id: 1, count: 65 }`)
- **WHEN** `restore(snapshot, () => true)` is called
- **THEN** the result is `false` and no slot changes

### Requirement: inventory integration

`Inventory` MUST own an `equipment` field initialized empty. `snapshot()` MUST
include `equipment: PlayerEquipment.serialize()`. `restore()` MUST restore equipment
when present, MUST leave it empty when absent, and MUST reject the entire restore
(inventory unchanged) when the equipment block is malformed or references an invalid
item id.

#### Scenario: new inventory starts empty-equipment
- **GIVEN** a freshly constructed `Inventory`
- **WHEN** `inventory.equipment.getEquipment` is read for every slot
- **THEN** all slots are null

#### Scenario: snapshot carries equipment and round-trips
- **GIVEN** `inventory.equipment.setEquipment(Head, { id: 1, count: 1 })`
- **WHEN** `snapshot()` is taken, then `restore(snap, has, maxDur)` is applied to a
  fresh `Inventory`
- **THEN** the fresh inventory's `Head` slot is `{ id: 1, count: 1 }` and `restore`
  returns `true`

#### Scenario: restore without equipment leaves equipment empty
- **GIVEN** a legacy `InventorySnapshot` with no `equipment` field
- **WHEN** `restore(snapshot, has, maxDur)` is applied to a fresh `Inventory`
- **THEN** `restore` returns `true` and `inventory.equipment` is empty

#### Scenario: malformed equipment rejects the whole restore
- **GIVEN** an `InventorySnapshot` whose `equipment` block has `version: 2` but whose
  inventory block is valid
- **WHEN** `restore(snapshot, has, maxDur)` is applied to an `Inventory` holding a
  non-default hotbar
- **THEN** `restore` returns `false`, the `equipment` is unchanged, and the inventory
  slots are unchanged (atomic)

## Error and failure behavior

- `restore`/`validateSnapshot` reject `version !== 1`, non-array/wrong-length `slots`,
  unknown item ids (per `isValidItem`), and non-positive/over-cap `count`; rejection
  is atomic (no slot mutated).
- `Inventory.restore` rejects the entire restore when the equipment block fails
  validation, leaving both inventory and equipment unchanged.
- Absent `equipment` in a saved snapshot loads as empty equipment (backward
  compatible).
- `setEquipment` clamps `count` into `[1, MAX_STACK]`; it never stores a corrupt
  count.

## Performance and resource bounds

- `PlayerEquipment` holds five entries; get/set/clear/serialize are O(1)/O(5) with
  no hot-path use. `Inventory.restore` equipment validation is O(5). Negligible
  versus the existing inventory restore.

## Compatibility and migration

- `InventorySnapshot.equipment` is optional. Pre-113 saves load empty equipment.
  Post-113 saves nest the equipment snapshot inside the unchanged 037 envelope; no
  registry/codec change. 131 (autosave) will persist it for free.

## Security and integrity

- Atomic equipment restore prevents a corrupt equipment block from partially applying
  and desynchronizing equipment from the inventory.
- Item-component preservation (durability/wear) prevents silent loss of armor/tool
  state across equip and save/load.
- `isValidItem` rejects unknown ids, so a tampered save cannot inject unregistered
  items into equipment.

## Observability

- `Inventory.equipment` is directly readable (e.g. debug overlay / e2e hook
  `window.__voxelGame.inventory.equipment`); `serialize()` exposes the full state for
  save inspection.

## Verification mapping

| Requirement | Test |
|---|---|
| slot model and mainhand delegation | Equipment.test.ts: empty five slots; inventory mainhand delegation |
| get equipment | Equipment.test.ts: empty→null; occupied→stack |
| set / swap equipment | Equipment.test.ts: equip returns previous; re-equip swaps; null clears; components preserved; count clamp |
| clear | Equipment.test.ts: clear empties all |
| armor stack accessor | Equipment.test.ts: getArmorStacks order/skip |
| serialize and restore | Equipment.test.ts: round-trip; wrong version; wrong length; invalid id; bad count |
| inventory integration | Equipment.test.ts: new inventory empty; snapshot round-trip; absent equipment; malformed rejects whole |
