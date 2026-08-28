# Spec: farmland-moisture

## Contract
This capability introduces the **Farmland** block and the simulation rules around it: hydration
detection from nearby water, deterministic moisture rise/fall on random ticks, reversion to dirt,
player trampling, and crop support so hydrated farmland grows the wheat above it faster. Crops
are limited to wheat (from change 125). Bonemeal (127), fire (128), a hoe/tilling interaction,
and persisting `moisture` across a page reload are explicitly out of scope. Rain is treated as
absent (no weather system yet), so hydration comes only from nearby water.

## Definitions
- **Farmland block**: the block registered as `minecraft:farmland` with a single integer property
  `moisture` in `[0, 7]` (0 = dry, 7 = fully hydrated). It is solid, opaque, breakable, and drops
  dirt when broken.
- **Canonical farmland state**: one `(farmland, moisture)` combination enumerated by the
  `BlockStateRegistry`; there are exactly 8.
- **Hydrated**: `isFarmlandHydrated` returns true iff any `BlockId.Water` source is at
  `(x + dx, y + dy, z + dz)` with `|dx| <= 4`, `|dz| <= 4`, `dy in {-1, 0}` relative to the
  farmland block.
- **Crop above**: a `BlockId.Wheat` block directly above the farmland (`getBlock(x, y + 1, z)`).
- **Solid cover above**: a block directly above the farmland that is neither `BlockId.Air` nor
  `BlockId.Wheat` (in this catalog the only non-solid cover on farmland is wheat).
- **BlockSampler**: a minimal world surface exposing `getBlock(x, y, z): number`.
- **FarmlandWorld**: a `BlockSampler` that also exposes `setBlock(x, y, z, id)`.

## Invariants
- The default farmland state is `moisture = 0`; `moisture` never leaves `[0, 7]`.
- `nextMoisture(m, hydrated)` for `0 <= m <= 7` returns `min(7, m + 1)` when hydrated and
  `max(0, m - 1)` when not.
- Farmland reverts to dirt only when (a) it is dry (`moisture <= 0`) and no crop is above, or
  (b) a solid cover is directly above. It never reverts while wheat is planted on top.
- `trampleFarmland` writes `BlockId.Dirt` at the cell only when the cell is farmland; otherwise
  it is a no-op.
- `FarmlandBlockBehavior.onRandomTick` and `onNeighborChanged` MUST NOT throw; malformed moisture
  reads are treated as 0, and a throwing state read skips the tick.
- Crop support adds an extra growth step when hydrated but does not change change-125 age
  mechanics (`nextCropAge` clamping, maturity stop).

## Requirements

### Requirement: farmland exposes a moisture state domain of 0..7
`BlockId.Farmland` MUST be registered as `35` with an `IntegerPropertySpec` named `moisture` with
`min: 0`, `max: 7`, and a default state of `moisture = 0`. The default block-state registry MUST
enumerate exactly 8 farmland states (one per legal `moisture`), each resolvable by `moisture`
value. The farmland block MUST be solid, opaque, breakable, and drop dirt.

#### Scenario: eight canonical farmland states
- **GIVEN** the default block and block-state registries
- **WHEN** `statesForBlock(BlockId.Farmland)` is queried
- **THEN** it returns 8 states whose `moisture` values are exactly `0` through `7` in ascending
  order, and `getDefaultState(BlockId.Farmland).getProperty('moisture')` equals `'0'`

#### Scenario: farmland is solid, breakable, and drops dirt
- **GIVEN** the farmland definition
- **WHEN** its properties are read
- **THEN** `solid`, `opaque`, and `breakable` are true, and `dropItem` references the `dirt` item

### Requirement: hydration is detected within the documented neighborhood
`isFarmlandHydrated(world, x, y, z)` MUST return true iff any `BlockId.Water` is at
`(x + dx, y + dy, z + dz)` with `|dx| <= 4`, `|dz| <= 4`, and `dy in {-1, 0}`. It MUST return
false when the nearest water is outside that neighborhood.

#### Scenario: water within radius hydrates
- **GIVEN** a `BlockSampler` with `BlockId.Water` at `(x + 4, y - 1, z)` for farmland at `(x, y, z)`
- **WHEN** `isFarmlandHydrated(sampler, x, y, z)` is called
- **THEN** it returns `true`

#### Scenario: water outside radius does not hydrate
- **GIVEN** a `BlockSampler` with `BlockId.Water` only at `(x + 5, y, z)` for farmland at `(x, y, z)`
- **WHEN** `isFarmlandHydrated(sampler, x, y, z)` is called
- **THEN** it returns `false`

