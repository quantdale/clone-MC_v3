# Design: 125-crop-growth

## Context / current state
- `BlockTypeDefinition` already carries optional `propertySchema` and `defaultState`;
  `BlockRegistry.BlockId` ends at `Bookshelf = 33`; `ItemId` ends at `EnchantingTable = 31`.
- `BlockStateRegistry` enumerates canonical states from property schemas; `lookup(blockId,
  assignment)` resolves a state for a complete assignment and `getDefaultState(blockId)`
  returns the default. Every current block resolves to `EMPTY_SCHEMA` (one state each), and
  `tests/unit/BlockStateRegistry.test.ts` asserts that invariant.
- `RandomTickSelector.selectEligible(sectionX, sectionY, sectionZ, tick, seed, isEligible,
  count)` deterministically picks candidate cells in a 16×16×16 section, bounded by
  `maxEligibleAttempts`.
- `BlockBehaviorRegistry.getBehavior(blockKey)` resolves a `BlockBehavior`; `BlockWorldAccess`
  currently exposes only `getBlockId`/`setBlockId`. `DEFAULT_BLOCK_BEHAVIOR` has no hooks.
- `World` stores block **ids** in `Chunk.blocks: Uint8Array` and tracks an edit overlay that
  survives chunk unload/reload within a session. There is no per-cell block-state storage.
- `PlayerInteraction.finishBreak` routes drops through `LootTable.evaluate` with a
  `LootContext` carrying `blockId`/`toolItemId`/`itemRegistry`.
- `Game.update` already ticks `itemEntities`, `xpOrbs`, survival, and effects inside a
  `simulationActive` block; there is no block random-tick dispatch and no tick counter.

## Target state
- `BlockId.Wheat = 34` is a non-solid, non-opaque, breakable block with
  `propertySchema { age: integer 0..7 }` and default `{ age: 0 }`; `BlockStateRegistry`
  enumerates exactly 8 wheat states. `ItemId.WheatSeeds = 32` places the wheat block;
  `ItemId.Wheat = 33` is a non-placeable item.
- `CropGrowth` is a pure module (`MAX_AGE`, `isMature`, `nextCropAge`).
- `CropBlockBehavior.onRandomTick` advances a crop's age by one per random tick until
  mature and then stops, writing through `BlockWorldAccess.setBlockState`.
- `World` (and `WorldAccess`) expose `getBlockState`/`setBlockState`; `setBlockState` writes
  the block id through the normal path and records the resolved state id in an in-memory
  overlay; `getBlockState` returns the overlay state or the block's default state.
- `Game` owns a `BlockBehaviorRegistry`, a `RandomTickSelector`, and a `WorldBlockAccess`
  adapter; the per-tick simulation iterates simulating loaded chunks, calls `selectEligible`
  with a crop predicate, and invokes each selected block's `onRandomTick`.
- `LootContext` gains optional `properties`; a `loot/wheat` table drops seeds always and
  wheat only when `age === '7'`. `PlayerInteraction.finishBreak` populates `properties` from
  the broken block's state.

## Invariants
- Wheat has exactly 8 canonical states (`age` in 0..7); the default state is age 0.
- `nextCropAge(age)` returns `min(7, age + 1)` for `0 <= age <= 7`; `isMature(age)` is true
  iff `age >= 7`.
- A crop at `age >= 7` receives no further growth writes.
- `CropBlockBehavior.onRandomTick` MUST NOT throw; malformed/absent age reads are treated as
  age 0 (or skipped).
- A `setBlock` write clears the in-memory state override for that cell so stale state never
  outlives the block it describes.
- `World.setBlockState` only records state for a valid, registered block at in-bounds
  coordinates; otherwise it is a no-op.

