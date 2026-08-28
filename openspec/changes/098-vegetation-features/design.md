# Design: 098-vegetation-features

## Context / current state

095 provides the modifier union (count/rarity/heightRange/biomeFilter/survivalFilter) with
absolute height sampling only; 094 provides `blockPatch` scatter configs. Terrain surfaces vary
per column (`TerrainGenerator.getHeightAt`), so vegetation placement needs a surface-relative
height. 097 documented that surface-relative placement lands with the wiring change; 098
delivers the missing primitive (the `surfaceHeight` modifier) plus vegetation feature defaults.

## Target state

`surfaceHeight` is a validated modifier; vegetation configured features (blockPatch patches)
and placed features (count + surfaceHeight + survivalFilter chains) exist as deterministic
defaults; the vegetation id vocabulary is documented.

## Invariants

- `surfaceHeight` takes no parameters; it sets each candidate's y to `ctx.surfaceY(x, z)` and
  consumes no rng draw.
- `PlacementContext.surfaceY(x, z): number` is required.
- The survival invariant extends: a `survivalFilter` requires a preceding `heightRange` or
  `surfaceHeight` in the chain (both define y).
- Vegetation defaults: configured features are `blockPatch` configs over the documented
  vegetation ids; placed features chain `count`, optional `rarity`, `surfaceHeight`,
  `survivalFilter`.
- Everything is deterministic; identical inputs yield identical results.

## API and data model

```ts
// src/worldgen/PlacedFeature.ts (MODIFIED)
export type PlacementModifier =
  | { type: 'count'; tries: number }
  | { type: 'rarity'; chance: number }
  | { type: 'heightRange'; minY: number; maxY: number }
  | { type: 'biomeFilter'; biomeKeys: string[] }
  | { type: 'surfaceHeight' }   // NEW (098)
  | { type: 'survivalFilter' };

export interface PlacementContext {
  biomeKey: string;
  isSolid(x: number, y: number, z: number): boolean;
  surfaceY(x: number, z: number): number;   // NEW (098): terrain surface height
  rng: { nextFloat(): number };
}

// src/worldgen/VegetationFeature.ts (NEW)
export function createDefaultVegetationConfiguredFeatures(): ConfiguredFeatureRegistry;
export function createDefaultVegetationPlacedFeatures(): PlacedFeatureRegistry;
```

## Control / data flow

1. 098 registers vegetation configured features (blockPatch) and placed features
   (count/rarity/surfaceHeight/survivalFilter).
2. Wiring resolves surface heights through the terrain system's height source and executes
   patches at the placed positions.

## Detailed behavior

- Vegetation block-id vocabulary (documented, reserved for the block expansion):
  short grass = 19, poppy = 20, dandelion = 21, red mushroom = 22, brown mushroom = 23.
- Default configured features (all blockPatch):
  - `overworld/short_grass`: blockId 19, tries 16, radiusXZ 4, radiusY 1
  - `overworld/poppy`: blockId 20, tries 6, radiusXZ 3, radiusY 1
  - `overworld/dandelion`: blockId 21, tries 6, radiusXZ 3, radiusY 1
  - `overworld/red_mushroom`: blockId 22, tries 3, radiusXZ 2, radiusY 1
  - `overworld/brown_mushroom`: blockId 23, tries 3, radiusXZ 2, radiusY 1
- Default placed features (095 chains; surfaceHeight satisfies the survival invariant):
  - `overworld/short_grass`: [count 8, surfaceHeight, survivalFilter]
  - `overworld/poppy`: [count 2, rarity 2, surfaceHeight, survivalFilter]
  - `overworld/dandelion`: [count 2, rarity 2, surfaceHeight, survivalFilter]
  - `overworld/red_mushroom`: [count 1, rarity 4, surfaceHeight, survivalFilter]
  - `overworld/brown_mushroom`: [count 1, rarity 4, surfaceHeight, survivalFilter]

## Failure modes

- Validation rejects malformed modifiers/features with descriptive errors; `surfaceHeight`
  with a context lacking `surfaceY` fails fast at application time (the field is required by
  the type, so this only affects hand-constructed contexts).

## Compatibility / migration

Additive union member. `PlacementContext` gains a required field; the 095 test context helper
is updated mechanically. 095's spec invariant line is amended (documented extension); all 095
behavior and tests otherwise unchanged.

## Performance / resource constraints

`surfaceHeight` is O(1) per candidate, no rng draws; defaults construction O(1).

## Testing seams

- `tests/unit/VegetationFeature.test.ts` (NEW): surfaceHeight behavior (y from callback, no
  draws, chain order, survival after surfaceHeight valid, survival without either y-definer
  rejected); vegetation defaults (exact registries, determinism, all chains validate);
  regression that the modifier matrix still holds.
- `tests/unit/PlacedFeature.test.ts` (MODIFIED): context helper gains `surfaceY`.

## Observability / debugging

Plain validated data; tests assert exact values.

## Affected files / symbols

- `src/worldgen/PlacedFeature.ts` — union, validator, context, placeFeature, survival
  invariant.
- `src/worldgen/VegetationFeature.ts` — NEW.
- `tests/unit/PlacedFeature.test.ts` — helper updated.
- `tests/unit/VegetationFeature.test.ts` — NEW.
- `openspec/changes/095-placed-feature-core/specs/placed-feature-core/spec.md` — invariant
  amendment note.

## Rejected alternatives

- *Vegetation placed features with absolute heightRange*: meaningless on varying terrain.
- *Defer surface placement to wiring entirely*: 098's placed features would be inert data;
  the modifier is the minimal primitive that makes them real.
- *Optional `surfaceY` in the context*: required keeps the contract strict and fails fast.

## Downstream dependencies

The wiring change places vegetation (and later trees) via surface-relative chains and executes
patches into columns; the block expansion materializes ids 19-23.
