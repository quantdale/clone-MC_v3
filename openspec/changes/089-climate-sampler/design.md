# Design: 089-climate-sampler

## Context / current state

088 generates terrain; biome selection (090) needs climate fields first.

## Target state

`ClimateSampler` deterministically samples five MC-like fields at (x, z): temperature, humidity,
continentalness, erosion, weirdness — each in [-1, 1] — plus a distance metric for biome matching.

## Invariants

- Each field = `clamp(fbm4(fieldNoise, x·scale, 0, z·scale), -1, 1)` with a per-field noise
  instance derived from the world seed by a distinct XOR offset and a documented scale.
- Fields are independent (separate noise instances).
- `sample` is 2D and pure; identical (seed, x, z) → identical samples.
- `climateDistance(a, b)` = Euclidean distance over the five fields.
- `validateClimateSample` accepts exactly finite values in [-1, 1].

## API and data model

```ts
// src/worldgen/ClimateSampler.ts (NEW)
export interface ClimateSample {
  temperature: number;   // [-1, 1]
  humidity: number;      // [-1, 1]
  continentalness: number; // [-1, 1]
  erosion: number;       // [-1, 1]
  weirdness: number;     // [-1, 1]
}
export class ClimateSampler {
  constructor(worldSeed: number);
  sample(x: number, z: number): ClimateSample;
}
export function validateClimateSample(input: unknown): ClimateSample;
export function climateDistance(a: ClimateSample, b: ClimateSample): number;
```

## Control / data flow

1. 090 queries `sample(wx, wz)` per position and matches biomes by `climateDistance`.
2. Sampler state is immutable; sampling is hot-path pure.

## Detailed behavior

- Noise derivation: field i uses `ValueNoise3D(worldSeed ^ 0x9e3779b9 · (i + 1))` (deterministic
  distinct offsets).
- Scales (documented placeholders): temperature 0.002, humidity 0.003, continentalness 0.001,
  erosion 0.005, weirdness 0.007.
- fbm defaults: 4 octaves, lacunarity 2, gain 0.5.

## Failure modes

- Validation throws descriptive errors for out-of-range/non-finite values.

## Compatibility / migration

Additive.

## Performance / resource constraints

Each sample = 5 fbm evaluations (4 octaves each); O(1) with respect to position.

## Testing seams

- `tests/unit/ClimateSampler.test.ts` (NEW): determinism (same seed/coords, cross-instance);
  range across a grid; seed sensitivity; positional variation; distance metric (identical,
  symmetric, hand-computed); validation matrix.

## Observability / debugging

Samples are plain values; tests assert ranges and determinism.

## Affected files / symbols

- `src/worldgen/ClimateSampler.ts` — NEW.
- `tests/unit/ClimateSampler.test.ts` — NEW.

## Rejected alternatives

- *3D climate*: biome selection is 2D; altitude adjustment is a later refinement.
- *Single noise field with offsets*: independent fields keep tunability and match MC's structure.

## Downstream dependencies

090 biome source; 091 surface rules; 093 aquifers may sample continentalness.
