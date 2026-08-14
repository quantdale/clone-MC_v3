# Spec: heightmap-storage

## Contract

`heightmap-storage` adds reusable, deterministic per-column heightmap primitives to `ChunkColumn` (024): a
**surface heightmap** (topmost non-air block) and a **motion-blocking heightmap** (topmost solid/non-air block),
updated incrementally on write and lazily recomputed after `deserialize`. It is a gameplay-free storage primitive
consumable by meshing, lighting, and spawn/occlusion queries without rescanning whole columns.

## Definitions

- **Surface height** `S(x,z)`: the Y of the highest non-air block in column `(x,z)`, or `minY - 1` if the column
  has no non-air block.
- **Motion-blocking height** `M(x,z)`: the Y of the highest motion-blocking block in column `(x,z)`, or `minY - 1`
  if none. A block is motion-blocking when it is non-air and (`blockRegistry` is supplied and
  `blockRegistry.isSolid(blockId)` is true) OR (`blockRegistry` is omitted).
- **Sentinel**: `minY - 1`, the documented empty-column value (strictly below any real block since `Y >= minY`).

## Invariants

- `getSurfaceHeight(x,z)` MUST equal `S(x,z)` as defined above.
- `getMotionBlockingHeight(x,z)` MUST equal `M(x,z)` as defined above.
- An untouched/empty column MUST report `minY - 1` for both heightmaps at every `(x,z)`.
- Heightmaps MUST be derivable from block state; after `deserialize` the first read MUST reproduce them, and
  `recomputeHeightmaps()` MUST always reproduce them from current state.

## Requirements

### Requirement: surface heightmap returns the topmost non-air block
`getSurfaceHeight(localX, localZ)` MUST return the Y of the highest non-air block in that column, or the sentinel
`minY - 1` when the column is entirely air.

#### Scenario: empty column
- **GIVEN** a `ChunkColumn` with no writes
- **THEN** `getSurfaceHeight(0, 0)` equals `minY - 1`

#### Scenario: topmost non-air wins
- **GIVEN** a `ChunkColumn` with a block at `y=10` and another at `y=20` in column `(5,5)`
- **THEN** `getSurfaceHeight(5, 5)` equals `20`

### Requirement: motion-blocking heightmap returns the topmost solid block
`getMotionBlockingHeight(localX, localZ)` MUST return the Y of the highest motion-blocking block, or the sentinel
when none. When a `blockRegistry` is supplied, a non-solid block (e.g. water) MUST NOT raise `M`.

#### Scenario: solid block sets motion height
- **GIVEN** a `ChunkColumn` with a `blockRegistry` and a stone block at `y=15` in column `(3,3)`
- **THEN** `getMotionBlockingHeight(3, 3)` equals `15`

#### Scenario: non-solid block does not raise motion height
- **GIVEN** a `ChunkColumn` with a `blockRegistry`, a stone block at `y=10` and a water block at `y=25` in column `(3,3)`
- **THEN** `getSurfaceHeight(3, 3)` equals `25`
- **AND** `getMotionBlockingHeight(3, 3)` equals `10`

#### Scenario: fallback when no blockRegistry supplied
- **GIVEN** a `ChunkColumn` constructed without a `blockRegistry`, with a water block at `y=8` in column `(1,1)`
- **THEN** `getMotionBlockingHeight(1, 1)` equals `8` (any non-air counts)

### Requirement: heightmaps update incrementally on write
`setBlockState` MUST keep the heightmaps correct without a full recompute for the common single-write case.

#### Scenario: placing above the top raises height
- **GIVEN** a column with `S(5,5)=20`
- **WHEN** a block is placed at `y=30` in column `(5,5)`
- **THEN** `getSurfaceHeight(5, 5)` equals `30`

#### Scenario: placing below the top leaves height unchanged
- **GIVEN** a column with `S(5,5)=20`
- **WHEN** a block is placed at `y=12` in column `(5,5)`
- **THEN** `getSurfaceHeight(5, 5)` equals `20`

### Requirement: removing the top block rescans downward
When the block at the current top Y is removed (set to air) or replaced, the heightmap MUST rescan downward to the
next qualifying block, or the sentinel when none remains.

#### Scenario: removing the top non-air rescans to the next block
- **GIVEN** a column with blocks at `y=10` and `y=20` in column `(5,5)` (so `S(5,5)=20`)
- **WHEN** the block at `y=20` is set to air
- **THEN** `getSurfaceHeight(5, 5)` equals `10`

#### Scenario: removing the last block returns the sentinel
- **GIVEN** a column with a single block at `y=10` in column `(5,5)` (so `S(5,5)=10`)
- **WHEN** that block is set to air
- **THEN** `getSurfaceHeight(5, 5)` equals `minY - 1`

### Requirement: heightmaps are column-independent and recomputable
Each `(x,z)` column MUST be tracked independently. `recomputeHeightmaps()` MUST rebuild both maps from current
block state, and a `deserialize`d column MUST yield correct heights on first read.

#### Scenario: independent columns
- **GIVEN** blocks at `y=10` in column `(5,5)` and no block in column `(1,1)`
- **THEN** `getSurfaceHeight(5, 5)` equals `10` and `getSurfaceHeight(1, 1)` equals `minY - 1`

#### Scenario: recompute reproduces current state
- **GIVEN** a column with blocks at `y=10` and `y=20`
- **WHEN** `recomputeHeightmaps()` is called
- **THEN** `getSurfaceHeight` returns `20` for that column

#### Scenario: deserialize lazily recomputes
- **GIVEN** a `ChunkColumn` built with a stone block at `y=12`, serialized, then deserialized
- **WHEN** `getSurfaceHeight` is read
- **THEN** it returns `12` (no persisted map; recomputed from restored blocks)

## Error and failure behavior

- Reading heightmaps of a `deserialize`d column before recompute → transparently recomputed first; never returns a
  stale sentinel for a column that has blocks.
- `localX`/`localZ` outside `[0,16)` is undefined (matching the existing no-validation `getBlockState` contract);
  callers pass in-range coordinates.

## Performance and resource bounds

O(1) read and single-write update (one typed-array write). Downward rescan bounded by column height (<= 384) and
runs only when the top block is removed/replaced. `recomputeHeightmaps` is O(256 * height), one-time, not on a
hot path. Memory: two `Int16Array(256)` = 512 bytes per column.

## Compatibility and migration

Additive; `serialize`/`deserialize` byte layout unchanged; heightmaps are runtime-only and never persisted.
`ChunkColumnOptions.blockRegistry` is optional; existing constructors (including those that omit it) keep working.

## Security and integrity

No external input; heightmaps are pure functions of in-memory block state.

## Observability

`getSurfaceHeight`/`getMotionBlockingHeight` return plain integers consumable by mesher/lighting/spawn code;
`recomputeHeightmaps()` gives an explicit authoritative reset.

## Verification mapping

- All scenarios → `tests/unit/HeightmapStorage.test.ts`
- Full gate → typecheck, lint, unit, build, e2e
