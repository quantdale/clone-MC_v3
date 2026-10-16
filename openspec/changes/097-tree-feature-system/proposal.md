# Proposal: 097-tree-feature-system

## Problem

Tree shapes are hard-coded in `src/world/TerrainGenerator.ts` (fixed trunk height draw, fixed
5x5x3 canopy, no configuration surface). 098 vegetation and later wiring need configurable
trunk/foliage tree features.

## Goals

- Extend the 094 `ConfiguredFeatureConfig` union with a `tree` type: configurable trunk
  (block id, min/max height) and foliage (block id, shape, radius).
- `buildTreeBlocks` deterministically produces the trunk/foliage block layout for a tree config
  (uniform height sampling; documented shape tables for `round`/`flatTop`/`spruce`).
- `createDefaultTreeConfiguredFeatures` registers a deterministic default oak feature.
- Replace TerrainGenerator's hard-coded tree building with the tree feature system while
  preserving the exact per-column placement gating (biome/density) and bit-identical world
  output.

## Non-goals

- Tree placement via 095 chains (absolute height ranges cannot express surface-relative trees;
  lands with the worldgen wiring change).
- Additional tree species/shapes beyond the documented three.
- Vegetation features (098).

## Preconditions

- Change 096 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 096 baseline (1075 unit / 19 e2e).

## Dependencies

- 094 `ConfiguredFeatureConfig` union (extension point), 054-style rng draw conventions,
  existing `PRNG`/`hash2` for TerrainGenerator determinism.

## Proposed change

- `src/worldgen/ConfiguredFeature.ts` (MODIFIED): add the `tree` union member and validation.
- `src/worldgen/TreeFeature.ts` (NEW): `TreeShape`, `TreeTrunkConfig`, `TreeFoliageConfig`,
  `TreeBlock`, `buildTreeBlocks`, `createDefaultTreeConfiguredFeatures`.
- `src/world/TerrainGenerator.ts` (MODIFIED): replace hard-coded trunk/canopy writing with
  `buildTreeBlocks` over the default oak feature; placement gating and draw sequence unchanged
  (bit-identical output).
- `tests/unit/TreeFeature.test.ts` (NEW); TerrainGenerator tests remain the regression gate for
  the rewire.

## Compatibility and migration

Additive union member. TerrainGenerator output is bit-identical: the density draw and the trunk
height draw use the same `PRNG` stream and same sampling (`floor(next()*span)+min`), and the
default oak (trunk 4-5, round radius 2) matches the old hard-coded shape exactly.

## Risks

- The rewire must not change chunk output; guaranteed by draw-sequence identity and covered by
  the existing determinism/tree tests plus E2E.

## Rollback strategy

Revert the commit; additive except the TerrainGenerator rewire, which reverts to hard-coded
trees.

## Definition of Done

- `tree` configs validate strictly; malformed configs throw descriptive errors.
- `buildTreeBlocks` matches the documented shape tables and is deterministic.
- Defaults register without error and are deterministic.
- TerrainGenerator consumes the tree feature system with bit-identical output (all existing
  TerrainGenerator tests and E2E pass unchanged).
- Full gate green; 097 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 097 suite; E2E stays 19/19.
