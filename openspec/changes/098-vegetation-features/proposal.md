# Proposal: 098-vegetation-features

## Problem

Grass, flowers, and mushrooms need placed features, but no vegetation vocabulary exists and the
095 modifier union cannot express surface-relative placement (vegetation sits on the terrain
surface, whose height varies per column; 095 `heightRange` is absolute).

## Goals

- Extend the 095 `PlacementModifier` union with `{ type: 'surfaceHeight' }`: sets a candidate's
  y to `ctx.surfaceY(x, z)` (the terrain surface height at the column) with no rng draw.
  The 095 survival invariant extends: `survivalFilter` requires a preceding `heightRange` or
  `surfaceHeight` (both define y).
- `src/worldgen/VegetationFeature.ts` (NEW): deterministic default vegetation configured
  features (blockPatch patches: short grass, poppy, dandelion, red/brown mushroom) and default
  vegetation placed features (count + `surfaceHeight` + survivalFilter chains).
- Documented vegetation block-id vocabulary (tall_grass=19, poppy=20, dandelion=21,
  red_mushroom=22, brown_mushroom=23), reserved for the future block-registry expansion.

## Non-goals

- Adding the vegetation blocks to the world block registry / textures (later block expansion
  change; the feature layer stays decoupled, ids are documented vocabulary).
- Biome/light gating for vegetation (wiring change).
- Executing patches into columns (wiring change).

## Preconditions

- Change 097 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 097 baseline (1086 unit / 19 e2e).

## Dependencies

- 095 modifier union (extension point, same pattern as 096/097 union extensions), 094
  `blockPatch` config, 003 registry patterns.

## Proposed change

- `src/worldgen/PlacedFeature.ts` (MODIFIED): `surfaceHeight` union member + validator case;
  `PlacementContext.surfaceY(x, z)` (required); `placeFeature` case (y = surfaceY(x, z), no
  draw); survival invariant accepts `surfaceHeight` as a y-defining predecessor.
- `src/worldgen/VegetationFeature.ts` (NEW): `createDefaultVegetationConfiguredFeatures`,
  `createDefaultVegetationPlacedFeatures`, documented id vocabulary.
- `tests/unit/PlacedFeature.test.ts` (MODIFIED): `context()` helper gains `surfaceY`.
- `tests/unit/VegetationFeature.test.ts` (NEW).
- `openspec/changes/095-placed-feature-core/specs/placed-feature-core/spec.md` (MODIFIED):
  invariant line amended to reflect the 098 extension (documented amendment).

## Compatibility and migration

Additive union member; existing modifiers and contexts unaffected except `PlacementContext`
gains a required field (only the 095 test helper constructs contexts; updated mechanically).
095's spec invariant is amended to stay normative (survivalFilter requires a preceding
heightRange or surfaceHeight).

## Risks

- The surface-height contract must map to the terrain system's height source during wiring;
  documented via `ctx.surfaceY`.

## Rollback strategy

Revert the commit; additive except the small 095 spec amendment and test-helper update.

## Definition of Done

- `surfaceHeight` validates, sets y from `ctx.surfaceY` without drawing, and satisfies the
  survival invariant; `PlacementContext.surfaceY` is required.
- Vegetation defaults register without error, are deterministic, and all chains validate under
  the extended invariants.
- 095 suite stays green (context helper updated mechanically).
- Full gate green; 098 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 098 suite; E2E stays 19/19.
