# Spec: small-structure-baseline

## Contract

`createDefaultStructureTemplates`/`createDefaultStructurePlacements` MUST produce the
documented deterministic defaults. `StructureGenerator` construction MUST fail fast when a
placement config references a missing template. `blocksForChunk` MUST return the deterministic
world-coordinate structure blocks within the chunk footprint for every intersecting start
(placements in registration order; window `±ceil(maxExtent / 16)`; later placements overwrite
earlier on overlap). `TerrainGenerator` MUST write those blocks into generated chunks after
trees, overwriting existing blocks.

## Definitions

- **Default template** `overworld/ruined_well` (size 5x3x5, 56 blocks, all cobblestone): y=0
  the full 5x5 minus the center cell; y=1 and y=2 the 16-block outer ring only. Dry by design
  (no water, preserving the no-water-above-sea-level invariant).
- **Default placement** `overworld/ruined_well`: spacing 12, separation 4, salt 40101,
  biomeKeys `['plains', 'forest', 'taiga']`, minSurfaceHeight 33.
- **Origin Y**: `ctx.surfaceY(startChunkX * 16 + 8, startChunkZ * 16 + 8)`; template block
  `(bx, by, bz)` -> world `(startChunkX * 16 + bx, originY + by, startChunkZ * 16 + bz)`.
- **maxExtent**: maximum template extent across the registry (0 when empty).

## Invariants

- Construction throws when any placement's `templateKey` is missing from the templates.
- Block array order: placements in registration order; starts in window order; blocks in
  template order. Later writes overwrite earlier ones.
- Identical `(options, chunk, ctx)` MUST produce identical block arrays.
- Every block returned for chunk `(cx, cz)` lies in `[cx * 16, cx * 16 + 16) x [cz * 16,
  cz * 16 + 16)` horizontally.

## Requirements

### Requirement: defaults
The default builders MUST produce the documented values deterministically.

#### Scenario: default registries
- **GIVEN** the default template and placement builders
- **WHEN** inspected
- **THEN** the template registry contains exactly the well (56 cobblestone blocks: 24 at y=0
  minus the center cell, 16 at y=1, 16 at y=2) and the placement registry exactly its config,
  and repeated construction yields equal registries.

### Requirement: generator construction
`StructureGenerator` MUST fail fast on invalid composition.

#### Scenario: missing template reference
- **GIVEN** a placement config whose templateKey is not in the template registry
- **WHEN** the generator is constructed
- **THEN** it throws a descriptive error.

### Requirement: deterministic blocks
`blocksForChunk` MUST produce the documented blocks.

#### Scenario: start chunk blocks
- **GIVEN** a known start (from `startAt`) with its rotation
- **WHEN** `blocksForChunk` runs for the start chunk
- **THEN** the returned blocks match the transformed template at world coordinates
  (origin Y from the surface), within the chunk footprint.

#### Scenario: neighbor-chunk slicing
- **GIVEN** a template wider than 16 blocks placed in a start chunk
- **WHEN** `blocksForChunk` runs for an adjacent chunk
- **THEN** the overlapping part of the structure appears in that chunk's blocks.

#### Scenario: overwrite order
- **GIVEN** two placement configs whose structures overlap at a cell
- **WHEN** `blocksForChunk` runs
- **THEN** the later-registered placement's block wins at the overlap.

#### Scenario: determinism
- **GIVEN** identical options, chunk and ctx
- **WHEN** `blocksForChunk` runs twice
- **THEN** the results are identical.

### Requirement: terrain integration
`TerrainGenerator` MUST write structures into generated chunks.

#### Scenario: well appears end-to-end
- **GIVEN** the default generator with a fixed seed
- **WHEN** a chunk containing a computed well start is generated
- **THEN** the well's cobblestone blocks exist at the exact world coordinates derived from
  the start, rotation and surface origin.

## Error and failure behavior

- Construction and validation throw descriptive errors; no partial state.

## Performance and resource bounds

Per chunk: window `(2 * ceil(maxExtent / 16) + 1)^2` O(1) placement queries per config;
default well window is 9x9 with up to 57 writes.

## Compatibility and migration

Additive; `TerrainGenerator`'s constructor gains an optional third parameter (defaulted), so
existing call sites and tests are unchanged. Worlds gain deterministic structures.

## Security and integrity

Not applicable.

## Observability

Block arrays are plain world-coordinate data; tests assert exact values.

## Verification mapping

- `tests/unit/StructureGenerator.test.ts` — defaults, fail-fast construction, startAt,
  exact blocks with rotation, neighbor slicing, overwrite order, determinism,
  TerrainGenerator end-to-end integration.