## API and data model
```ts
// src/world/CropGrowth.ts
export const MAX_AGE = 7;
export function isMature(age: number): boolean;
export function nextCropAge(age: number): number;

// src/simulation/CropBehavior.ts
export class CropBlockBehavior implements BlockBehavior {
  constructor(readonly blockId: number);
  onRandomTick(ctx: BlockBehaviorContext): void;
}

// src/simulation/BlockBehavior.ts (extended)
export interface BlockWorldAccess {
  getBlockId(x, y, z): number;
  setBlockId(x, y, z, id): void;
  getBlockState?(x, y, z): BlockState;
  setBlockState?(x, y, z, blockId: number, properties: Record<string, boolean | number | string>): void;
}

// src/simulation/WorldBlockAccess.ts (new)
export class WorldBlockAccess implements BlockWorldAccess { /* wraps World */ }

// src/world/WorldAccess.ts (extended)
export interface WorldAccess {
  getBlock(x, y, z): number;
  setBlock(x, y, z, id): void;
  isSolid(x, y, z): boolean;
  getBlockState?(x, y, z): BlockState;
  setBlockState?(x, y, z, blockId: number, properties: Readonly<Record<string, boolean | number | string>>): void;
}

// src/world/World.ts (extended)
setBlockState(x, y, z, blockId, properties): void;
getBlockState(x, y, z): BlockState;
forEachLoadedChunk(fn: (cx, cy, cz) => void): void;

// src/inventory/LootTable.ts (extended)
export interface LootContext { blockId; toolItemId; itemRegistry; properties?: Readonly<Record<string, string>>; }
```
Sketches describe intent and do not override normative spec requirements.

## Control / data flow
1. Player places `wheat_seeds` → existing `placeBlock` writes `BlockId.Wheat` (default age 0).
2. Each `simulationActive` frame, `Game.update` increments its tick counter and iterates
   simulating chunks; for each 16×16×16 section it calls `randomTickSelector.selectEligible`
   with a predicate that is true only for blocks whose registered behavior has `onRandomTick`.
3. For each selected cell, `Game` resolves the block's behavior and calls
   `behavior.onRandomTick({ x, y, z, tick, world: worldBlockAccess })`.
4. `CropBlockBehavior.onRandomTick` reads `age`, computes the next age, and calls
   `world.setBlockState(blockId, { age: next }, x, y, z)` unless mature.
5. `World.setBlockState` calls `setBlock` (writes block id, marks dirty/mesh, records edit)
   then records the resolved state id in the state overlay.
6. On harvest, `PlayerInteraction.finishBreak` reads the block state's `age` into
   `LootContext.properties`; `LootTable.evaluate` applies the `loot/wheat` table (pool A:
   seeds always; pool B: wheat when `age === '7'`).

## Detailed behavior
- `nextCropAge(age)`: returns `0` for `age < 0` or non-integer; otherwise
  `Math.min(MAX_AGE, age + 1)`. This is deterministic and reaches maturity within ≤ 7 random
  ticks.
- `CropBlockBehavior.onRandomTick`: guards on the presence of both `getBlockState` and
  `setBlockState`; verifies `getBlockId` matches `this.blockId`; parses `age` from
  `getProperty('age')` (missing → 0); clamps illegal parsed values to 0; returns when mature;
  otherwise writes `{ age: nextCropAge(age) }`.
- `World.setBlockState` resolves the target state with `stateRegistry.lookup(blockId,
  properties)` (throws on illegal assignment), writes the block id via `setBlock`, then
  records `state.id` in `stateOverlay[chunkKey][cellIndex]`. Invalid coords/block id no-op.
- `World.getBlockState` returns the recorded state if present, else
  `stateRegistry.getDefaultState(getBlock(x, y, z))`.
- `World.setBlock` deletes any state-overlay entry for the written cell so the overlay stays
  consistent with the stored block id.
- Wheat loot table: pool A `{ rolls: 1, entries: [{ item: wheat_seeds, 1..1 }] }`; pool B
  `{ rolls: 1, entries: [{ item: wheat, 1..1, conditions: [ctx => ctx.properties?.age === '7'] }] }`.
  In `buildCurrentLootTables`, wheat is special-cased (like leaves) instead of the generic
  single `dropItem` drop.

