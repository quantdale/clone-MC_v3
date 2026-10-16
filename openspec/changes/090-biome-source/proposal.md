# Proposal: 090-biome-source

## Problem

016 defines biomes with temperature/colors; 089 samples climate. Nothing selects a biome from
climate at a position.

## Goals

- `BiomeSource(seed, registry, sampler?)`: registry-driven biome selection by nearest climate
  target (089 `climateDistance`), deterministic (ties → lowest registration order).
- `biomeClimateTargets(biome)`: a documented deterministic mapping from the 016 definition
  (temperature + category heuristics) to a five-field `ClimateSample` target.

## Non-goals

- Surface rules (091), climate-driven terrain shaping.
- Per-column biome grids/persistence (later wiring).
- Editing 016 biome data (targets are derived, not stored).

## Preconditions

- Change 089 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 089 baseline (1007 unit / 19 e2e).

## Dependencies

- 016 `BiomeRegistry`/`BiomeTypeDefinition`; 089 `ClimateSampler`/`climateDistance`.

## Proposed change

- `src/worldgen/BiomeSource.ts` (NEW): `biomeClimateTargets(biome)`, `BiomeSource` (`getBiome`,
  `getBiomeKey`), injectable sampler for deterministic tests.
- `tests/unit/BiomeSource.test.ts` (NEW).

## Compatibility and migration

Additive; 016 and 089 untouched.

## Risks

- The temperature→[-1,1] mapping and category heuristics are documented placeholders; the
  selection determinism is the contract.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- `biomeClimateTargets` matches the documented mapping on hand-computed biomes.
- `getBiome` returns the nearest target by `climateDistance`; exact-target samples resolve to
  their biome; ties resolve to the lowest registration index.
- Deterministic across identical (seed, coords); the injected sampler makes selection tests
  exact.
- Only registry biomes are ever returned.
- Full gate green; 090 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 090 suite; E2E stays 19/19.
