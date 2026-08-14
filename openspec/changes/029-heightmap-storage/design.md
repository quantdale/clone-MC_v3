# Design: 029-heightmap-storage

## Context / current state

024 `ChunkColumn` groups `ChunkSection`s by `(chunkX, chunkZ)` and exposes `getBlockState`/`setBlockState`,
dirty-section tracking (027), and per-section mesh versioning (028). It has no derived per-column height
information. Callers needing the topmost block of a column must scan all Y in the column (up to 384 for the
overworld). `BlockRegistry.isSolid(blockId)` exists and is the canonical solidity predicate.

## Target state

`ChunkColumn` maintains two `Int16Array(256)` heightmaps (one entry per `(localX, localZ)`) and exposes them
through `getSurfaceHeight`/`getMotionBlockingHeight`, kept incrementally correct by `setBlockState` and lazily
recomputed after `deserialize`.

## Invariants

- `getSurfaceHeight(x,z)` MUST return the Y of the highest non-air block in column `(x,z)`, or `minY - 1` when
  the column contains no non-air block.
- `getMotionBlockingHeight(x,z)` MUST return the Y of the highest motion-blocking block in column `(x,z)`, or
  `minY - 1` when none. A block is motion-blocking when it is non-air and (`blockRegistry` is supplied and
  `blockRegistry.isSolid(blockId)` is true) OR (`blockRegistry` is omitted).
- Real block heights satisfy `Y >= minY`, so the sentinel `minY - 1` is never a real block height.
- Heightmaps MUST be derivable from block state: after `deserialize` (blocks restored, maps not persisted) the
  first read recomputes them; `recomputeHeightmaps()` always reproduces them from current state.

## API and data model

```ts
// ChunkColumnOptions (additive)
export interface ChunkColumnOptions {
  chunkX: number;
  chunkZ: number;
  sectionCount: number;
  minSectionY?: number;
  registry: BlockStateRegistry;
  airId?: BlockStateId;
  blockRegistry?: BlockTypeRegistry; // optional; resolves solidity for motion-blocking
}

// ChunkColumn (additive)
export class ChunkColumn {
  readonly minY: number;   // minSectionY * SECTION_SIZE
  readonly maxY: number;   // (minSectionY + sectionCount) * SECTION_SIZE - 1

  getSurfaceHeight(localX: number, localZ: number): number;
  getMotionBlockingHeight(localX: number, localZ: number): number;
  recomputeHeightmaps(): void;
}
```

Storage: `surfaceHeight: Int16Array(256)`, `motionBlockingHeight: Int16Array(256)`; index
`localZ * SECTION_SIZE + localX`. Both initialized to `minY - 1`. A `heightmapsValid` flag is `true` for a
fresh empty column and set `false` by `deserialize` so the first read recomputes.

## Control / data flow

`getSurfaceHeight`/`getMotionBlockingHeight` call `ensureHeightmapsValid()` (recompute if `!heightmapsValid`),
then read the typed-array entry. `setBlockState` performs the section write, then `updateHeightmaps(localX,
worldY, localZ, state)`:

- Compute `isAir = state.id === airId` and `isMotion = !isAir && (blockRegistry?.isSolid(state.blockId) ?? true)`.
- For the **surface** map: if `!isAir` and `worldY > surface`, set `surface = worldY`. Else if `isAir` and
  `worldY === surface`, rescan downward (`rescanHeight(x, z, worldY - 1, surface=false)`).
- For the **motion** map: if `isMotion` and `worldY > motion`, set `motion = worldY`. Else if `!isMotion` and
  `worldY === motion`, rescan downward (`rescanHeight(x, z, worldY - 1, motion=true)`).

`rescanHeight(x, z, fromY, wantMotion)` walks `y` from `fromY` down to `minY`, returning the first Y whose
block satisfies the predicate (`!isAir` for surface, `isMotion` for motion); returns `minY - 1` when none.

If `!heightmapsValid` when `setBlockState` runs (deserialized column not yet read), the incremental update is
skipped (the maps will be fully recomputed on the next read), preserving correctness without double work.

## Detailed behavior

- Untouched column → every heightmap entry is `minY - 1`.
- Placing a block above the current top raises that column's relevant height(s) to `worldY`.
- Placing a block below the current top (or replacing a non-top block) leaves the top height unchanged.
- Removing/replacing the exact top block rescans downward to the next qualifying block, or `minY - 1`.
- `water` (non-solid) raises `surfaceHeight` (non-air) but not `motionBlockingHeight`.
- With no `blockRegistry`, every non-air block (including `water`) is treated as motion-blocking, so
  `motionBlockingHeight` equals `surfaceHeight`.

## Failure modes

- `getSurfaceHeight`/`getMotionBlockingHeight` on a deserialized column with un-recomputed maps → transparently
  recompute first (no stale sentinel returned).
- Out-of-range `localX`/`localZ` indexing is undefined behavior (matching existing `getBlockState` no-validation
  style); callers pass in-range local coords.

## Compatibility / migration

Additive; `serialize`/`deserialize` byte layout unchanged. The optional `blockRegistry` field is ignored by
serialization.

## Performance / resource constraints

O(1) read and single-write update (one typed-array write). Downward rescan only on top-block removal, bounded by
column height (<= 384). `recomputeHeightmaps` is O(256 * height) one-time; not on a hot path. Memory: 512 bytes
per column (two `Int16Array(256)`), negligible.

## Testing seams

`tests/unit/HeightmapStorage.test.ts` covers: empty-column sentinel; single write sets both heights; higher
write raises; top removal rescans downward; non-solid (water) affects surface but not motion; column
independence; `recomputeHeightmaps`; `deserialize` lazy recompute; optional-`blockRegistry` fallback.

## Affected files / symbols

- `src/world/ChunkColumn.ts` (add heightmaps, getters, `recomputeHeightmaps`, `minY`/`maxY`, optional
  `blockRegistry`, incremental update, deserialize hook)
- `tests/unit/HeightmapStorage.test.ts` (new)

## Rejected alternatives

- **Persist heightmaps**: redundant; they are a pure function of block state and would add migration surface for
  zero correctness benefit.
- **Per-section heightmaps**: a block column is the natural vertical unit for surface/motion queries; per-section
  would fracture the rescan and complicate the single top-Y lookup.
- **Always full-recompute on write**: O(height) per write; unnecessary since the common case only changes one
  top boundary.

## Downstream dependencies

030+ (chunk status, streaming) and the production mesher/lighting can consume `getSurfaceHeight`/
`getMotionBlockingHeight` for occlusion/spawn seeding without rescanning columns.
