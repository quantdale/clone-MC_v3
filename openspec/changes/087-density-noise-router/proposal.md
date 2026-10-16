# Proposal: 087-density-noise-router

## Problem

Worldgen terrain (088+) needs reusable 3D density/noise composition primitives: a deterministic
noise source and a data-driven tree of density combinators. Nothing exists.

## Goals

- Deterministic 3D value noise (`hashNoise3D`, `ValueNoise3D` with trilinear smooth interpolation
  and periodic tiling) plus `fbm3D` fractal composition.
- A data-driven `DensityNode` tree (constant, y-gradient, noise, add, multiply, scale, offset,
  min, max, clamp) with a pure `evaluateDensity` and strict recursive validation.

## Non-goals

- Terrain generation itself (088+).
- Biome/climate noise (089+).
- Perlin/simplex implementations (value noise is deterministic, simple, and sufficient; swappable
  later).

## Preconditions

- Change 086 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 086 baseline (975 unit / 19 e2e).

## Dependencies

- 048 FNV-1a hash pattern; 054 seeded-RNG conventions (seed as integer).

## Proposed change

- `src/worldgen/DensityNoise.ts` (NEW): `hashNoise3D`, `smoothstep`, `lerp`, `ValueNoise3D`,
  `fbm3D`.
- `src/worldgen/DensityComposition.ts` (NEW): `DensityNode`, `DensityContext`, `evaluateDensity`,
  `validateDensityNode`.
- `tests/unit/DensityNoise.test.ts` (NEW), `tests/unit/DensityComposition.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Value-noise periodicity requires power-of-two-friendly hashing of lattice indices; the
  documented period defaults keep tiling exact.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- `hashNoise3D` returns values in [0, 1), deterministic for identical (x, y, z, seed).
- `ValueNoise3D`: lattice values at integer coords, smooth interpolation between, exact period
  wrap, range within [-1, 1].
- `fbm3D` bounded and deterministic (documented octave/gain defaults).
- Density nodes evaluate per documented formulas (hand-computed fixtures); validation rejects
  unknown types, malformed fields, and over-deep trees.
- Full gate green; 087 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 087 suite; E2E stays 19/19.
