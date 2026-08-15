# Design: 126-farmland-moisture

## Context / current state
- `BlockId` ends at `Wheat = 34`; `ItemId` ends at `Wheat = 33`. The next free block id is `35`;
  the next free item id is `34`.
- `BlockStateRegistry` enumerates canonical states from `BlockPropertySchema`; `World` tracks
  stateful block states (wheat `age`) in an in-memory overlay via `setBlockState`/`getBlockState`.
- `CropBlockBehavior` (change 125) advances a crop's `age` by one per random tick via
  `BlockWorldAccess.setBlockState`, using the pure `nextCropAge`/`isMature` model.
- `Game` owns a `BlockBehaviorRegistry`, a `RandomTickSelector`, and a `WorldBlockAccess`;
  `tickRandomBlocks` selects cells whose registered behavior exposes `onRandomTick` (predicate
  currently named `isCropAt`) and invokes it. Only `onRandomTick` is dispatched; there is no
  neighbor-change dispatch.
- `PlayerPhysics.resolve` detects a downward (landing) collision on the Y axis (sets `onGround`,
  records `landingDistance`); `PlayerPhysics` already imports `BlockId` and holds a `WorldAccess`.

## Target state
- `BlockId.Farmland = 35` is a solid, opaque, breakable, shovel-minable block with
  `propertySchema { moisture: integer 0..7 }` and default `{ moisture: 0 }`; it drops dirt. No
  farmland item is added. `BlockStateRegistry` enumerates exactly 8 farmland states.
- `src/simulation/FarmlandBehavior.ts` exposes the pure helpers `isFarmlandHydrated`,
  `nextMoisture`, `parseMoisture`, `isCropAbove`, `hasSolidCoverAbove`, `shouldRevertToDirt`, and
  `trampleFarmland`, plus a `FarmlandBlockBehavior` with `onRandomTick` and `onNeighborChanged`.
- `src/simulation/CropBehavior.ts` exports `growCropAt`; `CropBlockBehavior.onRandomTick`
  delegates to it; `FarmlandBlockBehavior` reuses it for the crop above when hydrated.
- `Game` registers `FarmlandBlockBehavior` against the farmland key so random-tick dispatch
  reaches it; the eligibility predicate is renamed `isRandomTickEligible`.
- `PlayerPhysics.resolve` calls `trampleFarmland` when the player lands on a farmland voxel.

## Invariants
- Farmland has exactly 8 canonical states (`moisture` in `0..7`); the default state is moisture 0.
- `moisture` never leaves `[0, 7]`: `nextMoisture(m, hydrated)` returns `min(7, m + 1)` when
  hydrated and `max(0, m - 1)` when not.
- Hydration is true iff any `BlockId.Water` exists at `(x + dx, y + dy, z + dz)` with
  `|dx| <= 4`, `|dz| <= 4`, `dy in {-1, 0}` (documented, tested canonical rule).
- Farmland reverts to dirt only when (a) it is dry (`moisture <= 0`) and no wheat crop is
  directly above, or (b) a solid cover (non-air, non-wheat) is directly above. It never reverts
  while wheat is planted on top.
- `trampleFarmland` is a no-op when the target cell is not farmland; it writes `BlockId.Dirt`
  otherwise.
- `FarmlandBlockBehavior.onRandomTick` and `onNeighborChanged` MUST NOT throw; malformed moisture
  reads are treated as 0 and the tick is skipped on a throwing state read.
- Crop support adds an extra growth step when hydrated but does not alter change-125 age
  mechanics (`nextCropAge` clamping, maturity stop).

