# Spec: vertical-streaming

## Contract

`World` MUST stream chunk layers around the player across the full vertical extent the
active dimension requires, instead of assuming a single `cy = 0` layer. The streamed
vertical window MUST be derived from a `DimensionType` (or default to a single layer)
and MUST be applied consistently by every streaming entry point.

## Definitions

- **Chunk layer**: a 64-block-tall slice of the world identified by chunk-Y `cy`, where
  `worldToChunk(x, y, z)` yields `cy = floor(y / CHUNK_DIMENSIONS.height)`.
- **Vertical window**: `cy ∈ [minChunkY, minChunkY + chunkLayerCount)`.
- **minChunkY**: `dimension ? floor(dimension.minY / CHUNK_DIMENSIONS.height) : 0`.
- **chunkLayerCount**: `dimension ? ceil(dimension.height / CHUNK_DIMENSIONS.height) : 1`.

## Invariants

- Default (no `dimension`, or `minY = 0` and `height = CHUNK_DIMENSIONS.height`) MUST
  yield `minChunkY = 0` and `chunkLayerCount = 1` (preserves prior single-layer behavior).
- For any block Y in `[dimension.minY, dimension.minY + dimension.height)`,
  `worldToChunk` MUST yield a `cy` inside the vertical window.

## Requirements

### Requirement: vertical window derives from the dimension
`World` MUST compute `minChunkY` and `chunkLayerCount` from `opts.dimension` and expose
them via accessors.

#### Scenario: default is a single layer
- **GIVEN** a `World` constructed without a `dimension`
- **THEN** `getMinChunkY()` is `0` and `getChunkLayerCount()` is `1`.

#### Scenario: dimension sets the window
- **GIVEN** a `DimensionType` with `minY = 0` and `height = 128`
- **WHEN** a `World` is constructed with it (`CHUNK_DIMENSIONS.height = 64`)
- **THEN** `getMinChunkY()` is `0` and `getChunkLayerCount()` is `2`.

### Requirement: streaming covers every layer in the window
`ensureChunks` MUST enqueue generation for each `cy` in the window for every `(dx,dz)`
within the render distance.

#### Scenario: two-layer dimension streams both cy values
- **GIVEN** a `World` with render distance 2 and a two-layer dimension, streamed to `(0,0)`
- **WHEN** querying the chunk at in-range `(dx,dz) = (1,0)`
- **THEN** `chunkManager` contains chunks at `cy = 0` and `cy = 1` for that column.

#### Scenario: generation queue bound respects the layer count
- **GIVEN** a `World` with render distance `rd` and `chunkLayerCount = L`
- **WHEN** streaming settles
- **THEN** `pendingGeneration` does not exceed `(2*rd + 1)^2 * L`.

### Requirement: preload covers every layer in the window
`preloadChunks` MUST queue each layer of the spawn columns, not only `cy = 0`.

#### Scenario: two-layer preload enqueues L jobs per column
- **GIVEN** a `World` with a two-layer dimension and `preloadChunks(0, 0, 0)`
- **THEN** `pendingGeneration` grows by `1 * 1 * chunkLayerCount` (one column, radius 0).

### Requirement: readiness measures the streamed window without a hardcoded layer
`getReadyProgress` MUST count visible chunks in the streamed window rather than at a
literal `cy = 0`.

#### Scenario: default readiness unchanged
- **GIVEN** the default single-layer `World`
- **WHEN** streaming to `(0,0)` until visible
- **THEN** `getReadyProgress()` reaches `1` (no regression vs prior `cy = 0` behavior).

### Requirement: no behavior change on the default path
When no `dimension` is supplied, streaming scope, queue bounds, unload, and readiness MUST
be identical to the prior single-layer implementation.

#### Scenario: single-layer parity
- **GIVEN** a `World` with render distance 2 and no `dimension`
- **WHEN** streamed to `(0,0)`
- **THEN** exactly the `5×5` `cy=0` columns are generated/meshed and no `cy ≠ 0` chunk
  exists, matching prior behavior.

## Error and failure behavior

- A `DimensionType` with illegal `minY`/`height` is rejected by `DimensionType` itself;
  `World` never sees an invalid window.
- `ensureChunks` honors `CONFIG.maxQueueSize` and short-circuits when full, per layer.

## Performance and resource bounds

Per-`(dx,dz)` work scales by `chunkLayerCount`. Default `1` → identical cost to before.
`ChunkManager` keys by `(cx,cy,cz)`, so per-layer tracking is O(1).

## Compatibility and migration

Optional constructor field only. No stored/public data formats change. Existing call
sites (and `Game`) keep the single-layer default.

## Security and integrity

None beyond `DimensionType` input validation.

## Observability

`getMinChunkY()` / `getChunkLayerCount()` expose the active window; `getStats()` counts
all loaded chunks across layers.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Vertical window derives from dimension | default + two-layer accessor scenarios |
| Streaming covers every layer | two-layer `ensureChunks` column coverage + queue bound |
| Preload covers every layer | two-layer `preloadChunks` job count |
| Readiness measures window | default `getReadyProgress` reaches 1 |
| No behavior change on default | single-layer parity (`5×5`, no `cy≠0`) |
