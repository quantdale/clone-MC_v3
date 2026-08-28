# Proposal: 137-mob-spawn-rules

## Problem
Nothing in the catalog decides *whether* a mob of a given 017 `EntityCategory` may naturally spawn
at a given world position. Real Minecraft gates this on light level, biome, the block/clearance at
the target cell, and distance from a player. The pieces exist independently (016 `BiomeRegistry`,
017 `EntityCategory`, 134's `canStandAt`, and the block/light query surfaces), but nothing combines
them into a spawn-eligibility predicate.

## Goals
- `SpawnWorld` interface: `getBlockId`, `getCollisionShape` (for 134's `canStandAt` reuse),
  `getSkyLight`, `getBlockLight` — the minimal access this module needs.
- `lightLevelAt(world, x, y, z)`: `max(skyLight, blockLight)`, clamped to `[0, 15]`.
- Four independent predicates, each pure and independently testable:
  - `isValidSpawnDistance(distanceBlocks)`: within `[MIN_SPAWN_DISTANCE, MAX_SPAWN_DISTANCE]`.
  - `isValidSpawnBiome(category, biome)`: water categories (`WATER_CREATURE`/`WATER_AMBIENT`)
    require an `OCEAN`/`RIVER` biome; land categories (`MONSTER`/`CREATURE`/`AMBIENT`) require a
    non-water biome; any other category is never valid.
  - `isValidSpawnLight(category, world, x, y, z)`: `MONSTER`/`AMBIENT` require
    `lightLevelAt <= MONSTER_MAX_LIGHT`; `CREATURE` requires `lightLevelAt >= CREATURE_MIN_LIGHT`;
    water categories are light-independent; any other category is never valid.
  - `isValidSpawnBlock(category, world, x, y, z, height)`: water categories require the target cell
    to be a water block; land categories require `canStandAt` (134); any other category is never
    valid.
- `canSpawn(category, world, biome, x, y, z, distanceBlocks, height?)`: the conjunction of all four.

## Non-goals
- **No full vanilla parity.** Real Minecraft's spawn rules have many more nuances (per-biome mob
  lists, moon-phase-affected slime spawning, structure-specific spawners, sea-level checks, etc.);
  137 models the four dimensions named in the change title (light/biome/block/distance) as one
  simplified, documented rule set per `EntityCategory`.
- **No spawn cycle, per-category caps, or attempt scheduling.** Deciding *when* and *how many times*
  to call `canSpawn` per tick/chunk is 138's scope (`mob-spawn-cycle`).
- **No actual mob instantiation.** `canSpawn` only answers "is this position eligible"; spawning an
  `EntityInstance` via 129's `EntityManager` is a later, explicit wiring step.
- **No `Game`/`World` wiring.** `SpawnWorld` is a minimal, adapter-free interface; no concrete `World`
  implements it yet.

## Preconditions
- Change 136 (`mob-goal-selector`) is VERIFIED.
- Change 016 (`biome-registry`) and change 134 (`navigation-grid-query`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/NavigationGridQuery.ts` (134) — `canStandAt` (reused directly; `SpawnWorld` is
  structurally a `NavigationWorld`).
- `src/data/Biome.ts` (016) — `BiomeTypeDefinition`, `BiomeCategory`.
- `src/data/EntityType.ts` (017) — `EntityCategory`.
- `src/world/BlockRegistry.ts` — `BlockId.Water`.

## Proposed change
1. `src/simulation/MobSpawnRules.ts` (NEW):
   - `interface SpawnWorld extends NavigationWorld { getSkyLight(x, y, z): number; getBlockLight(x, y, z): number }`.
   - Constants: `MONSTER_MAX_LIGHT = 7`, `CREATURE_MIN_LIGHT = 9`, `MIN_SPAWN_DISTANCE = 24`,
     `MAX_SPAWN_DISTANCE = 128`.
   - `lightLevelAt`, `isValidSpawnDistance`, `isValidSpawnBiome`, `isValidSpawnLight`,
     `isValidSpawnBlock`, `canSpawn`.
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Oversimplified per-category rules diverging from vanilla expectations.** Mitigation: documented
  explicitly as a deliberate simplification (proposal Non-goals); the four predicates are
  independently composable, so a later change can refine one without touching the others' contracts.
- **`OTHER` category (used by non-mob entities like `item`, per 017) accidentally becoming
  spawnable.** Mitigation: every predicate explicitly returns `false` for any category outside its
  known set, verified directly by a dedicated test.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `lightLevelAt`/`isValidSpawnDistance`/`isValidSpawnBiome`/`isValidSpawnLight`/`isValidSpawnBlock`/
  `canSpawn` implemented per design.md/spec.md.
- Unit tests cover: each predicate's category partitioning (including `OTHER`/unknown always
  `false`), light-level boundary conditions, biome water/land partitioning, block/clearance reuse of
  134's `canStandAt`, distance boundary conditions, and `canSpawn`'s conjunction (one failing
  predicate fails the whole check).
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
