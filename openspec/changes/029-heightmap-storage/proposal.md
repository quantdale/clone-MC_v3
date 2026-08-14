# Proposal: 029-heightmap-storage

## Problem

028 added per-section mesh versioning so a mesher can drop stale jobs. But the storage stack still has no
chunk-column heightmap: callers that need the topmost block of a column (surface spawn checks, motion-blocking
queries, light/sky occlusion seeding) must rescan 384 blocks every time. There is no reusable, deterministic
primitive for "highest non-air" or "highest motion-blocking" block per (x,z) column.

## Goals

- Add a per-column **surface heightmap** (`getSurfaceHeight`) giving the Y of the topmost non-air block.
- Add a per-column **motion-blocking heightmap** (`getMotionBlockingHeight`) giving the Y of the topmost
  motion-blocking block (solid per `BlockRegistry.isSolid`, or any non-air when no `BlockRegistry` is supplied).
- Update both heightmaps incrementally on `setBlockState` so the common single-write case is O(1) and only a
  top-block removal triggers a downward rescan.
- Keep heightmaps fully derived (never persisted) and lazily recomputed after `deserialize`.

## Non-goals

- No meshing, lighting, or generation consumes these yet (030+ cover chunk status/streaming; the meshing
  pipeline is separate and already exists in production `ChunkMesher.ts`/`World.ts`).
- No new heightmap *types* beyond surface and motion-blocking (no `WORLD_SURFACE_WG`, `OCEAN_FLOOR`, etc.).
- No `VerticalWorldAccess` API surface — the primitives live on `ChunkColumn` and are consumed by callers that
  already hold a column.

## Preconditions

028 is VERIFIED. Depends on 023 (`ChunkSection`), 024 (`ChunkColumn`), 025 (`DimensionType` layout via
`minSectionY`/`sectionCount`), and `BlockRegistry.isSolid` (014-adjacent block definitions, available since 002).

## Dependencies

- `src/world/ChunkColumn.ts` (024)
- `src/world/BlockRegistry.ts` (`isSolid`)
- `src/math/SectionCoordinate.ts` (021)

## Proposed change

- `ChunkColumn` gains two `Int16Array(256)` heightmaps (`surfaceHeight`, `motionBlockingHeight`), indexed by
  `localZ * 16 + localX`, initialized to the sentinel `minY - 1` (empty column).
- `ChunkColumn` gains `getSurfaceHeight(localX, localZ)` and `getMotionBlockingHeight(localX, localZ)`.
- `ChunkColumn` gains `recomputeHeightmaps()` to rebuild both from current block state.
- `setBlockState` updates the affected column's heightmaps incrementally.
- `deserialize` marks heightmaps stale so the first read recomputes them (serialization itself is unchanged).
- An optional `blockRegistry?: BlockTypeRegistry` is accepted in `ChunkColumnOptions` to resolve solidity;
  when omitted, motion-blocking falls back to "any non-air block".

## Compatibility and migration

Additive; no persisted-format or call-site changes. `ChunkColumnOptions` gains an optional field; existing
constructors (and `VerticalWorldAccess`, which omits it) keep working. Heightmaps are runtime-only and not
serialized.

## Risks

- A downward rescan on top-block removal is O(column height) in the worst case. Mitigated: it only runs when the
  removed/replaced block was exactly the current top of its heightmap, which is the rare case for typical edits.
- Negative sentinel `minY - 1` could be confused with a real Y. Mitigated: all real block Y satisfy `Y >= minY`,
  so the sentinel `minY - 1` is strictly below any possible block and is documented as the empty-column value.
- Incremental update diverging from a full recompute if a future mutator bypasses `setBlockState`. Mitigated:
  `setBlockState` is the only public write path; `recomputeHeightmaps()` is the authoritative reset and is used
  after `deserialize`.

## Rollback strategy

Additive fields/methods; reverting the commit removes them with no downstream impact (030 not yet implemented).

## Definition of Done

Both heightmaps are correct for built columns, update incrementally on writes and downward-rescan on top removal,
are empty (`minY - 1`) for untouched columns, recompute correctly after `deserialize`, and the full regression
gate is green.

## Advancement gate

030 starts only after 029 is 100% complete and VERIFIED.
