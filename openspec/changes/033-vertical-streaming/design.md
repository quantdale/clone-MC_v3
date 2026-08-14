# Design: 033-vertical-streaming

## Context / current state

`World` stores `private readonly renderDistance: number` and streams a single chunk
layer at `cy = 0`. Concrete assumptions to remove:

- `ensureChunks` (line ~386/396): `getChunk(cx, 0, cz)` / `createChunk(cx, 0, cz)`.
- `preloadChunks` (line ~833/835): same literal `0`.
- `getReadyProgress` (line ~814): `getChunk(playerChunkX + dx, 0, playerChunkZ + dz)`.

`ChunkManager` already supports arbitrary `(cx, cy, cz)`. `worldToChunk` maps world Y to
`cy = floor(y / CHUNK_DIMENSIONS.height)`, so a chunk layer's Y span is 64 blocks.
`DimensionType` (025) carries `minY`/`height` (blocks) and derives `minSectionY`/
`sectionCount` (16-block sections). For `World`'s 64-block chunk model the vertical
layer count is `ceil(height / 64)`.

## Target state

`World` derives a vertical chunk-layer window from a `DimensionType` (or defaults to a
single layer) and streams that full window around the player. No streaming site assumes
`cy = 0`.

## Invariants

- `minChunkY = dimension ? floor(dimension.minY / CHUNK_DIMENSIONS.height) : 0`.
- `chunkLayerCount = dimension ? ceil(dimension.height / CHUNK_DIMENSIONS.height) : 1`.
- Default (no dimension) → `minChunkY = 0`, `chunkLayerCount = 1` (bit-for-bit current
  behavior).
- `worldToChunk` for any block Y in `[dimension.minY, dimension.minY + height)` yields a
  `cy` inside `[minChunkY, minChunkY + chunkLayerCount)`.

## API and data model

```ts
// World constructor opts gains:
dimension?: DimensionType;

// new private fields:
private readonly minChunkY: number;
private readonly chunkLayerCount: number;

// new accessors:
getMinChunkY(): number;
getChunkLayerCount(): number;
```

## Control / data flow

1. Constructor computes `minChunkY`/`chunkLayerCount` from `opts.dimension` (or default 0/1).
2. `ensureChunks` iterates `cy ∈ [minChunkY, minChunkY + chunkLayerCount)` inside the
   existing `(dx,dz)` loop; each layer is enqueued independently and respects
   `CONFIG.maxQueueSize`.
3. `preloadChunks` iterates the same cy window so the spawn column is fully queued.
4. `getReadyProgress` measures the layer `this.minChunkY` (the bottom layer that spawns
   first); for the default this is `cy = 0`, identical to today.

## Detailed behavior

- `ensureChunks`: the inner per-layer block checks `getChunk(cx, cy, cz)`; if absent and
  the generation queue has room, `createChunk(cx, cy, cz)` + enqueue; else, if present
  but ungenerated and not already queued, re-enqueue. The `break scan` on a full queue
  remains valid (exits all loops).
- `getReadyProgress`: ready ring counts `getChunk(px+dx, minChunkY, pz+dz)` chunks whose
  state is `Visible`. Default `minChunkY = 0` preserves current semantics.
- `preloadChunks`: per `(dx,dz)` and per `cy`, fetch/create and enqueue generation (or
  re-mesh if already generated but not visible).

## Failure modes

- A `DimensionType` with `minY`/`height` outside the chunk-layer model still yields a
  valid `minChunkY`/`chunkLayerCount` (floor/ceil), so streaming never throws on the
  window itself. `DimensionType` validation already guards minY/height legality.
- `queueFull` short-circuits when `CONFIG.maxQueueSize` is reached, exactly as before.

## Compatibility / migration

Optional constructor field only. Existing `World` call sites (and `Game`) pass no
`dimension` → single-layer default → unchanged streaming scope and queue bounds.

## Performance / resource constraints

Generation/mesh work scales by `chunkLayerCount` per `(dx,dz)`. Default `1` → no change.
`ChunkManager` already keys by `(cx,cy,cz)`, so per-layer bookkeeping is O(1).

## Testing seams

- `tests/unit/VerticalStreaming.test.ts`:
  - Default (no dimension): `getMinChunkY() === 0`, `getChunkLayerCount() === 1`.
  - Two-layer dimension (`minY=0, height=128`): after streaming to `(0,0)`, chunks exist
    at `cy=0` and `cy=1` for an in-range `(dx,dz)`; `getChunkLayerCount() === 2`.
  - `preloadChunks` of a two-layer dimension enqueues `chunkLayerCount` generation jobs
    per column (assert `pendingGeneration` grows by `radius*radius*chunkLayerCount`).
  - `getReadyProgress` on the default measures `cy=0` (no regression).
  - Queue bound still ≤ `(2*rd+1)^2 * chunkLayerCount` (multi-layer monotonic upper bound).

## Observability / debugging

`getMinChunkY`/`getChunkLayerCount` expose the active vertical window; `getStats()`
already counts total loaded chunks across all layers.

## Affected files / symbols

- `src/world/World.ts` — derive vertical window; iterate it in `ensureChunks`,
  `preloadChunks`, `getReadyProgress`; add accessors; import `DimensionType`.
- `tests/unit/VerticalStreaming.test.ts` — NEW.

## Rejected alternatives

- *Convert `World` to `ChunkColumn`/section streaming now*: a large refactor touching
  the mesher, storage, and the 478-test baseline; out of scope for a "narrow" change and
  risking the e2e. The capability (multi-layer streaming) is delivered here; the
  model swap is a later change.
- *Hardcode a new literal layer count*: re-introduces a magic constant and still assumes
  a fixed count; deriving from `DimensionType` is the dimension-driven, assumption-free
  approach the change requires.

## Downstream dependencies

A later change that selects a dimension for the live game will pass it to `World`,
activating true vertical streaming without further code changes here.
