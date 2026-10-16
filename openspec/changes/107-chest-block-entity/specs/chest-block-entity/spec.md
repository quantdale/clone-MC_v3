# Spec: chest-block-entity

## Contract

`createChestInventory` MUST build a 27-slot inventory of empty slots (maxStack 64).
`validateChestInventory` MUST reject every malformed shape and slot. Serialization MUST be
lossless and round-trip exact; `deserializeChestInventory` MUST throw on malformed payloads.
`createChestMenu` MUST build a 63-slot menu (27 chest + 36 player) with `playerSlotStart` 27 and
validate every slot and the cursor. `applyChestMenuTransaction` MUST apply 106 semantics
immutably and deterministically and throw on out-of-bounds indices. `extractChestInventory`/
`extractPlayerSlots` MUST return the matching regions. `createChestBlockEntity` MUST build a 052
`BlockEntityInstance` with typeKey `chest`, tickable false, and `data` = the serialized
inventory. `readChestEntity` MUST throw unless the typeKey is `chest` and the payload is valid.
`updateChestEntityInventory` MUST return a NEW instance. `chestEntityContents` MUST list
non-empty stacks in slot order.

## Definitions

- **ChestInventory**: exactly 27 validated `MenuSlot`s.
- **Chest menu**: 63 slots; indices 0-26 chest, 27-62 player (9 hotbar then 27 storage);
  `playerSlotStart` 27.
- **Envelope**: `{ slots: [{ item, count, maxStack }] }` (the 036 opaque payload).
- **CHEST_BLOCK_ID**: 19. **CHEST_ITEM_ID**: 25. **CHEST_TYPE_KEY**: `'chest'`.

## Invariants

- Chest inventories always hold exactly 27 valid slots; updates are immutable.
- Envelopes round-trip exactly; malformed payloads throw, never coerce.
- Transactions never mutate the source menu; identical inputs produce identical results.
- Entity reads reject wrong type keys and malformed payloads.

## Requirements

### Requirement: inventory construction and validation
`createChestInventory`/`validateChestInventory` MUST implement the documented rules.

#### Scenario: empty creation
- **GIVEN** nothing
- **WHEN** `createChestInventory` runs
- **THEN** the inventory has 27 empty slots, each with maxStack 64.

#### Scenario: malformed shapes
- **GIVEN** arrays of length 26 or 28, non-objects, or missing slot arrays
- **WHEN** validation runs
- **THEN** a descriptive error is thrown.

#### Scenario: malformed slots
- **GIVEN** a slot with count 0 and a non-null item, count > maxStack, maxStack 0 or 65,
  negative counts, or non-integer counts
- **WHEN** validation runs
- **THEN** a descriptive error is thrown.

### Requirement: serialization
Serialization MUST be lossless and exact.

#### Scenario: round-trip
- **GIVEN** an empty and a filled inventory
- **WHEN** each is serialized then deserialized
- **THEN** the result equals the input exactly.

#### Scenario: malformed payloads
- **GIVEN** non-object data, a non-array slots field, a wrong-length slot list, or invalid
  slots
- **WHEN** deserialization runs
- **THEN** a descriptive error is thrown.

### Requirement: chest menu bridge
The menu MUST expose chest and player regions with 106 semantics.

#### Scenario: menu construction
- **GIVEN** a chest inventory and 36 player slots
- **WHEN** `createChestMenu` runs
- **THEN** the menu has 63 slots, `playerSlotStart` 27, chest region 0-26, player region 27-62,
  and an empty cursor; invalid player slots or cursors throw.

#### Scenario: transactions across the boundary
- **GIVEN** a chest menu
- **WHEN** leftClick/rightClick/placeOne/quickMove run (pickup, merge, swap, split-half,
  place-one, first-fit quick-move both directions)
- **THEN** results follow 106 semantics, the source menu is unchanged, and
  `extractChestInventory`/`extractPlayerSlots` reflect the new regions.

#### Scenario: out-of-bounds
- **GIVEN** a chest menu
- **WHEN** a transaction targets index -1 or 63
- **THEN** a descriptive error is thrown.

### Requirement: entity lifecycle
The 052 instance MUST carry the chest payload.

#### Scenario: create/read/update
- **GIVEN** an inventory
- **WHEN** `createChestBlockEntity(x, y, z, inv)` runs and is read
- **THEN** the instance has typeKey `chest`, is not tickable, and `readChestEntity` returns the
  exact inventory; `updateChestEntityInventory` returns a NEW instance with the new inventory
  and the old instance is unchanged.

#### Scenario: wrong type key
- **GIVEN** an instance with a non-chest typeKey
- **WHEN** `readChestEntity` runs
- **THEN** a descriptive error is thrown.

#### Scenario: malformed payload
- **GIVEN** an instance whose payload is not a valid envelope
- **WHEN** `readChestEntity` runs
- **THEN** a descriptive error is thrown.

### Requirement: contents extraction
`chestEntityContents` MUST list non-empty stacks in slot order.

#### Scenario: mixed inventory
- **GIVEN** an inventory with item A x3 at slot 0, empty slot 1, item B x1 at slot 2
- **WHEN** `chestEntityContents` runs
- **THEN** the list is `[A x3, B x1]` in order; empty slots are skipped.

### Requirement: manager chunk round-trip
Chest entities MUST survive a 052 chunk serialize/deserialize.

#### Scenario: chunk save/load
- **GIVEN** a `BlockEntityManager` with a chest entity at a position
- **WHEN** `serializeChunk` then `deserializeChunk` run
- **THEN** `readChestEntity` on the restored instance returns the exact inventory.

### Requirement: registry integration
The chest block and item MUST be registered and cross-validated.

#### Scenario: block and item definitions
- **GIVEN** the default block and item registries
- **WHEN** chest id 19 / item id 25 are looked up and `validateItemBlockCrossReferences` runs
- **THEN** the block is solid, breakable, axe-preferred, hardness 2.5, drops the chest item;
  the item places the chest block; no cross-reference errors are thrown.

## Error and failure behavior

All validation, deserialization, out-of-bounds, and wrong-type errors throw descriptive
errors; valid inputs never throw.

## Performance and resource bounds

All operations O(menu slots); no allocations beyond result objects.

## Compatibility and migration

Additive. New registry ids (block 19, item 25) and atlas tile 27 were unused.

## Security and integrity

Payloads are validated strictly on read; garbage never reaches the menu layer.

## Observability

Plain data; tests assert exact inventories, menus, envelopes, and entities.

## Verification mapping

- `tests/unit/ChestBlockEntity.test.ts` — construction/validation matrix, serialization
  round-trips and rejects, menu transactions across the chest/player boundary, immutability,
  out-of-bounds throws, entity lifecycle, wrong-type and malformed-payload rejects, contents
  extraction, manager chunk round-trip, registry cross-references.
