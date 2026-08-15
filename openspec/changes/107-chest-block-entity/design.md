# Design: 107-chest-block-entity

## Context/current state

- 106 `MenuTransaction` provides validated `MenuSlot`/`MenuCursor`/`ContainerMenu` and the
  deterministic immutable `applyMenuTransaction` (leftClick/rightClick/placeOne/quickMove).
  `MenuSlot.item` is a `string | null` key; `maxStack` is per-slot in [1,64].
- 052 `BlockEntityManager`/`BlockEntityInstance` provides positioned typed instances with
  per-chunk grouping, deterministic ticking, and 036-envelope serialize/deserialize.
- 018 registry already declares the `chest` block-entity type with `inventorySize: 27`,
  tickable false.
- `BlockId` uses 0-18 (13 reserved for crafting table); `ItemId` uses 0-24.
- Atlas tiles 0-26 are used; `ATLAS_ROWS = 4` supports tiles 0-63.

## Target state

A placeable/breakable chest block whose 27-slot inventory is modeled, serialized for
persistence, and interactable through the 106 transaction core, all exposed as a tested
block-entity module.

## Invariants

- A `ChestInventory` is exactly 27 validated `MenuSlot`s; construction never mutates inputs.
- Serialized inventory round-trips exactly; deserialization rejects every malformed shape.
- A chest menu is exactly 63 slots with `playerSlotStart = 27`; transactions never mutate the
  source menu.
- A chest `BlockEntityInstance` has `typeKey = 'chest'`, is not tickable, and its `data` is the
  serialized inventory envelope.
- Identical inputs produce identical outputs.

## API and data model

`src/world/ChestBlockEntity.ts`:

- Constants: `CHEST_BLOCK_ID = 19`, `CHEST_ITEM_ID = 25`, `CHEST_TYPE_KEY = 'chest'`,
  `CHEST_INVENTORY_SIZE = 27`, `PLAYER_INVENTORY_SIZE = 36`, `CHEST_MENU_SLOT_COUNT = 63`,
  `CHEST_PLAYER_SLOT_START = 27`, `DEFAULT_SLOT_MAX_STACK = 64`.
- `interface ChestInventory { slots: MenuSlot[] }` (length 27).
- `createChestInventory(): ChestInventory` — 27 empty slots (maxStack 64).
- `validateChestInventory(input: unknown): ChestInventory` — throws descriptively on any
  invalid shape/slot.
- `serializeChestInventory(inv: ChestInventory): unknown` — `{ slots: [{ item, count,
  maxStack }] }` envelope (036 opaque payload).
- `deserializeChestInventory(data: unknown): ChestInventory` — strict; throws on malformed.
- `createChestMenu(inv: ChestInventory, playerSlots: MenuSlot[], cursor?: MenuCursor):
  ContainerMenu` — slots = 27 chest + 36 player, `playerSlotStart = 27`; validates everything.
- `applyChestMenuTransaction(menu: ContainerMenu, txn: MenuTransaction): ContainerMenu` — 106
  `applyMenuTransaction`; out-of-bounds throws.
- `extractChestInventory(menu: ContainerMenu): ChestInventory` — first 27 slots.
- `extractPlayerSlots(menu: ContainerMenu): MenuSlot[]` — slots 27..62.
- `createChestBlockEntity(x, y, z, inventory?): BlockEntityInstance` — `typeKey 'chest'`,
  `tickable false`, `data` = serialized inventory.
- `readChestEntity(instance: BlockEntityInstance): ChestInventory` — throws unless typeKey is
  `chest`; deserializes `data`.
- `updateChestEntityInventory(instance, inventory): BlockEntityInstance` — new instance with
  the new payload (immutable).
- `chestEntityContents(inv: ChestInventory): { item: string; count: number }[]` — non-empty
  stacks in slot order.

Registry data: chest block (id 19; top/bottom/side tile 27, hardness 2.5, preferredTool Axe,
dropItem `minecraft:chest`, lootTable `loot/chest`); chest item (id 25; iconTile 27, stackSize
64, placeBlock `minecraft:chest`). Atlas adds an original procedural chest tile at index 27.

## Control/data flow

Place/break and open/move flows are future wiring; the core data flow is:
open -> `createChestMenu(entity inventory, player slots)` -> `applyChestMenuTransaction` ->
`extractChestInventory` -> `updateChestEntityInventory` -> serialize into the 052 instance ->
036 chunk record on save.

## Detailed behavior

- Validation mirrors 106 slot rules (integer counts, `[1,maxStack]` for filled slots, null
  item iff count 0, `maxStack` in [1,64]).
- Serialization stores the full slot array (lossless, order-stable).
- Menu index 0-26 = chest, 27-62 = player (hotbar first 9 then storage, mirroring
  `Inventory`), so quickMove first-fit targets the matching region.
- Entity reads validate `typeKey` and the payload; wrong typeKey or malformed payload throws
  (never silently returns garbage).

## Failure modes

Malformed payloads, wrong type keys, out-of-bounds indices, and invalid slot shapes throw
descriptive errors; valid inputs never throw.

## Compatibility/migration

Additive. No existing module behavior changes; new registry entries use currently-unused ids.

## Performance/resource constraints

All operations O(menu slots) worst case; no allocations beyond result objects.

## Testing seams

Pure functions over plain data; `BlockEntityManager` integration uses the 052 runtime;
registry cross-references validated via `validateItemBlockCrossReferences`.

## Observability/debugging

Plain data; tests assert exact inventories, menus, and payloads.

## Affected files/symbols

- `src/world/BlockRegistry.ts` (`BlockId.Chest`, chest definition)
- `src/inventory/ItemRegistry.ts` (`ItemId.Chest`, chest item definition)
- `src/rendering/TextureAtlas.ts` (`TILE_INDEX.chest`, painter)
- `src/world/ChestBlockEntity.ts` (NEW)
- `tests/unit/ChestBlockEntity.test.ts` (NEW)

## Rejected alternatives

- Storing item ids as numbers in the envelope: 106 slots are string-keyed; keeping the same
  type avoids conversion and validation drift.
- Wiring place/break into `World`/`PlayerInteraction`: deferred to the integration change that
  introduces the chest screen; keeps this change core-only like 105/106.

## Downstream dependencies

108 (double chest) composes two `ChestInventory` halves; 111 consumes `chestEntityContents`;
a future container screen consumes `createChestMenu`/`applyChestMenuTransaction`.
