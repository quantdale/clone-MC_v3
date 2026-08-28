# Proposal: 101-small-structure-baseline

## Problem

099/100 provide templates and placement, but no structure exists in the world. This change
delivers the first generated structure end-to-end: a default template + placement config +
deterministic writing into chunks.

## Goals

- `StructureGenerator`: holds template + placement registries + seed; per chunk, returns the
  structure blocks (world coordinates within the chunk footprint) for every start whose
  footprint intersects the chunk (deterministic window query, placements in registration
  order, later placements overwrite earlier on overlap).
- Default structure: `overworld/ruined_well` (5x5x3 dry cobblestone ring with a hollow core —
  no water, so the existing "never places water above sea level" invariant holds) + its
  placement config (spacing/separation/salt/biome/terrain gates).
- Wire structures into `TerrainGenerator.generateChunk` (structures overwrite terrain
  deterministically, no air gate).

## Non-goals

- Entity spawning from templates (later structure/entity changes).
- Connector-based chaining (later structure changes).
- Additional structures (later changes).

## Preconditions

- Change 100 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 100 baseline (1119 unit / 19 e2e).

## Dependencies

- 099 `StructureTemplate`/`applyStructureTransform`, 100 `structureStartAtChunk`,
  003 registry patterns, `TerrainGenerator` biome/height sources.

## Proposed change

- `src/worldgen/StructureGenerator.ts` (NEW): `StructureGenerator` (constructor fails fast on
  placement configs referencing missing templates; `maxExtent`; `startAt`; `blocksForChunk`),
  `createDefaultStructureTemplates`, `createDefaultStructurePlacements`,
  `createDefaultStructureGenerator`.
- `src/world/TerrainGenerator.ts` (MODIFIED): optional structure generator (defaults to
  `createDefaultStructureGenerator(seed)`); `generateChunk` writes structure blocks after
  trees (overwrite semantics).
- `tests/unit/StructureGenerator.test.ts` (NEW).

## Compatibility and migration

Additive; TerrainGenerator's constructor signature keeps backward compatibility via a default
parameter. Worlds gain structures deterministically (existing terrain/tree tests unchanged).

## Risks

- Structure blocks overwrite terrain; the default well is small and gated to above-sea-level
  plains/forest/taiga starts, so the spawn area and E2E expectations stay stable.

## Rollback strategy

Revert the commit; the TerrainGenerator wiring reverts to tree-only generation.

## Definition of Done

- Defaults register without error and are deterministic; the well template and placement
  config match the documented values.
- `blocksForChunk` returns deterministic, correctly rotated, world-coordinate blocks for the
  chunk footprint, including starts from neighboring chunks; missing template references fail
  fast at construction.
- TerrainGenerator generates the well end-to-end at a computed start (integration test).
- Full gate green; 101 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 101 suite; E2E stays 19/19.
