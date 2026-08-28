# Proposal: 088-overworld-density-terrain

## Problem

The game's worldgen has no terrain generator: no density-function terrain, no modern-height
(-64..320) columns, no deterministic seed-preserving output.

## Goals

- `generateTerrainColumn(seed, columnX, columnZ, config, ids)`: a deterministic 16×16 column of
  modern-height terrain derived from a density function (087 noise primitives): stone where
  density > 0, water filling below sea level, bedrock at the world bottom.
- Sparse, deterministic output (`TerrainColumn`) with per-cell lookup and surface-height queries,
  plus documented default config (-64..320, sea level 63).

## Non-goals

- Biomes/climate (089+), surface rules (091), carvers (092), aquifers (093).
- World wiring/chunk storage (a later change consumes columns).
- Structure/feature placement (094+).

## Preconditions

- Change 087 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 087 baseline (990 unit / 19 e2e).

## Dependencies

- 087 `ValueNoise3D`/`fbm3D`; 054 seeded-RNG conventions (seed as integer).

## Proposed change

- `src/worldgen/OverworldTerrain.ts` (NEW): `OverworldTerrainConfig` (+ defaults), `TerrainBlockIds`
  (+ defaults), `TerrainColumn` (`getBlock`, `blockCount`, `surfaceHeightAt`),
  `generateTerrainColumn`.
- `tests/unit/OverworldTerrain.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes. The current placeholder terrain in the game is NOT migrated
(088 is the generator; wiring is a later change).

## Risks

- The 087 noise lattice wraps at its period (256); terrain sampled beyond ±256 columns repeats
  deterministically — documented, acceptable for this stage.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Determinism: identical (seed, column) → identical columns; different seeds → differing terrain.
- Classification invariants: every non-air cell is stone/water/bedrock; water only below sea
  level; bedrock exactly at `minY`; nothing outside `[minY, maxY)`.
- `surfaceHeightAt` returns the highest solid y in `[minY, maxY)`.
- Sparse output with correct local index math (16×16 footprint × height).
- Full gate green; 088 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 088 suite; E2E stays 19/19.
