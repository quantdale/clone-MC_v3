# Design: 087-density-noise-router

## Context / current state

No noise or density primitives exist; 088 terrain needs them.

## Target state

`DensityNoise` provides deterministic hash/value noise + fbm; `DensityComposition` provides a
data-driven, validated density tree with a pure evaluator.

## Invariants

- `hashNoise3D(x, y, z, seed)` is in [0, 1) and deterministic (FNV-1a over integer coordinates
  mixed with the seed).
- `ValueNoise3D(seed, periods)`: lattice values come from hashing `(mod(x, px), mod(y, py),
  mod(z, pz))`; integer-coordinate samples equal the lattice value; samples use smoothstep
  trilinear interpolation; output in [-1, 1]; period wrap is exact.
- `fbm3D(noise, octaves, lacunarity, gain, x, y, z) = Σ gain^i * noise(x·l^i, y·l^i, z·l^i)` with
  documented defaults (4 octaves, lacunarity 2, gain 0.5); bounded by `Σ gain^i`.
- `evaluateDensity(node, ctx, x, y, z)` implements the documented formulas; validation is strict
  (unknown types, malformed fields, depth > 64 rejected).

## API and data model

```ts
// src/worldgen/DensityNoise.ts (NEW)
export function hashNoise3D(x: number, y: number, z: number, seed: number): number; // [0, 1)
export function smoothstep(t: number): number;
export function lerp(a: number, b: number, t: number): number;
export interface NoisePeriods { x: number; y: number; z: number; }
export class ValueNoise3D {
  constructor(seed: number, periods?: Partial<NoisePeriods>); // defaults 256
  sample(x: number, y: number, z: number): number; // [-1, 1]
}
export function fbm3D(noise: ValueNoise3D, octaves: number, lacunarity: number, gain: number, x: number, y: number, z: number): number;

// src/worldgen/DensityComposition.ts (NEW)
export type DensityNode =
  | { type: 'constant'; value: number }
  | { type: 'yGradient'; minY: number; maxY: number; minValue: number; maxValue: number }
  | { type: 'noise'; noise: ValueNoise3D; scaleX: number; scaleY: number; scaleZ: number; offsetX: number; offsetY: number; offsetZ: number }
  | { type: 'add'; a: DensityNode; b: DensityNode }
  | { type: 'multiply'; a: DensityNode; b: DensityNode }
  | { type: 'scale'; a: DensityNode; factor: number }
  | { type: 'offset'; a: DensityNode; amount: number }
  | { type: 'min'; a: DensityNode; b: DensityNode }
  | { type: 'max'; a: DensityNode; b: DensityNode }
  | { type: 'clamp'; a: DensityNode; min: number; max: number };
export interface DensityContext { /* reserved for future samplers */ }
export function evaluateDensity(node: DensityNode, context: DensityContext, x: number, y: number, z: number): number;
export function validateDensityNode(input: unknown, maxDepth?: number): DensityNode;
```

## Control / data flow

1. 088 builds a density tree per column and evaluates it at 3D sample points.
2. Validation runs once at build time; evaluation is hot-path pure.

## Detailed behavior

- `yGradient`: value = `minValue + (maxValue - minValue) * clamp((y - minY) / (maxY - minY), 0, 1)`.
- `noise`: `noise.sample(x * scaleX + offsetX, y * scaleY + offsetY, z * scaleZ + offsetZ)`.
- `add/multiply/min/max` evaluate both children in fixed order (a then b); `scale/offset/clamp`
  apply the scalar after the child.
- Evaluation never mutates nodes or context; NaN/infinite nodes are rejected at validation.

## Failure modes

- Validation throws descriptive errors (unknown type, bad field, depth > 64, non-finite scalars);
  evaluation assumes validated trees.

## Compatibility / migration

Additive.

## Performance / resource constraints

Evaluation is recursive with O(1) per node; validation O(nodes).

## Testing seams

- `tests/unit/DensityNoise.test.ts` (NEW): hash range/determinism/variation; smoothstep/lerp
  endpoints; lattice exactness at integer coords; period wrap; output range; fbm bounds and
  determinism.
- `tests/unit/DensityComposition.test.ts` (NEW): hand-computed evaluations per node type;
  nested trees; validation matrix incl. depth limit.

## Observability / debugging

Values are plain numbers; tests assert exact fixtures.

## Affected files / symbols

- `src/worldgen/DensityNoise.ts` — NEW.
- `src/worldgen/DensityComposition.ts` — NEW.
- Tests: `DensityNoise.test.ts`, `DensityComposition.test.ts` — NEW.

## Rejected alternatives

- *Perlin/simplex noise*: value noise is deterministic, trivial to verify, and sufficient for the
  upcoming terrain; the `ValueNoise3D` interface allows a later swap.
- *Eager evaluated arrays*: the tree evaluator keeps composition data-driven and lazy.

## Downstream dependencies

088 density terrain, 089 climate fields, and 092 carvers consume these primitives.
