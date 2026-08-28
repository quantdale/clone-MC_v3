# Design: 094-configured-feature-core

## Context / current state

Terrain, biomes, surfaces, caves, and aquifers exist (088-093). No feature definitions exist;
096/097 need them.

## Target state

`ConfiguredFeature` (key + validated config) and its registry provide the data-driven feature
core. The config union is the documented extension point for 096 (ore) and 097 (tree).

## Invariants

- Core configs: `simpleBlock { blockId }`; `blockPatch { blockId; tries; radiusXZ; radiusY }`
  (tries/radii positive integers).
- Validation rejects unknown types, missing fields, non-integer/non-positive values, and invalid
  block ids.
- The registry stores only validated definitions; duplicates and invalid inputs throw without
  partial state.
- Defaults are deterministic.

## API and data model

```ts
// src/worldgen/ConfiguredFeature.ts (NEW)
export type ConfiguredFeatureConfig =
  | { type: 'simpleBlock'; blockId: number }
  | { type: 'blockPatch'; blockId: number; tries: number; radiusXZ: number; radiusY: number };
export interface ConfiguredFeature { key: string; config: ConfiguredFeatureConfig; }
export function validateConfiguredFeatureConfig(input: unknown): ConfiguredFeatureConfig;
export function validateConfiguredFeature(input: unknown): ConfiguredFeature;
export class ConfiguredFeatureRegistry {
  register(key: string, config: ConfiguredFeatureConfig): void;
  get(key: string): ConfiguredFeature | null;
  has(key: string): boolean;
  get size(): number;
  clear(): void;
}
export function createDefaultConfiguredFeatures(): ConfiguredFeatureRegistry;
```

## Control / data flow

1. 095/096/097 define and register configured features.
2. The placement wiring resolves features by key and executes them.

## Detailed behavior

- `simpleBlock`: places one block at the placement position.
- `blockPatch`: scatters up to `tries` blocks within `radiusXZ` × `radiusY` of the position
  (execution lands in later wiring).
- Defaults (documented): `overworld/dirt_patch` (blockPatch), `overworld/gravel_patch`
  (blockPatch).

## Failure modes

- Validation throws descriptive errors; registry operations reject invalid inputs atomically.

## Compatibility / migration

Additive.

## Performance / resource constraints

Registry O(1) lookups; validation O(1) per config.

## Testing seams

- `tests/unit/ConfiguredFeature.test.ts` (NEW): validation matrix; registry lifecycle
  (register/get/has/size/clear, duplicate/invalid atomic rejection); defaults; determinism.

## Observability / debugging

Features are plain validated data; tests assert exact values.

## Affected files / symbols

- `src/worldgen/ConfiguredFeature.ts` — NEW.
- `tests/unit/ConfiguredFeature.test.ts` — NEW.

## Rejected alternatives

- *Free-form config records*: typed unions keep validation strict and deterministic.
- *Config-per-feature classes*: the data-driven registry model matches 003/016 conventions.

## Downstream dependencies

095 adds placement layers; 096 ore and 097 tree features extend the config union and register
defaults.