#### Scenario: water above the allowed vertical band does not hydrate
- **GIVEN** a `BlockSampler` with `BlockId.Water` only at `(x, y + 1, z)` for farmland at `(x, y, z)`
- **WHEN** `isFarmlandHydrated(sampler, x, y, z)` is called
- **THEN** it returns `false` (only `dy in {-1, 0}` counts)

### Requirement: moisture rises when hydrated and falls when dry
`nextMoisture(moisture, hydrated)` MUST return `min(MAX_MOISTURE, moisture + 1)` when hydrated and
`max(0, moisture - 1)` when not, where `MAX_MOISTURE === 7`. `FarmlandBlockBehavior.onRandomTick`
MUST write the resulting moisture via `setBlockState` when it differs from the current value, and
MUST NOT write when it is unchanged.

#### Scenario: hydrated farmland moistens toward 7
- **GIVEN** hydrated farmland at `moisture = 0`
- **WHEN** `onRandomTick` is invoked repeatedly
- **THEN** the recorded moisture progresses `0 -> 1 -> ... -> 7`, and further ticks write nothing

#### Scenario: dry farmland dries toward 0
- **GIVEN** non-hydrated farmland at `moisture = 5` with no crop above
- **WHEN** `onRandomTick` is invoked once
- **THEN** the written moisture is `4`

#### Scenario: moisture clamps at the bounds
- **GIVEN** hydrated farmland at `moisture = 7` and dry farmland at `moisture = 0`
- **WHEN** `nextMoisture` is called
- **THEN** the results are `7` and `0` respectively (no overflow/underflow)

### Requirement: dry empty farmland reverts to dirt
When `FarmlandBlockBehavior.onRandomTick` observes a farmland cell that is not hydrated, has
`moisture = 0`, and has no crop above, it MUST write `BlockId.Dirt` at the cell. It MUST NOT
revert while a wheat crop is directly above.

#### Scenario: dry and empty reverts
- **GIVEN** non-hydrated farmland at `moisture = 0` with no crop above
- **WHEN** `onRandomTick` is invoked
- **THEN** the cell is written to `BlockId.Dirt`

#### Scenario: crop on top prevents reversion
- **GIVEN** non-hydrated farmland at `moisture = 0` with `BlockId.Wheat` directly above
- **WHEN** `onRandomTick` is invoked
- **THEN** the cell remains farmland and no dirt write occurs

### Requirement: a solid block placed above reverts farmland to dirt
`FarmlandBlockBehavior.onNeighborChanged(ctx, fromX, fromY, fromZ)` MUST, when the changed
neighbor is directly above (`fromX === x`, `fromZ === z`, `fromY === y + 1`) and a solid cover
(non-air, non-wheat) is directly above the farmland, write `BlockId.Dirt` at the farmland cell.
`onRandomTick` MUST also revert on a detected solid cover above (scheduled fallback).

#### Scenario: solid block placed above reverts via neighbor change
- **GIVEN** farmland at `(x, y, z)` with `BlockId.Stone` now at `(x, y + 1, z)`
- **WHEN** `onNeighborChanged` is invoked with `from = (x, y + 1, z)`
- **THEN** the farmland cell is written to `BlockId.Dirt`

#### Scenario: crop above is not treated as solid cover
- **GIVEN** farmland at `(x, y, z)` with `BlockId.Wheat` at `(x, y + 1, z)`
- **WHEN** `hasSolidCoverAbove` is queried and `onNeighborChanged` is invoked with `from = (x, y + 1, z)`
- **THEN** `hasSolidCoverAbove` is false and the farmland is not reverted

### Requirement: landing on farmland tramples it to dirt
`trampleFarmland(world, x, y, z)` MUST, when the cell at `(x, y, z)` is `BlockId.Farmland`, write
`BlockId.Dirt` at the cell. It MUST be a no-op for any other block. The player physics MUST invoke
`trampleFarmland` at the feet voxel when the player lands on it (downward collision), so a landing
reverts farmland underneath the player.

#### Scenario: trampling reverts farmland
- **GIVEN** a `FarmlandWorld` holding `BlockId.Farmland` at `(1, 2, 3)`
- **WHEN** `trampleFarmland(world, 1, 2, 3)` is called
- **THEN** the cell is written to `BlockId.Dirt`

#### Scenario: trampling a non-farmland cell is a no-op
- **GIVEN** a `FarmlandWorld` holding `BlockId.Grass` at `(1, 2, 3)`
- **WHEN** `trampleFarmland(world, 1, 2, 3)` is called
- **THEN** no write occurs and the cell remains `BlockId.Grass`

### Requirement: hydrated farmland grows the crop above faster
When `FarmlandBlockBehavior.onRandomTick` observes a hydrated farmland cell with a wheat crop
directly above, it MUST advance the crop above by one growth stage via the same growth step the
crop uses (`growCropAt`, `nextCropAge`), without changing change-125 age mechanics. A hydrated
farmland cell therefore grows wheat twice as fast as the crop's own random ticks alone.

