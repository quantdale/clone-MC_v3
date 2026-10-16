# Proposal: 092-cave-carver-system

## Problem

088 terrain is solid; caves do not exist. MC carves 3D caves independently of terrain density;
no carving stage exists.

## Goals

- A configurable 3D cave carver independent of terrain density: `carveValue(seed, x, y, z)` (a
  documented two-noise formula) and `carveColumn(seed, columnX, columnZ, config?)` producing a
  deterministic sparse carved mask.
- `applyCarving(column, carved)`: pure application removing carved cells from a 088
  `TerrainColumn` (with a small additive `removeCell` on the column).

## Non-goals

- Aquifer decisions (093).
- Surface-breaking caves / entrances (a wiring concern).
- Noise cave "cheese/spaghetti" tuning (threshold and formula are documented placeholders).

## Preconditions

- Change 091 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 091 baseline (1022 unit / 19 e2e).

## Dependencies

- 087 `fbm3D`/`ValueNoise3D`; 088 `TerrainColumn`.

## Proposed change

- `src/worldgen/CaveCarver.ts` (NEW): `CaveCarverConfig`, `carveValue`, `CarvedColumn`,
  `carveColumn`, `applyCarving`.
- `src/worldgen/OverworldTerrain.ts`: add `removeCell` to `TerrainColumn` (additive).
- `tests/unit/CaveCarver.test.ts` (NEW); extend `tests/unit/OverworldTerrain.test.ts`.

## Compatibility and migration

Additive; 088 gains one removal method used by the carver.

## Risks

- The carve formula's threshold must produce non-trivial carving across seeds without gutting
  terrain; the documented defaults are validated in tests (a fixture asserts a nonzero carve
  count).

## Rollback strategy

Revert the commit; additive.

## Definition of Done

- `carveValue` is deterministic and bounded; `carveColumn` yields a sparse mask confined to
  `[minY, maxY)`.
- Different seeds produce differing masks (spot-checked).
- `applyCarving` removes exactly the carved cells and leaves the input column untouched.
- `removeCell` on `TerrainColumn` removes a stored cell (null after removal).
- Full gate green; 092 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 092 suite; E2E stays 19/19.
