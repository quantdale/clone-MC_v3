# Design: 100-structure-placement-core

## Context / current state

099 defines validated structure templates with transforms. No placement exists. The worldgen
layer is pure and deterministic (SeedRng 054, hash3 from math/PRNG).

## Target state

A validated placement config and a deterministic per-chunk query: given a chunk, decide whether
it holds a structure start (seeded region offsets, biome gate, terrain gate) and which rotation
to apply. A 003-pattern registry stores configs.

## Invariants

- `spacing` positive integer (region size in chunks); `separation` integer in `[0, spacing)`;
  `salt` non-negative integer; `biomeKeys` non-empty array of non-empty strings;
  `minSurfaceHeight` integer; `key`/`templateKey` non-empty strings.
- Region of chunk `(cx, cz)` is `(floor(cx / spacing), floor(cz / spacing))`; the start offset
  per axis is drawn uniformly in `[0, spacing - separation)` from
  `SeedRng(hash3(regionX, salt, regionZ, seed))`; draw order: offsetX, offsetZ, then rotation
  (`nextInt(4) * 90`).
- A chunk holds the start iff it equals the start chunk, the biome at the start chunk center
  is in `biomeKeys`, and `surfaceY` at that center is >= `minSurfaceHeight`.
- Identical `(config, ctx, chunk, seed)` MUST produce identical results.

## API and data model

```ts
// src/worldgen/StructurePlacement.ts (NEW)
export interface StructurePlacementConfig {
  key: string;
  templateKey: string;
  spacing: number;
  separation: number;
  salt: number;
  biomeKeys: string[];
  minSurfaceHeight: number;
}
export function validateStructurePlacementConfig(input: unknown): StructurePlacementConfig;

export interface StructurePlacementContext {
  biomeKey(x: number, z: number): string;
  surfaceY(x: number, z: number): number;
}

export interface StructureStart {
  configKey: string;
  templateKey: string;
  chunkX: number;
  chunkZ: number;
  rotation: StructureRotation; // 099 type
  mirror: StructureMirror;     // 099 type; always 'none' in 100
}
export function structureStartAtChunk(
  config: StructurePlacementConfig,
  ctx: StructurePlacementContext,
  chunkX: number,
  chunkZ: number,
  seed: number,
): StructureStart | null;

export class StructurePlacementRegistry {
  register(config: StructurePlacementConfig): void;
  get(key: string): StructurePlacementConfig | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. 100 registers placement configs (101 defines the first).
2. Worldgen asks `structureStartAtChunk` per chunk; on a start, 101 applies
   `applyStructureTransform` with the returned rotation and writes blocks.

## Detailed behavior

- Region seed: `hash3(regionX, salt, regionZ, seed)`; offsets drawn with `SeedRng.nextInt`
  in the documented order. Because the offset range is `spacing - separation` wide and starts
  are one per region, two starts in adjacent regions are at least `separation` chunks apart.
- Start chunk center in world blocks: `(chunkX * 16 + 8, chunkZ * 16 + 8)`.
- Biome gate runs before the terrain gate; both are per-start decisions (null otherwise).

## Failure modes

- Validation throws descriptive errors naming the offending field; registry operations reject
  invalid/duplicate registrations atomically.

## Compatibility / migration

Additive.

## Performance / resource constraints

Query is O(1): one region hash, ≤ 3 draws, two gates.

## Testing seams

- `tests/unit/StructurePlacement.test.ts` (NEW): validation matrix; determinism (same inputs
  twice); exact vectors for known seeds (offset ranges, rotation draws, draw order);
  boundary/negative regions (floor division); separation across adjacent regions; biome gate
  match/mismatch; terrain gate below/at/above threshold; registry lifecycle/atomicity.

## Observability / debugging

Plain data; tests assert exact starts.

## Affected files / symbols

- `src/worldgen/StructurePlacement.ts` — NEW.
- `tests/unit/StructurePlacement.test.ts` — NEW.

## Rejected alternatives

- *Random-walk placement from a global stream*: per-region seeding makes every chunk query
  self-contained and reproducible (MC-style).
- *Placement without separation*: spacing/separation is the documented MC-like model and
  keeps structures non-overlapping.
- *Mirror choice in 100*: rotation-only keeps the contract small; mirror is a 099 capability
  used by later structure work.

## Downstream dependencies

101 defines the first placement config + template and places it end-to-end.
