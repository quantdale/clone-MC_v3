# Proposal: 216-biome-content-expansion

## Problem
215 made blocks/items data-driven; biomes are still fixed (016). 216 expands the biome catalog
and its feature combinations through data-driven definitions over the biome/worldgen registries
— the same no-new-architecture pattern.

## Goals
- `src/data/BiomeExpansion.ts` (NEW), pure and headless-safe:
  - **Definitions**: `BiomeDefinition { id, name, temperature, precipitation, category,
    features }` — `createBiomeDefinition` validates: namespaced ids (path without a `biome/`
    prefix), `name` a non-empty translation key (214), `temperature` a finite number in
    [-2, 2] (default 0.5), `precipitation` one of `none|rain|snow` (default rain),
    `category` one of `plains|forest|desert|snowy|ocean|nether|end|mountain` (default plains),
    `features` non-empty strings (default []).
  - **Expansion**: `createBiomeExpansion(definitions)` — the validated `BiomeExpansion {
    biomes }` in registration order with duplicate-id rejection; `biomeById(expansion, id)`;
    `featuresFor(biome)`.

## Non-goals
- **No registry mutation** (the wiring maps definitions onto 016's biome registry and the
  worldgen registries — 094-101 — with their characterization pinned), **no terrain/shape
  generation changes** (the surface-rule/worldgen arcs own them), **no rendering**, **no
  `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 215 (`block-item-content-expansion`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers (imported; no registry changes).

## Proposed change
1. `src/data/BiomeExpansion.ts` (NEW): the definition model, validation, and expansion queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Field drift from 016's biome model**. Mitigation: the documented field constraints
  (temperature range, precipitation/category choices, feature ids) are pinned in tests.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid definitions (defaults + explicit); every rejection; expansion
  grouping/order; duplicates; lookups (by id, features); empty expansion.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