#### Scenario: hydrated farmland grows the wheat above
- **GIVEN** hydrated farmland at `(x, y, z)` with `BlockId.Wheat` at `(x, y + 1, z)` at `age = 3`
- **WHEN** `onRandomTick` is invoked on the farmland
- **THEN** the crop above is written to `age = 4`

#### Scenario: dry farmland does not grow the crop above
- **GIVEN** non-hydrated farmland at `(x, y, z)` with `BlockId.Wheat` at `(x, y + 1, z)`
- **WHEN** `onRandomTick` is invoked on the farmland
- **THEN** no crop-growth write occurs

### Requirement: crop growth step is reusable and unchanged from 125
`growCropAt(world, x, y, z, blockId)` MUST advance a crop's `age` by one stage per call until
mature (`nextCropAge` clamped to 7) and MUST NOT write when the crop is mature, when the block id
does not match, or when the access lacks state capability. `CropBlockBehavior.onRandomTick` MUST
delegate to it, preserving change-125 behavior.

#### Scenario: growCropAt preserves 125 growth semantics
- **GIVEN** a fake `BlockWorldAccess` holding wheat at `age = 0` at `(1, 2, 3)`
- **WHEN** `growCropAt(world, 1, 2, 3, BlockId.Wheat)` is invoked repeatedly until mature
- **THEN** the recorded ages progress `0 -> 1 -> ... -> 7`, the last write is `age = 7`, and a
  further call writes nothing

## Error and failure behavior
- Malformed/non-numeric `moisture`: treated as 0 (reversion may then apply); no throw.
- Throwing `getBlockState` read: the tick/neighbor hook returns without writing; no throw.
- Missing state capability on the access: `onRandomTick` returns without writing; no throw.
- Non-farmland cell or stale neighbor pointer: no-op; `trampleFarmland` no-ops on non-farmland.
- A `setBlockState` write for `moisture` uses only legal values in `[0, 7]`; out-of-bounds or
  unregistered writes no-op via the existing World guard.

## Performance and resource bounds
- Hydration scan is bounded to the 9×3 Chebyshev neighborhood (≤ 81 `getBlockId` reads) per
  farmland random tick, over simulating sections only.
- `nextMoisture`, `parseMoisture`, `shouldRevertToDirt`, `isCropAbove`, `hasSolidCoverAbove`, and
  `trampleFarmland` are O(1).
- The state overlay grows by at most the number of farmed/wheat cells the player maintains.

## Compatibility and migration
- New block id `35` is additive; no existing block/item id changes; the item registry is
  unchanged (farmland drops dirt and has no item).
- No new methods on `BlockWorldAccess`/`WorldAccess`; the behavior reads neighbors via `getBlockId`.
- `growCropAt` preserves change-125 growth behavior exactly; existing crop tests remain valid.
- No persistent snapshot/serialization format change; `moisture` is tracked in the World
  in-memory block-state overlay only (not persisted across a page reload).

## Security and integrity
- Moisture writes only ever use legal values in `[0, 7]`; the state registry rejects any
  out-of-domain assignment, so moisture dynamics cannot corrupt block-state storage.
- Reversion/trampling only ever replace farmland with `BlockId.Dirt`; the crop-on-top guard
  prevents destroying growing crops.
- Drops are produced by the existing validated `loot/dirt` table referencing a registered item.

## Observability
- Farmland states are inspectable via `BlockState.debugString()` (`minecraft:farmland[moisture=n]`).
- `World.getBlockState` exposes live moisture for any farmland cell for debugging.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 farmland 8 states, solid/breakable/drops dirt | `FarmlandMoistureState.test.ts` 8-state enumeration; `BlockRegistry.test.ts` update |
| REQ-2 hydration within/outside neighborhood | `FarmlandBehavior.test.ts` in-radius, out-of-radius, dy-band |
| REQ-3 moisture rise/fall and clamping | `FarmlandBehavior.test.ts` nextMoisture + onRandomTick |
| REQ-4 dry+empty reverts; crop prevents reversion | `FarmlandBehavior.test.ts` |
| REQ-5 solid block above reverts | `FarmlandBehavior.test.ts` onNeighborChanged + onRandomTick fallback |
| REQ-6 trample reverts / no-op | `FarmlandBehavior.test.ts` trampleFarmland; `PlayerPhysics` integration |
| REQ-7 hydrated grows crop above / dry does not | `FarmlandBehavior.test.ts` |
| REQ-8 growCropAt preserves 125 semantics | `CropBehavior.test.ts` existing suite + growCropAt |
