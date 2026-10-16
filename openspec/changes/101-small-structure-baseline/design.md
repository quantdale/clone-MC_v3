# Design: 101-small-structure-baseline

## Context / current state

099 provides validated templates + transforms; 100 provides per-chunk start decisions. No
structure appears in the world. `TerrainGenerator` (world layer) already imports worldgen
modules (097).

## Target state

A `StructureGenerator` composes template + placement registries + seed into deterministic
per-chunk structure blocks; the default ruined well is placed end-to-end by `TerrainGenerator`.

## Invariants

- Construction fails fast when any placement config's `templateKey` is absent from the
  template registry.
- `blocksForChunk(chunkX, chunkZ, ctx)` covers every placement config (registration order)
  and every start chunk within `±ceil(maxExtent / 16)` of the queried chunk; blocks are in
  start order, template order; later placements overwrite earlier ones on overlap (documented
  write order).
- A start's origin Y is `ctx.surfaceY(startChunkX * 16 + 8, startChunkZ * 16 + 8)`; template
  block `(bx, by, bz)` maps to world `(startChunkX * 16 + bx, originY + by, startChunkZ * 16 + bz)`.
- `maxExtent` is the maximum template extent across the registry (0 when empty); the window
  uses it so neighboring-chunk starts are never missed.
- Identical inputs produce identical block arrays.

## API and data model

```ts
// src/worldgen/StructureGenerator.ts (NEW)
export interface StructureGeneratorOptions {
  templates: StructureTemplateRegistry;
  placements: StructurePlacementRegistry;
  seed: number;
}
export class StructureGenerator {
  constructor(options: StructureGeneratorOptions); // fail-fast templateKey checks
  get maxExtent(): number;
  startAt(chunkX: number, chunkZ: number, ctx: StructurePlacementContext): StructureStart[];
  blocksForChunk(
    chunkX: number,
    chunkZ: number,
    ctx: StructurePlacementContext,
  ): Array<{ x: number; y: number; z: number; blockId: number }>;
}
export function createDefaultStructureTemplates(): StructureTemplateRegistry;
export function createDefaultStructurePlacements(): StructurePlacementRegistry;
export function createDefaultStructureGenerator(seed: number): StructureGenerator;
```

## Control / data flow

1. 101 registers the default well template + placement config.
2. `TerrainGenerator.generateChunk` (after `placeTrees`) calls `blocksForChunk` with
   `{ biomeKey: getBiomeAt, surfaceY: getHeightAt }` and writes every returned block into the
   chunk (overwrite, `ly` bounds-checked).

## Detailed behavior

- Default template `overworld/ruined_well` (size 5x3x5, 56 blocks, all cobblestone): y=0 the
  full 5x5 minus the center cell (the hollow center stays air); y=1 and y=2 the 16-block outer
  ring only (the inner 3x3 hole is air). The well is dry by design: no water, preserving the
  worldgen invariant that water never appears above sea level.
- Default placement `overworld/ruined_well`: templateKey `overworld/ruined_well`, spacing 12,
  separation 4, salt 40101, biomeKeys `['plains', 'forest', 'taiga']`,
  minSurfaceHeight 33 (just above sea level 32; the terrain surface is ≈ 32 ± 12).
- Write order: placements in registration order; starts in window order; blocks in template
  order. Later writes overwrite earlier (structures replace terrain, unlike tree air-gating).

## Failure modes

- Construction throws when a placement references a missing template; registry validation
  throws on malformed registrations.

## Compatibility / migration

Additive; `TerrainGenerator` constructor gains an optional third parameter defaulting to
`createDefaultStructureGenerator(seed)` (existing call sites unchanged). Generation output
gains deterministic structures.

## Performance / resource constraints

Per chunk: window `(2 * ceil(maxExtent/16) + 1)^2` O(1) queries per placement config; the
default well adds a 9x9 window of O(1) queries and up to 57 writes.

## Testing seams

- `tests/unit/StructureGenerator.test.ts` (NEW): defaults exactness; fail-fast construction;
  `startAt`; exact world blocks for a known start (rotation applied); neighbor-chunk slicing
  with a wide template; determinism; overwrite order; TerrainGenerator integration (compute a
  start with the real ctx, generate the chunk, assert the well's water + cobblestone at exact
  world coords).

## Observability / debugging

Block arrays are plain world-coordinate data; tests assert exact values.

## Affected files / symbols

- `src/worldgen/StructureGenerator.ts` — NEW.
- `src/world/TerrainGenerator.ts` — optional structures + write step.
- `tests/unit/StructureGenerator.test.ts` — NEW.

## Rejected alternatives

- *StructureGenerator writing Chunk directly*: keeping it pure (world-coordinate block arrays)
  preserves the worldgen decoupling and lets any consumer write.
- *Air-gated structure writes*: structures replace terrain by design (a well cuts into the
  surface); the air gate stays a tree/vegetation rule.

## Downstream dependencies

102 golden seeds capture structure fixtures; later structure changes add entity spawning and
connector chaining.