## Failure modes
- Malformed `age` state read → treated as age 0; no throw.
- `getBlockState`/`setBlockState` absent on the access → behavior returns without writing.
- Illegal `setBlockState` assignment (e.g. `age: 8`) → `lookup` throws; the crop behavior only
  produces legal ages, and Game wiring does not swallow it (behavior is the only caller).
- Out-of-bounds or unregistered writes → `setBlockState` no-ops.
- A cell written by `setBlock` has its stale state override cleared.

## Compatibility / migration
- New ids additive; no existing id changes. `LootContext.properties` optional. Access
  interface methods optional. No snapshot format change; age is not persisted across reload
  (documented limitation).

## Performance / resource constraints
- Random-tick dispatch cost is bounded by `selectEligible` (3 cells × up to 256 candidate
  attempts per section) and only runs over simulating chunks when `simulationActive`.
- `getBlockState` is O(1) (overlay map lookup then default-state map lookup).
- State overlay size is bounded by the number of stateful cells the player grows (only wheat),
  negligible in practice; cleared on `dispose`.

## Testing seams
- `CropGrowth` is pure: unit-test `nextCropAge`/`isMature` directly.
- `CropBlockBehavior` is tested against a fake `BlockWorldAccess` implementing
  `getBlockState`/`setBlockState`, so no DOM/World needed.
- Random-tick eligibility is tested with `RandomTickSelector.selectEligible` over a synthetic
  crop predicate.
- Wheat state enumeration is tested via `createDefaultBlockStateRegistry`.
- Crop loot is tested via `LootTableRegistry`/`evaluate` with `LootContext.properties`.

## Observability / debugging
- Wheat debug state is available via `BlockState.debugString()` (`minecraft:wheat[age=n]`).
- `getBlockState` exposes the live age for any world cell.

## Affected files / symbols
- `src/world/BlockRegistry.ts` — `BlockId.Wheat = 34`, wheat definition + schema.
- `src/inventory/ItemRegistry.ts` — `ItemId.WheatSeeds = 32`, `ItemId.Wheat = 33`.
- `src/world/CropGrowth.ts` (NEW).
- `src/simulation/CropBehavior.ts` (NEW).
- `src/simulation/WorldBlockAccess.ts` (NEW).
- `src/simulation/BlockBehavior.ts` — extend `BlockWorldAccess`.
- `src/world/WorldAccess.ts` — extend with optional state methods.
- `src/world/World.ts` — `stateRegistry` (optional), `stateOverlay`, `setBlockState`,
  `getBlockState`, `forEachLoadedChunk`, `setBlock` state-clear.
- `src/inventory/LootTable.ts` — `LootContext.properties`, wheat table in
  `buildCurrentLootTables`.
- `src/player/PlayerInteraction.ts` — populate `LootContext.properties` in `finishBreak`.
- `src/engine/Game.ts` — build state registry + behavior registry + selector + adapter; wire
  random-tick dispatch and a tick counter.
- Tests: `tests/unit/CropGrowth.test.ts`, `tests/unit/CropBehavior.test.ts`,
  `tests/unit/WorldBlockState.test.ts`, `tests/unit/WheatLoot.test.ts`, `tests/unit/CropRandomTick.test.ts`
  (NEW); update `BlockRegistry.test.ts`, `BlockStateRegistry.test.ts`,
  `BlockItemSeparation.test.ts`, `LootTable.test.ts`.

## Rejected alternatives
- **Store `BlockStateId` directly in `Chunk.blocks`:** would corrupt the block-id-based
  meshing/collision/save paths (state ids are dense and not equal to block ids); rejected in
  favor of a separate in-memory overlay.
- **Persist state in the edit snapshot now:** needs a snapshot format/version change and a
  migration; deferred to keep this change narrow and storage-safe.
- **Central block switch in Game for growth:** rejected; uses the change-050 behavior registry
  dispatch instead.

## Downstream dependencies
- Change 126 (`farmland-moisture`) will gate crop growth/support on farmland state.
- Change 127 (`bonemeal-growth-hooks`) will reuse `nextCropAge`/`isMature`.
- A later storage change may migrate the state overlay into the persistent snapshot.