## API and data model
```ts
// src/simulation/FarmlandBehavior.ts
export const MAX_MOISTURE = 7;
export const MOISTURE_PROPERTY = 'moisture';
export const HYDRATION_RADIUS = 4;
export const HYDRATION_DY: readonly number[] = [-1, 0];

export interface BlockSampler { getBlock(x, y, z): number; }
export interface FarmlandWorld extends BlockSampler { setBlock(x, y, z, id): void; }

export function isFarmlandHydrated(world: BlockSampler, x, y, z): boolean;
export function nextMoisture(moisture: number, hydrated: boolean): number;
export function parseMoisture(raw: string | undefined): number;
export function isCropAbove(world: BlockSampler, x, y, z): boolean;
export function hasSolidCoverAbove(world: BlockSampler, x, y, z): boolean;
export function shouldRevertToDirt(moisture: number, hasCropAbove: boolean): boolean;
export function trampleFarmland(world: FarmlandWorld, x, y, z): void;

export class FarmlandBlockBehavior implements BlockBehavior {
  onRandomTick(ctx: BlockBehaviorContext): void;
  onNeighborChanged(ctx: BlockBehaviorContext, fromX, fromY, fromZ): void;
}

// src/simulation/CropBehavior.ts (refactor)
export function growCropAt(world: BlockWorldAccess, x, y, z, blockId: number): void;

// src/world/BlockRegistry.ts
export const FARMLAND_SCHEMA = new BlockPropertySchema([{ kind: 'integer', name: 'moisture', min: 0, max: 7 }]);
// BlockId.Farmland = 35, defaultState { moisture: 0 }, dropItem rid('dirt'), lootTable rid('loot/dirt').
```
Sketches describe intent and do not override normative spec requirements.

## Control / data flow
1. `Game` registers `FarmlandBlockBehavior` for the farmland key. On each simulated frame,
   `tickRandomBlocks` increments the sim tick and, per section, calls
   `selectEligible(..., isRandomTickEligible)`. Farmland cells (and wheat cells) are eligible
   because their behaviors expose `onRandomTick`; each selected cell's behavior hook is invoked.
2. `FarmlandBlockBehavior.onRandomTick`: guard block-id match + state capability; read `moisture`
   defensively; sample hydration via `isFarmlandHydrated`; decide reversion
   (`shouldRevertToDirt` when not hydrated, or `hasSolidCoverAbove`); otherwise write the next
   moisture via `setBlockState`; when hydrated and a crop is above, call `growCropAt` on the cell
   above.
3. `growCropAt` advances the wheat above by one `age` stage (same as change 125) until mature.
4. `PlayerPhysics.resolve` on a downward Y collision calls `trampleFarmland(world, x, y, z)`,
   which reverts the feet farmland voxel to dirt (no-op otherwise).

## Detailed behavior
- `isFarmlandHydrated`: iterates `dx, dz in [-4, 4]` and `dy in {-1, 0}` (≤ 81 `getBlock` reads),
  returns true on the first `BlockId.Water`.
- `nextMoisture(m, hydrated)`: hydrated → `min(7, m + 1)`; dry → `max(0, m - 1)`.
- `parseMoisture(raw)`: `0` when `raw` is undefined/non-integer/out of `[0, 7]`; else the value.
- `isCropAbove(world, x, y, z)`: `getBlock(x, y + 1, z) === BlockId.Wheat`.
- `hasSolidCoverAbove(world, x, y, z)`: the block at `(x, y + 1, z)` is neither `BlockId.Air` nor
  `BlockId.Wheat` (in this catalog the only non-solid cover is wheat; water/lava above count as
  cover and revert).
- `shouldRevertToDirt(m, hasCrop)`: `m <= 0 && !hasCrop`.
- `trampleFarmland(world, x, y, z)`: if the cell is farmland, `setBlock(x, y, z, BlockId.Dirt)`.
- `FarmlandBlockBehavior.onRandomTick`: non-matching block or missing state capability → return.
  Throwing state read → return. Then: if not hydrated and `shouldRevertToDirt(m, hasCropAbove)`,
  or `hasSolidCoverAbove`, write `BlockId.Dirt` via `setBlockId` and return. Else write the next
  moisture if changed; if hydrated and `isCropAbove`, `growCropAt` the cell above.
- `FarmlandBlockBehavior.onNeighborChanged`: only reacts when the changed neighbor is directly
  above (`fromX === x && fromY === y + 1 && fromZ === z`); if `hasSolidCoverAbove`, revert to dirt.
  This is the documented "solid block placed above" detection, unit-tested directly; `Game` does
  not dispatch neighbor changes (out of 125 scope), so `onRandomTick` also carries the same
  solid-cover reversion as a scheduled fallback so in-game reversion still happens via random
  ticks.

## Failure modes
- Malformed `moisture` state read → treated as 0 (then reversion applies); throwing read → tick
  skipped; no throw.
