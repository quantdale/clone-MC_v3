# Proposal: 218-mob-content-expansion

## Problem
215-217 expanded blocks/items/biomes/structures as data; mobs remain fixed (129-146). 218 adds
additional passive/hostile/utility mobs through data-driven definitions over the existing
entity/AI primitives — the established no-new-architecture pattern.

## Goals
- `src/data/MobExpansion.ts` (NEW), pure and headless-safe:
  - **Definitions**: `MobDefinition { id, name, category, archetype, health, speed,
    hostileToPlayer, spawns }` where `spawns = { biomes, weight, packSize }` —
    `createMobDefinition` validates: namespaced ids (path without a `mob/` prefix), `name` a
    non-empty translation key (214), `category` one of `passive|hostile|neutral|utility`,
    `archetype` one of `melee|ranged|wanderer` (default wanderer), `health` a positive integer,
    `speed` a finite number > 0, `hostileToPlayer` a boolean (default `category ===
    'hostile'`), `spawns.biomes` non-empty known 216 categories, `spawns.weight` a positive
    integer, `spawns.packSize` a `[min, max]` positive-integer pair with min <= max.
  - **Expansion**: `createMobExpansion(definitions)` — `MobExpansion { mobs }` in registration
    order with duplicate-id rejection; `mobById(expansion, id)`; `mobsByCategory(expansion,
    category)`; `mobsInBiome(expansion, category)` — mobs that spawn in a biome category
    (registration order).

## Non-goals
- **No entity-class/AI code** (129-146's primitives power the archetypes), **no spawn-cycle
  wiring** (137-138 consume the spawn data), **no registry mutation** (017's entity-type
  registry stays untouched with characterization pinned), **no rendering**, **no `Game.ts`
  edit**, **no save-format change**.

## Preconditions
- Change 217 (`structure-content-expansion`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 004's `ResourceId` helpers and 216's `BiomeCategory` (imported; no registry changes).

## Proposed change
1. `src/data/MobExpansion.ts` (NEW): the definition model, validation, and expansion queries.

## Compatibility and migration
- One new data file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Field drift from 129-146's primitives**. Mitigation: every field's constraints (health,
  speed, spawn weight/pack order, hostile default) are pinned in tests with exact messages.

## Rollback strategy
One new data file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: valid definitions (defaults + explicit); every rejection; expansion
  grouping/order; duplicates; lookups (by id, category, biome); empty expansion.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
