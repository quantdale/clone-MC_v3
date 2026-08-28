# Proposal: 072-biome-tint-rendering

## Problem

016 defines per-biome grass/foliage/water colors, but no surface can declare which tint applies and
nothing resolves a biome into a concrete tint. Grass/foliage/water-like surfaces have no tint
attributes, so a renderer cannot color them per biome.

## Goals

- Model faces declare an optional, MC-style tint attribute (`tintindex`) with a strict vocabulary:
  `grass` | `foliage` | `water`; validation rejects unknown values.
- A deterministic resolver maps a biome definition + tint kind to a concrete 24-bit RGB color:
  grass → `grassColor`, foliage → `foliageColor`, water → `waterColor` with a documented default
  fallback when absent.
- Both pieces are pure, additive, and tested; nothing existing changes behavior.

## Non-goals

- Per-position biome lookup or blending (temperature/humidity noise, swamp variation) — a world
  wiring concern.
- Baking tints into meshes (later wiring consumes the resolver per chunk).
- Texture atlases or color-multiplier rendering (a renderer concern).

## Preconditions

- Change 071 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 071 baseline (804 unit / 19 e2e).

## Dependencies

- 016 `BiomeTypeDefinition` colors + `biomeColorToRGB`; 059 `BlockModelFace` schema + validation.

## Proposed change

- `src/data/BlockModel.ts`: `BlockModelFace.tintindex?: TintKind` (`TintKind = 'grass' | 'foliage' |
  'water'`); `validateBlockModel` accepts and preserves it, rejecting unknown/non-string values.
- `src/data/Biome.ts`: export `DEFAULT_WATER_COLOR` (additive; already the internal fallback).
- `src/rendering/BiomeTint.ts` (NEW): `TintKind` re-export, `BiomeTint { kind, color, rgb }`,
  `biomeTintColor(biome, kind): BiomeColor`, `biomeTint(biome, kind): BiomeTint` (water falls back
  to `DEFAULT_WATER_COLOR` when `waterColor` is absent).
- `tests/unit/BiomeTint.test.ts` (NEW); `tests/unit/BlockModel.test.ts` extended for `tintindex`.

## Compatibility and migration

Additive: an optional field on `BlockModelFace` (validation accepts it; models without it validate
unchanged), an exported constant, and a new module. No serialized-data changes.

## Risks

- Magic-number tint indices (legacy MC) are avoided by design: string kinds only.
- Water fallback must match 016's internal default exactly — solved by exporting the constant.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- `tintindex` validates and round-trips through `validateBlockModel` for all three kinds; unknown
  values throw descriptive errors; absent `tintindex` models behave exactly as before.
- `biomeTintColor`/`biomeTint` are pure and deterministic: grass/foliage resolve to the biome's
  colors, water resolves to `waterColor` or the documented default; `rgb` matches `biomeColorToRGB`.
- All 10 default biomes resolve all three kinds.
- Full gate green; 072 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 072 suite; E2E stays 19/19.