- Missing `getBlockState`/`setBlockState` on the access → behavior returns without writing.
- Non-farmland cell (e.g. stale neighbor pointer) → no-op; `trampleFarmland` no-ops.
- A `setBlockState` write for `moisture` always uses legal values in `[0, 7]`; an illegal value
  would throw from the registry `lookup`, but the behavior only produces legal values.
- Out-of-bounds/unregistered writes → `setBlock`/`setBlockState` no-op (existing World guard).

## Compatibility / migration
- New block id `35` additive; existing block/item ids unchanged; item registry unchanged.
- No new methods on `BlockWorldAccess`/`WorldAccess`; behavior reads neighbors via `getBlockId`.
- `growCropAt` preserves change-125 growth behavior exactly; existing `CropBlockBehavior` tests
  remain valid.
- No snapshot format change; `moisture` is not persisted across a page reload (documented).

## Performance / resource constraints
- Hydration scan is bounded to the 9×3 Chebyshev neighborhood (≤ 81 `getBlockId` reads) per
  farmland random tick, over simulating sections only.
- `onRandomTick` performs O(1) reads/writes beyond the hydration scan; `getBlockState` is O(1).
- State overlay grows by at most the number of farmed/wheat cells the player maintains.

## Testing seams
- Pure helpers (`isFarmlandHydrated`, `nextMoisture`, `parseMoisture`, `shouldRevertToDirt`,
  `trampleFarmland`, `isCropAbove`, `hasSolidCoverAbove`) are unit-tested directly with a fake
  sampler — no DOM or full World.
- `FarmlandBlockBehavior` is tested against a fake `BlockWorldAccess` implementing
  `getBlockId`/`setBlockId`/`getBlockState`/`setBlockState`, like change-125 `CropBehavior.test.ts`.
- Farmland 8-state enumeration is tested via `createDefaultBlockStateRegistry`.
- Trampling is tested by calling `trampleFarmland` directly (the testable seam) against a fake
  world; the `PlayerPhysics` hook is a thin integration call.

## Observability / debugging
- Farmland states are inspectable via `BlockState.debugString()`
  (`minecraft:farmland[moisture=n]`).
- `World.getBlockState` exposes live moisture for any farmland cell.

## Affected files / symbols
- `src/world/BlockRegistry.ts` — `BlockId.Farmland = 35`, `FARMLAND_SCHEMA`, farmland definition.
- `src/simulation/FarmlandBehavior.ts` (NEW).
- `src/simulation/CropBehavior.ts` — extract/export `growCropAt`.
- `src/player/PlayerPhysics.ts` — trample on landing.
- `src/engine/Game.ts` — register `FarmlandBlockBehavior`; rename `isCropAt` → `isRandomTickEligible`.
- Tests: `tests/unit/FarmlandBehavior.test.ts`, `tests/unit/FarmlandMoistureState.test.ts` (NEW);
  update `BlockRegistry.test.ts`, `BlockStateRegistry.test.ts`, `BlockPropertySchema.test.ts`,
  `BlockItemSeparation.test.ts`.

## Rejected alternatives
- **Wiring a neighbor-change dispatch in `Game`:** change 125 does not dispatch
  `onNeighborChanged`; adding full neighbor updates is scope creep. Instead `onNeighborChanged`
  is implemented and unit-tested (the required detection) and `onRandomTick` also carries the
  solid-cover reversion as a scheduled fallback.
- **Making the crop grow only when hydrated (changing 125):** would change change-125 semantics
  (wheat grows regardless). Kept 125 behavior and added an extra growth step when hydrated, which
  satisfies "hydrated grows faster" without altering `age` mechanics.
- **Trampling wired into `Game.update` via a velocity transition flag:** `PlayerPhysics.resolve`
  is the authoritative landing edge; detecting it in `Game` would require tracking prior velocity
  and is fragile. Trampling is hooked at the landing site in the physics module.

## Downstream dependencies
- Change 127 (`bonemeal-growth-hooks`) may reuse `growCropAt`/crop growth.
- A later storage change may migrate the state overlay (including farmland `moisture`) into the
  persistent snapshot.
- A hoe/tilling item interaction (later progression change) will create farmland; farmland here
  is reachable via direct block writes and simulation rules.
