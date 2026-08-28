# Proposal: 091-surface-rule-engine

## Problem

088/090 generate terrain and biomes, but the terrain surface is uniform stone. MC replaces
surface layers with biome- and noise-driven rules (grass, sand, gravel); no such engine exists.

## Goals

- A layered surface-rule engine: ordered rules of `condition → blockId (+ depth)` where conditions
  compose biome, height, and noise predicates (always, biome key, y-range, noise threshold, not,
  and, or).
- First-match-wins application with depth semantics (a rule with depth N replaces the top N solid
  cells of a column), purely and deterministically.
- Strict validation of rules and conditions.

## Non-goals

- Default overworld rule sets (the wiring builds them; this change is the engine).
- Applying rules to columns (a later wiring consumes 088 columns + 090 biomes).
- Block-state properties beyond block ids.

## Preconditions

- Change 090 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 090 baseline (1013 unit / 19 e2e).

## Dependencies

- 088 `TerrainColumn` (consumed later); 090 biome keys; 087 noise (via a caller-supplied
  sampler callback).

## Proposed change

- `src/worldgen/SurfaceRuleEngine.ts` (NEW): `SurfaceCondition` union, `SurfaceRule`,
  `SurfaceRuleContext`, `evaluateSurfaceCondition`, `applySurfaceRules`,
  `validateSurfaceRules`.
- `tests/unit/SurfaceRuleEngine.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Depth semantics must be unambiguous: `depthFromSurface` 0 = the surface cell; a rule's depth is
  the number of cells it replaces from the surface downward.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Condition evaluation matches the documented matrix (hand-computed fixtures).
- `applySurfaceRules` returns the first matching rule's block id (or null); depth limits how many
  layers a rule covers; rules never mutate context.
- Validation rejects unknown condition types, malformed fields, invalid depths, and non-negative
  block-id violations.
- Deterministic; full gate green.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 091 suite; E2E stays 19/19.
