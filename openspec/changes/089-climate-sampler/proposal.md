# Proposal: 089-climate-sampler

## Problem

Biome selection (090) needs per-position climate fields. No temperature/humidity/continentalness/
erosion/weirdness-like sampler exists.

## Goals

- `ClimateSampler(worldSeed)`: deterministic 2D sampling of five MC-like climate fields, each in
  [-1, 1], each from its own seed-derived noise field (087 fbm).
- `ClimateSample` value type with strict validation and a `climateDistance` metric for biome
  matching (090).

## Non-goals

- Biome selection (090), surface rules (091).
- Altitude-adjusted temperature (a later refinement; the sampler is 2D).
- Climate persistence/serialization.

## Preconditions

- Change 088 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 088 baseline (999 unit / 19 e2e).

## Dependencies

- 087 `ValueNoise3D`/`fbm3D`; 088 seed-derivation pattern (XOR offsets).

## Proposed change

- `src/worldgen/ClimateSampler.ts` (NEW): `ClimateSample`, `ClimateSampler`,
  `validateClimateSample`, `climateDistance`.
- `tests/unit/ClimateSampler.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Field scales/derivations are documented placeholders; the ranges and determinism are the
  contract.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- All five fields sample into [-1, 1] across a grid; identical (seed, x, z) → identical samples.
- Different seeds produce differing fields (spot-checked).
- `validateClimateSample` accepts exactly in-range finite values.
- `climateDistance` is 0 for identical samples, symmetric, and matches hand-computed values.
- Full gate green; 089 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 089 suite; E2E stays 19/19.
