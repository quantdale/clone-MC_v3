# Design: 090-biome-source

## Context / current state

016 biome definitions exist (temperature + category); 089 samples climate fields. No selection
exists.

## Target state

`BiomeSource` selects the nearest biome by climate distance; `biomeClimateTargets` derives each
biome's target from its 016 definition deterministically.

## Invariants

- `biomeClimateTargets` maps: temperature → `clamp(biome.temperature / 2.5, -1, 1)`; humidity,
  continentalness, erosion from the documented category table; weirdness 0.
- Selection: argmin over registry biomes of `climateDistance(sample, target)`; ties → lowest
  registration index (deterministic).
- The sampler is injectable (structural `{ sample(x, z): ClimateSample }`); the default is
  `new ClimateSampler(seed)`.

## API and data model

```ts
// src/worldgen/BiomeSource.ts (NEW)
export function biomeClimateTargets(biome: BiomeTypeDefinition): ClimateSample;
export class BiomeSource {
  constructor(seed: number, registry: BiomeRegistry, sampler?: { sample(x: number, z: number): ClimateSample });
  getBiome(x: number, z: number): BiomeTypeDefinition;
  getBiomeKey(x: number, z: number): string;
}
```

## Control / data flow

1. Callers query `getBiome(x, z)` per position.
2. The source samples climate, computes distances to every registry biome target, and picks the
   argmin with deterministic tie-break.

## Detailed behavior

- Category tables (documented): humidity — OCEAN/SWAMP/JUNGLE/MUSHROOM 0.9, RIVER 0.8, FOREST
  0.6, PLAINS 0.3, TAIGA/SNOWY_TUNDRA/EXTREME_HILLS 0.2, DESERT -0.9; continentalness — OCEAN/RIVER
  -1, MUSHROOM -0.5, SWAMP 0.3, PLAINS 0.2, FOREST 0.4, TAIGA 0.5, JUNGLE 0.6, SNOWY_TUNDRA 0.6,
  DESERT 0.7, EXTREME_HILLS 0.9; erosion — OCEAN/RIVER 0.9/0.8, MUSHROOM 0.7, DESERT 0.6, PLAINS
  0.5, FOREST/TAIGA/JUNGLE/SWAMP 0.3, SNOWY_TUNDRA 0.4, EXTREME_HILLS -0.8; weirdness 0.
- Targets are computed once per biome at construction (cached).

## Failure modes

- None beyond registry invariants (016 is validated).

## Compatibility / migration

Additive.

## Performance / resource constraints

`getBiome` = 1 climate sample + O(biomes) distance computations.

## Testing seams

- `tests/unit/BiomeSource.test.ts` (NEW): target mapping hand-computed; nearest selection with an
  injected sampler (exact targets, off-target, tie-break); determinism with the real sampler;
  registry-only results.

## Observability / debugging

Biome keys are plain strings; tests assert exact selections.

## Affected files / symbols

- `src/worldgen/BiomeSource.ts` — NEW.
- `tests/unit/BiomeSource.test.ts` — NEW.

## Rejected alternatives

- *Store climate targets in 016 definitions*: churns a verified data model; derived targets keep
  this change additive.
- *Random tie-break*: registration-order ties are deterministic.

## Downstream dependencies

091 surface rules and 094+ features query biomes; the world wiring drives the source per column.
