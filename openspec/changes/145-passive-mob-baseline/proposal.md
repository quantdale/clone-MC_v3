# Proposal: 145-passive-mob-baseline

## Problem
Since 128, this program has built a full stack of standalone, unconsumed mob-simulation
primitives — `EntityManager`/`EntityPhysics`/`EntityChunkTracking`/`EntityDataTracker` (129-133),
`NavigationGridQuery`/`AStarPathfinding`/`GoalSelector` (134-136), `MobSpawnRules`/`MobSpawnCycle`
(137-138), and `PassiveWanderAI` (139) — but none of it is wired into `Game`. The only passive
"life" a player can see today is `WorldLife`: deterministic, visual-only critters with no collision,
no persistent identity, and no AI framework. There is no real, spawned, world-colliding, AI-driven
mob anywhere in the live game.

## Goals
- Wire the existing primitives together into one real passive mob, live in `Game`: pig
  (`data/EntityType.ts`'s existing `CREATURE` definition), spawned via `MobSpawnRules`/
  `MobSpawnCycle` against real world blocks/biome/player-distance, ticked every frame via
  `EntityManager` + `EntityPhysics` (real shape-aware collision against the real voxel world) +
  a per-mob `GoalSelector` running `PassiveWanderAI`'s `WanderGoal`/`LookGoal`, restricted each
  tick to the chunk-ticking set via `EntityChunkTracking.selectTickingEntities`.
- A small `PassiveMobWorldAdapter` bridging `World`/`BlockRegistry`/`TerrainGenerator` to the
  `ShapeWorld` (130)/`NavigationWorld` (134)/`SpawnWorld` (137) interfaces those primitives already
  require, since `World` itself exposes none of them today.
- A minimal `PassiveMobRenderer` giving each live pig entity a visible mesh in the render scene,
  synced from `EntityManager` transforms every frame (mirrors `WorldLife`'s box-mesh style and its
  scene-graph-only, GL-free unit-test pattern).
- `Game` wiring: construct the system once, tick it every frame alongside `worldLife.update`, sync
  the renderer every frame.

## Non-goals
- **No combat/damage/health/death.** No `EntityDataTracker` health integration, no player-mob
  collision or attack resolution — a pig cannot be hit or killed yet (146/148's scope).
- **No breeding/feeding/taming/ageing** (147's scope).
- **No despawning.** Once spawned a pig persists for the process lifetime, mirroring 138's own
  documented non-goal.
- **No persistence across save/reload.** `EntityManager.serializeChunk`/`deserializeChunk` (131) and
  the `EntityRepository`/`EntityRecord` storage layer exist but are not invoked here; live pigs are
  session-only. A future entity-persistence wiring change addresses save/load.
- **No exact per-block-shape collision.** `PassiveMobWorldAdapter.getCollisionShape` treats every
  block `BlockRegistry.isSolid` reports as a full unit cube; partial shapes (slabs/stairs/fences)
  collide as full blocks. Documented simplification, consistent with 130/134's own scope boundaries.
- **No real light-engine integration.** The dormant `LightStorage`/`SkyLightEngine`/
  `BlockLightEngine`/`LightUpdateEngine` stack (built in earlier changes) remains unconsumed;
  `PassiveMobWorldAdapter`'s sky-light query is a simplified vertical open-air scan (15 if the
  column above is unobstructed up to world height, else 0), and block-light is always 0 (no
  block-light sources modeled). Sufficient for a `CREATURE`'s `>= 9` light requirement outdoors;
  wiring the real engines is future work.
- **No water/ocean-biome spawn category.** `TerrainGenerator.getBiomeAt` only ever returns
  `'plains'|'forest'|'desert'|'taiga'` (all land); the bridge to `data/Biome.ts`'s
  `BiomeTypeDefinition` only covers those four keys. Water-category spawn validation is unreachable
  through this bridge — fine, since pig is a land `CREATURE`.
- **No herd/panic/vanilla-exact AI.** Only 139's wander+look baseline; no flee-from-player, no
  group cohesion, no animation state machine beyond the renderer's static mesh.
- **No mob-vs-mob or mob-vs-block-write interaction.**

## Preconditions
- Change 144 (`shield-blocking`) is VERIFIED.
- Changes 129–139 (entity core through passive-wander-ai) are VERIFIED and unchanged.
- Change 017 (`EntityRegistry`, `data/EntityType.ts`) and change 016 (`BiomeRegistry`,
  `data/Biome.ts`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/EntityManager.ts` (129), `EntityPhysics.ts` (130),
  `EntityChunkTracking.ts` (132), `GoalSelector.ts` (136), `MobSpawnRules.ts` (137),
  `MobSpawnCycle.ts` (138), `PassiveWanderAI.ts` (139), `SeedRng.ts` (054),
  `RandomTickSelector.ts` (048, `hash32`).
- `src/data/EntityType.ts` (017, `createDefaultEntityRegistry`), `src/data/Biome.ts` (016,
  `createDefaultBiomeRegistry`).
- `src/world/World.ts`, `BlockRegistry.ts`, `TerrainGenerator.ts`, `CollisionResolver.ts`,
  `VoxelShape.ts` — read-only; no edits.
- `src/world/WorldLife.ts` — read-only precedent for the renderer's scene-graph unit-test pattern;
  not edited, not replaced.

## Proposed change
1. `src/simulation/PassiveMobBaseline.ts` (NEW):
   - `PassiveMobWorldAdapter` — wraps `World` (using its existing `isSolid`/`getBlock` directly, no
     separate `BlockRegistry` dependency) + `TerrainGenerator` + `BiomeRegistry`; implements
     `ShapeWorld & NavigationWorld & SpawnWorld`.
   - `PIG_BOUNDING_BOX` (`{width: 0.9, height: 0.9, depth: 0.9}`).
   - `PassiveMobSystem` — owns one `EntityManager` (constructed with
     `createDefaultEntityRegistry()`), a `CollisionResolver`, and a per-entity `GoalSelector` map;
     `spawnCycle(dimension, chunks)` runs `runSpawnCycleForChunk` for pig only over the given ticking
     chunk list; `tick(dt, world, isChunkTicking)` ticks each active entity's goal selector then its
     physics step; `getActivePigs()` returns live pig `EntityInstance`s.
2. `src/rendering/PassiveMobRenderer.ts` (NEW):
   - `PassiveMobRenderer` — per-entity-id `THREE.Group` pool in a `THREE.Scene`; `sync(pigs)` adds/
     updates/removes meshes to match the live set; `dispose()`.
3. `src/engine/Game.ts` (EDIT):
   - Construct `PassiveMobSystem` and `PassiveMobRenderer`; track the renderer for disposal.
   - In `update(dt)`, alongside the existing `worldLife.update(dt, ...)` call: run the spawn-cycle
     sweep on a throttled interval (every 100 `simTick`s, i.e. ~5s at 20 calls/s), tick the mob
     system every frame, and sync the renderer every frame.

## Compatibility and migration
- Two new, additive files. One `Game.ts` edit adding construction + two per-frame calls; no existing
  method signature changes. No schema/save-format change (mobs are not persisted); no migration.

## Risks
- **Iterating all ticking chunks every spawn-cycle sweep could be costly at high `simulationDistance`.**
  Mitigation: sweep runs only every 100 ticks (not every frame), and per-chunk work is a handful of
  cheap pure-math `canSpawn` checks (137/138 are already O(1) per attempt).
- **The simplified light/shape/biome adapters could later need replacing when their real subsystems
  are wired.** Mitigation: fully documented as non-goals/simplifications above; `PassiveMobWorldAdapter`
  is the single, isolated seam a future change would edit.
- **Unbounded pig growth without despawning.** Mitigation: `MobSpawnCycle`'s per-category `cap`
  (set low, e.g. 12) bounds the live count regardless of sweep frequency.

## Rollback strategy
Two additive files plus a small, easily-revertible `Game.ts` edit (remove the construction and the
two per-frame calls); reverting fully removes the feature with no other impact.

## Definition of Done
- All listed classes/functions implemented per design.md/spec.md.
- Unit tests cover: `PassiveMobWorldAdapter`'s collision-shape/light/biome bridging; `PassiveMobSystem`
  spawn-cycle-into-tick-into-goal/physics composition (using fakes/stubs for `World`, matching how
  129-139's own tests avoid a real `World`); `PassiveMobRenderer`'s add/update/remove/dispose
  scene-graph bookkeeping (matching `WorldLife.test.ts`'s real-`THREE.Scene`, no-GL pattern).
- Full gate green: typecheck, lint, unit, build, e2e. A new or extended e2e assertion confirms a
  pig becomes visible/present after world-ready (mirrors the existing "spawns deterministic passive
  world life" e2e case).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
