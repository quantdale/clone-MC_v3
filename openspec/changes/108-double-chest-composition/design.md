# Design: 108-double-chest-composition

## Context/current state

- 107 `ChestBlockEntity` models a single 27-slot chest: `ChestInventory` with strict
  validation, 036-envelope serialization, a 63-slot menu (27 chest + 36 player,
  `playerSlotStart` 27), and 052 entity lifecycle.
- 106 `MenuTransaction` applies immutable deterministic transactions over `ContainerMenu`.
- In Minecraft a double chest is two adjacent chest block entities (each persisting its own 27
  slots) shown as one 54-slot menu; breaking one half leaves the other as a single chest.

## Target state

Deterministic composition of two adjacent single-chest inventories into a 54-slot menu, with
exact extraction back to per-half inventories and unpairing to the surviving half.

## Invariants

- Two chests pair only when horizontally adjacent (same Y, |dx|+|dz| == 1).
- Pair identity and half order are deterministic and independent of argument order.
- A double-chest menu is exactly 90 slots with `playerSlotStart = 54`; primary half 0-26,
  secondary half 27-53, player 54-89.
- Transactions never mutate the source menu or the source inventories.
- Each half is always a valid 27-slot `ChestInventory`; halves serialize exactly as 107.
- Identical inputs produce identical outputs.

## API and data model

`src/world/DoubleChest.ts`:

- Constants: `DOUBLE_CHEST_SLOT_COUNT = 54`, `DOUBLE_CHEST_MENU_SLOT_COUNT = 90`,
  `DOUBLE_CHEST_PLAYER_SLOT_START = 54`.
- `interface ChestPosition { x: number; y: number; z: number }`.
- `isHorizontalAdjacent(a: ChestPosition, b: ChestPosition): boolean`.
- `chestPairKey(a: ChestPosition, b: ChestPosition): string` — `"minX|minZ|maxX|maxZ"` style
  canonical key; equal for swapped arguments; only defined for adjacent positions (throws
  otherwise).
- `doubleChestOrder(a: ChestPosition, b: ChestPosition): [ChestPosition, ChestPosition]` —
  `[primary, secondary]`; primary = lexicographically smaller (x, then z); throws when not
  adjacent.
- `createDoubleChestMenu(primary: ChestInventory, secondary: ChestInventory, playerSlots:
  MenuSlot[], cursor?: MenuCursor): ContainerMenu` — 90 slots, `playerSlotStart` 54; validates
  all inputs; `primary` occupies 0-26, `secondary` 27-53.
- `extractDoubleChestHalves(menu: ContainerMenu): { primary: ChestInventory; secondary:
  ChestInventory }` — throws when the menu is not a double-chest menu.
- `unpairDoubleChest(removed: ChestPosition, a: ChestPosition, aInventory: ChestInventory,
  b: ChestPosition, bInventory: ChestInventory): ChestInventory` — validates that `removed` is
  one of the two positions and returns the other half's inventory; throws otherwise.
- `extractDoubleChestPlayerSlots(menu)` — slots 54-89.

## Control/data flow

Place two adjacent chests -> interaction wiring composes their two entities' inventories via
`createDoubleChestMenu` -> screen transactions via `applyMenuTransaction` (106) ->
`extractDoubleChestHalves` -> each half serialized and persisted per entity (107 envelope).
Break one half -> `unpairDoubleChest` yields the surviving half; the removed half's contents
flow to the future 111 drop path.

## Detailed behavior

- `isHorizontalAdjacent` requires distinct positions: same Y, |dx| == 1 xor |dz| == 1
  (equivalently |dx|+|dz| == 1).
- Ordering compares x first, then z, then y (y equal by adjacency): primary is the lower
  coordinate.
- `createDoubleChestMenu` validates both inventories (107 rules) and the 36 player slots
  (106 rules); the cursor defaults to empty.
- Extraction validates the menu shape (90 slots, `playerSlotStart` 54) before slicing.
- Unpairing accepts either argument order and both assignment orders of the halves.

## Failure modes

Non-adjacent pair operations, malformed menus, invalid slots, and unknown removed positions
throw descriptive errors; valid inputs never throw.

## Compatibility/migration

Additive. Halves persist with the 107 envelope; no migration of existing data.

## Performance/resource constraints

All operations O(menu slots); no allocations beyond result objects.

## Testing seams

Pure functions over plain data; manager round-trip uses the 052 runtime.

## Observability/debugging

Plain data; tests assert exact menus, keys, orders, and inventories.

## Affected files/symbols

- `src/world/DoubleChest.ts` (NEW)
- `tests/unit/DoubleChest.test.ts` (NEW)

## Rejected alternatives

- Merging halves into one 54-slot persisted record: diverges from Minecraft's per-entity
  persistence and would break 107 saves.
- Facing-aware primary selection in this change: requires input wiring; deferred, the
  deterministic coordinate order is the fallback rule.

## Downstream dependencies

109+ unaffected; a future chest screen consumes `createDoubleChestMenu` for paired layouts;
111 consumes the removed half's contents on unpair-break.
