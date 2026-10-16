# Proposal: 093-aquifer-system

## Problem

092 carves caves but leaves them empty. MC fills carved space below the water table with
underground water/lava aquifers; no such decision exists.

## Goals

- `classifyAquifer(seed, x, y, z, config?)`: a deterministic per-cell fluid decision
  (`WATER | LAVA | NONE`) from the y-table (above sea level → none; deep below `lavaLevel` →
  lava; between → water) with an optional dryness noise that turns pockets into air.
- `applyAquifers(column, carved, seed, config?, ids?)`: pure application filling carved cells
  with the fluid block ids.

## Non-goals

- Fluid flow simulation (076-084 cover flow; these are initial fills).
- Surface water (088 already fills below sea level).
- Aquifer persistence.

## Preconditions

- Change 092 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 092 baseline (1030 unit / 19 e2e).

## Dependencies

- 092 `CarvedColumn`/`TerrainColumn`; 087 noise; 088 water block id conventions.

## Proposed change

- `src/worldgen/AquiferSystem.ts` (NEW): `AquiferConfig`, `AquiferBlockIds`, `AquiferDecision`,
  `classifyAquifer`, `applyAquifers`.
- `tests/unit/AquiferSystem.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- The dryness noise is sampled inside `classifyAquifer`; exact-table tests use configs that force
  dryness always/never (documented thresholds).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- `classifyAquifer`: y ≥ seaLevel → NONE; below `lavaLevel` → LAVA; between → WATER, subject to
  the dryness noise (config-forced never-dry and always-dry thresholds verified exactly).
- `applyAquifers` fills exactly the carved cells (water/lava ids or air), preserves everything
  else, and never mutates its input.
- Deterministic; config validation (finite thresholds, `lavaLevel < seaLevel`).
- Full gate green; 093 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 093 suite; E2E stays 19/19.
