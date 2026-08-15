# Design: 109-furnace-block-entity

## Context/current state

- 018 registry declares `furnace` (tickable true, no fixed inventory size); 052 provides
  `BlockEntityInstance` with a tick hook and 036-envelope chunk persistence; 107 established
  the slot-validation and menu-bridge conventions; 106 provides the transaction core.
- `BlockId` uses 0-19 (13 reserved for crafting table); `ItemId` uses 0-25; atlas tiles 0-27.

## Target state

A placeable/breakable furnace block whose state — 3 slots (input 0, fuel 1, output 2), burn and
smelt timers — is validated, ticked deterministically against an injectable context, persisted
through the 036 envelope, and interactable through the 106 menu bridge.

## Invariants

- A `FurnaceState` always holds 3 valid slots and integer times with
  `burnTime <= burnTimeTotal` and `smeltTime <= smeltTimeTotal` (both totals 0 imply the
  matching time 0).
- `tickFurnace` never mutates its input; identical inputs produce identical outputs.
- Fuel is consumed only when smelting can progress and the fuel has a positive burn value.
- Lit means `burnTime > 0`.
- Envelopes round-trip exactly; malformed payloads throw.
- The furnace menu is exactly 39 slots with `playerSlotStart = 3`.

## API and data model

`src/world/FurnaceBlockEntity.ts`:

- Constants: `FURNACE_BLOCK_ID = 20`, `FURNACE_ITEM_ID = 26`, `FURNACE_TYPE_KEY = 'furnace'`,
  `FURNACE_SLOT_COUNT = 3`, `FURNACE_MENU_SLOT_COUNT = 39`, `FURNACE_PLAYER_SLOT_START = 3`,
  `FURNACE_INPUT_SLOT = 0`, `FURNACE_FUEL_SLOT = 1`, `FURNACE_OUTPUT_SLOT = 2`.
- `interface FurnaceState { input: MenuSlot; fuel: MenuSlot; output: MenuSlot; burnTime:
  number; burnTimeTotal: number; smeltTime: number; smeltTimeTotal: number }`.
- `createFurnaceState(): FurnaceState` — empty slots, all times 0.
- `validateFurnaceState(input: unknown): FurnaceState` — strict; throws on any invalid
  shape/slot/time.
- `furnaceIsLit(state): boolean` — `burnTime > 0`.
- `interface FurnaceContext { fuelBurnTicks(item: string): number; cookTicks(item: string):
  number; resultOf(item: string): { item: string; count: number } | null }`.
- `tickFurnace(state: FurnaceState, ctx: FurnaceContext, ticks?: number): FurnaceState` —
  immutable; applies `ticks` (default 1, must be a positive integer) game ticks.
- `serializeFurnaceState(state): unknown` / `deserializeFurnaceState(data: unknown):
  FurnaceState` — 036 opaque envelope, lossless and strict.
- `createFurnaceMenu(state, playerSlots, cursor?): ContainerMenu` — 39 slots, input 0, fuel 1,
  output 2, player 3-38, `playerSlotStart` 3.
- `applyFurnaceMenuTransaction(menu, txn): ContainerMenu` — 106 `applyMenuTransaction`.
- `extractFurnaceSlots(menu): { input; fuel; output }` / `extractFurnacePlayerSlots(menu)` —
  reject foreign menus.
- `withFurnaceSlots(state, slots): FurnaceState` — new state with the same timers and new
  slots.
- `furnaceTickProgress(state): number` — `smeltTime / smeltTimeTotal` in [0,1] (0 when no
  smelt).
- `furnaceBurnFraction(state): number` — `burnTime / burnTimeTotal` in [0,1] (0 when 0).
- `createFurnaceBlockEntity(x, y, z, state?): BlockEntityInstance` — `typeKey 'furnace'`,
  `tickable true`, `data` = serialized state.
- `readFurnaceState(instance): FurnaceState` — throws unless typeKey is `furnace` and the
  payload is valid.
- `updateFurnaceState(instance, state): BlockEntityInstance` — new instance (immutable).

Registry data: furnace block (id 20; tile 28, hardness 3.5, preferredTool Pickaxe, dropItem
`minecraft:furnace`, lootTable `loot/furnace`); furnace item (id 26; iconTile 28, stackSize 64,
placeBlock furnace). Atlas adds an original procedural furnace tile at index 28.

## Control/data flow

Tick: `readFurnaceState(instance)` -> `tickFurnace(state, ctx, ticks)` ->
`updateFurnaceState(instance, next)` (runtime wiring later; the core is pure). Screen: menu
bridge transactions mutate slots; `withFurnaceSlots` keeps timers; envelope persists.

## Detailed behavior

Per tick (deterministic order):
1. Compute `canSmelt`: input present, `resultOf(input)` non-null, and the output accepts the
   result (empty, or same item with room).
2. If no input: `smeltTime = 0`.
3. If `canSmelt`:
   a. `smeltTimeTotal = cookTicks(input)`.
   b. If `burnTime === 0` and fuel present with `fuelBurnTicks(fuel) > 0`: consume one fuel
      (decrement/clear), `burnTime = burnTimeTotal = fuelBurnTicks(fuel)`.
   c. If `burnTime > 0`: `burnTime--`; `smeltTime = min(smeltTimeTotal, smeltTime + 1)`; when
      `smeltTime >= smeltTimeTotal` (total > 0): consume one input, merge the result into the
      output, reset `smeltTime = 0` and `smeltTimeTotal = 0`.
4. Otherwise (input present but blocked, or no fuel): paused — times and slots unchanged
   (except rule 2).

## Failure modes

Malformed states, payloads, menus, and invalid `ticks` throw descriptive errors; valid inputs
never throw.

## Compatibility/migration

Additive. New registry ids (block 20, item 26) and atlas tile 28 were unused.

## Performance/resource constraints

`tickFurnace` is O(ticks); each tick is O(1). No allocations beyond result objects.

## Testing seams

Pure functions; contexts injected as plain objects; manager round-trip via 052.

## Observability/debugging

Plain data; tests assert exact states, times, and envelopes.

## Affected files/symbols

- `src/world/FurnaceBlockEntity.ts` (NEW)
- `src/world/BlockRegistry.ts` (`BlockId.Furnace`, definition)
- `src/inventory/ItemRegistry.ts` (`ItemId.Furnace`, item definition)
- `src/rendering/TextureAtlas.ts` (`TILE_INDEX.furnace`, painter)
- `tests/unit/FurnaceBlockEntity.test.ts` (NEW); registry enumeration tests updated

## Rejected alternatives

- Hard-coding fuel/recipe values now: 110 owns those; injecting a context keeps 109 total and
  deterministic without speculative data.
- Mutable entity tick via a data setter on `BlockEntityInstance`: 052 instances are
  immutable; the pure `tickFurnace` + `updateFurnaceState` pattern matches 107.

## Downstream dependencies

110 supplies real `FurnaceContext` values and XP; a future screen consumes the menu bridge
and progress helpers; the lit state feeds block-state meshing later.
