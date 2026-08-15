# Proposal: 138-mob-spawn-cycle

## Problem
137 gave a per-position spawn-eligibility predicate, but nothing decides *which* positions to try,
*how many* attempts to make, or *when to stop* because a category is already at capacity. Real
Minecraft runs a bounded, capped, per-chunk spawn cycle; nothing here does that yet.

## Goals
- `SpawnCategoryConfig`: `{ category, typeId, cap, attemptsPerChunk, height? }` — one entity type
  spawned per category for this scope (no per-biome spawn tables; that is future, separately scoped
  work if ever undertaken).
- `countLiveByCategory(manager, registry, category)`: count of `ACTIVE` (129) entities whose
  registered 017 type has the given `category`.
- `selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt)`: a deterministic (hash32-derived, 048
  style) in-chunk `(x, z)` candidate column, reproducible for identical inputs.
- `runSpawnCycleForChunk(manager, registry, world, biome, cx, cz, surfaceHeightAt,
  nearestPlayerDistance, dimension, seed, configs)`: for each category config, skip entirely if
  already at cap; otherwise attempt up to `attemptsPerChunk` deterministic candidates, spawning via
  129's `EntityManager.spawn` through 137's `canSpawn` at the first eligible candidate per attempt,
  stopping that category's attempts early once its cap is reached. Returns the total spawned.

## Non-goals
- **No per-biome spawn tables or weighted mob lists.** One `typeId` per category config; a future,
  separately scoped change may add per-biome weighted selection.
- **No `Game`/tick-loop wiring.** Nothing yet calls `runSpawnCycleForChunk` from a live game loop, and
  no cycle-frequency/timer logic is added — a caller decides when to invoke this (e.g. once per N
  ticks), out of scope here.
- **No despawning.** Removing distant/excess entities is a separate concern (potentially layered on
  132's `forgetChunk`/`deactivateChunk`), not addressed by this change.
- **No cross-chunk global cap coordination beyond a simple world-wide `countLiveByCategory`.** Real
  Minecraft's mobcap is area-density-based (per-player 17×17 chunk area); 138 uses a single
  world-wide count per category as a documented simplification.

## Preconditions
- Change 137 (`mob-spawn-rules`) is VERIFIED.
- Change 129 (`entity-core`) and change 048 (`random-tick-system`, source of `hash32`) are VERIFIED
  and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/EntityManager.ts` (129) — `getAll`, `spawn`.
- `src/data/EntityType.ts` (017) — `EntityRegistry`, `EntityCategory`.
- `src/simulation/MobSpawnRules.ts` (137) — `canSpawn`, `SpawnWorld`.
- `src/simulation/RandomTickSelector.ts` (048) — `hash32`.

## Proposed change
1. `src/simulation/MobSpawnCycle.ts` (NEW):
   - `interface SpawnCategoryConfig { category, typeId, cap, attemptsPerChunk, height? }`.
   - `countLiveByCategory`, `selectSpawnCandidate`, `runSpawnCycleForChunk` as described in Goals.
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Determinism regressing.** Mitigation: `selectSpawnCandidate` is a pure `hash32`-derived function
  (048's existing, already-verified determinism model); no `Math.random`/wall-clock/global state
  anywhere in this module, verified directly by a repeated-call test.
- **A category's attempts silently exceeding its cap.** Mitigation: the live count is rechecked after
  every successful spawn within the attempt loop, and attempts stop immediately once the cap is
  reached — verified directly by a test whose cap is smaller than `attemptsPerChunk`.
- **World-wide cap simplification feeling too coarse for a real game.** Mitigation: documented
  explicitly (proposal Non-goals); the API takes a plain `cap` number, so a future change could
  supply a differently-scoped count without changing `runSpawnCycleForChunk`'s contract.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `countLiveByCategory`/`selectSpawnCandidate`/`runSpawnCycleForChunk` implemented per design.md/
  spec.md.
- Unit tests cover: counting live entities by category; candidate-selection determinism and
  in-chunk-bounds; a category already at cap making zero attempts; a category reaching cap mid-cycle
  stopping early; a successful spawn actually appearing in the `EntityManager`; an eligible-candidate
  miss (no valid position found) spawning nothing without error.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no `Game` wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
