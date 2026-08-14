# Proposal: 033-vertical-streaming

## Problem

`World` streams, generates, meshes, and unloads a single chunk layer hardcoded at
`cy = 0`. Every streaming entry point (`ensureChunks`, `preloadChunks`,
`getReadyProgress`) encodes the same single-layer assumption: `getChunk(cx, 0, cz)`.
The vertical model already exists (`DimensionType` with `minY`/`height` →
`minSectionY`/`sectionCount`, `ChunkColumn` grouping sections, `VerticalWorldAccess`
025/026), but the live `World` ignores it and cannot load more than one 64-block
chunk layer around the player.

## Goals

- Remove the hardcoded `cy = 0` single-layer assumption from `World`'s streaming.
- Derive the streamed vertical chunk-layer range from a `DimensionType` so the world
  can load the layers the active dimension requires.
- Preserve existing behavior when no dimension (or a single-layer dimension) is
  supplied: the default path stays a single `cy = 0` layer, so the 478-unit / 19-e2e
  baseline is unchanged.
- Expose the vertical range so downstream consumers (and tests) can observe it.

## Non-goals

- Converting `World`'s 64-block `Chunk` model into the 16-block `ChunkColumn`/section
  model (a later, larger integration).
- Changing generation, meshing, or unload cadence per layer.
- Wiring the running game to a tall dimension yet (capability delivered + tested;
  activation is a follow-up once a dimension is selected).

## Preconditions

- Change 032 (`render-vs-simulation-distance`) is VERIFIED.
- `DimensionType` (025) exists with `minY`/`height`/`minSectionY`/`sectionCount`.
- `npm test` and `npm run test:e2e` are green at the 032 baseline (478 unit / 19 e2e).

## Dependencies

- `src/data/DimensionType.ts` — vertical extent source of truth.
- `src/world/World.ts` — streaming owner; `CHUNK_DIMENSIONS.height` defines a chunk
  layer in blocks.
- `src/world/ChunkManager.ts` — already supports arbitrary `(cx, cy, cz)`.

## Proposed change

`World` accepts an optional `dimension?: DimensionType`. From it (or defaults) it
computes `minChunkY = floor(dimension.minY / CHUNK_DIMENSIONS.height)` and
`chunkLayerCount = ceil(dimension.height / CHUNK_DIMENSIONS.height)`. Streaming loops
iterate `cy ∈ [minChunkY, minChunkY + chunkLayerCount)` instead of the literal `0`.
Defaults (`no dimension`, or `minY = 0`, `height = CHUNK_DIMENSIONS.height`) keep
`minChunkY = 0`, `chunkLayerCount = 1` → identical to today. New accessors expose the
range; unit tests construct a two-layer dimension and assert streaming covers both.

## Compatibility and migration

`World`'s constructor gains an optional field; existing call sites (and `Game`) are
unchanged and keep the single-layer default. No persisted/public format changes.

## Risks

- If a caller passes a tall `DimensionType`, `World` will stream `chunkLayerCount`
  chunks per `(dx,dz)`, multiplying generation/mesh work. The default path avoids this;
  full game activation is deferred.

## Rollback strategy

Revert the commit. No persisted state or public API removals involved.

## Definition of Done

- `World` derives the vertical chunk-layer range from an optional `dimension`.
- `ensureChunks`/`preloadChunks`/`getReadyProgress` iterate the range; default = 1 layer.
- Accessors expose the range.
- Unit tests prove multi-layer streaming and single-layer default parity.
- Full gate green; 033 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`
must all pass. Unit count grows by the 033 suite; E2E stays 19/19.
