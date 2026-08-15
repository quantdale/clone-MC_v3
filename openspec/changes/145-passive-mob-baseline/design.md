# Design: 145-passive-mob-baseline

## Context/current state
- `World` already exposes `getBlock(x,y,z)` and `isSolid(x,y,z)` directly (the latter delegating to
  `BlockRegistry.isSolid`), but none of `ShapeWorld.getCollisionShape` (057), `NavigationWorld`
  (134), or `SpawnWorld`'s light methods (137) — every prior change that declared one of those
  interfaces did so explicitly to avoid touching `World`, per their own design docs. Since `World`
  already exposes `isSolid` directly, the adapter needs no separate `BlockRegistry` dependency.
- `TerrainGenerator.getBiomeAt(x, z): Biome` returns a legacy `'plains'|'forest'|'desert'|'taiga'`
  string, unrelated to 016's `data/Biome.ts` `BiomeRegistry`/`BiomeTypeDefinition` that
  `MobSpawnRules.canSpawn` requires. The four legacy keys happen to match four of
  `createDefaultBiomeRegistry()`'s registered keys exactly (`plains`, `forest`, `desert`, `taiga`),
  so `registry.getByKey(generator.getBiomeAt(x, z))` bridges them losslessly for those four biomes.
  No ocean/river legacy biome exists, so water-category spawning is unreachable through this bridge
  (fine — pig is a land `CREATURE`).
- No real block-light/sky-light query exists anywhere in production. `LightStorage`/
  `SkyLightEngine`/`BlockLightEngine`/`LightUpdateEngine` (rendering-adjacent modules) are defined
  but never constructed/consumed outside their own files — a real light engine is not wired to
  `World`. 137's own design doc already found this gap and declared light as a caller-supplied
  capability; 145 supplies it via a simplified vertical open-sky scan (see below).
- `WorldLife` is the only existing "life" in the game: deterministic, visual-only critters, no
  collision, no `EntityManager` involvement. It is untouched by this change.
- `Game.update(dt)` runs once per animation frame (not fixed-20TPS); `this.simTick` increments once
  per frame inside `tickRandomBlocks()`. Item entities (`ItemEntityManager`) tick every frame with
  raw `dt`, not a fixed sub-step — 145 follows the same per-frame-dt convention for consistency with
  the rest of `Game`'s update loop.

## Target state
- `src/simulation/PassiveMobBaseline.ts`: `PassiveMobWorldAdapter` (bridges `World` +
  `BlockRegistry` + `TerrainGenerator` + `BiomeRegistry` to `ShapeWorld & NavigationWorld &
  SpawnWorld`) and `PassiveMobSystem` (owns the `EntityManager`, per-entity `GoalSelector`s, spawn
  cycle, and per-frame tick).
- `src/rendering/PassiveMobRenderer.ts`: per-entity-id mesh pool synced from live pig transforms.
- `Game` constructs both and drives them from its existing per-frame `update(dt)`.

## Invariants
- `PassiveMobWorldAdapter.getCollisionShape(x, y, z)` returns `VoxelShape.FULL_CUBE` when
  `world.isSolid(x, y, z)`, else `VoxelShape.EMPTY` — always one of exactly those two values, never
  a partial shape.
- `PassiveMobWorldAdapter.getSkyLight(x, y, z)` returns `15` when every cell `(x, yy, z)` for
  `yy` in `[y, CONFIG.chunk.height)` is non-solid, else `0`. `getBlockLight` always returns `0`.
- `PassiveMobWorldAdapter.getBiomeDefinition(x, z)` never returns `undefined` for the four legacy
  biome keys `TerrainGenerator.getBiomeAt` can produce; it throws for any other key (defensive —
  unreachable given `TerrainGenerator`'s current return type).
- `PassiveMobSystem.spawnCycle` never spawns a non-pig entity and never exceeds the configured
  live-pig cap (delegates entirely to 138's own cap-respecting loop).
- `PassiveMobSystem.tick` only advances entities in the caller-supplied ticking set (via 132's
  `selectTickingEntities`); an entity outside it is untouched that frame.
- Every pig gets exactly one `GoalSelector` (created lazily on first tick, reused after), with a
  deterministic per-entity RNG derived from `(worldSeed, entityId)` — same seed and spawn sequence
  always produces the same wander/look behavior.
- `PassiveMobRenderer.sync(pigs)` leaves the scene with exactly one mesh per live pig id afterward,
  no more, no fewer; `dispose()` leaves zero.

## API and data model
```ts
// src/simulation/PassiveMobBaseline.ts

export interface PassiveMobWorldDeps {
  world: World;
  generator: TerrainGenerator;
  biomeRegistry: BiomeRegistry;
}

// The full world-access surface PassiveMobSystem needs; PassiveMobSystem depends on this
// interface (not the concrete adapter), so tests can supply a plain object literal.
export interface PassiveMobWorld extends ShapeWorld, NavigationWorld, SpawnWorld {
  getBiomeDefinition(x: number, z: number): BiomeTypeDefinition;
  getSurfaceHeightAt(x: number, z: number): number;
}

export class PassiveMobWorldAdapter implements PassiveMobWorld {
  constructor(deps: PassiveMobWorldDeps);
  getCollisionShape(x: number, y: number, z: number): VoxelShape;
  getBlockId(x: number, y: number, z: number): number;
  getSkyLight(x: number, y: number, z: number): number;
  getBlockLight(x: number, y: number, z: number): number;
  getBiomeDefinition(x: number, z: number): BiomeTypeDefinition;
  getSurfaceHeightAt(x: number, z: number): number;
}

export const PIG_BOUNDING_BOX: EntityPhysicsBox = { width: 0.9, height: 0.9, depth: 0.9 };
export const SPAWN_CAP = 12;
export const SPAWN_ATTEMPTS_PER_CHUNK = 2;
export const SPAWN_CYCLE_INTERVAL_TICKS = 100;

export interface ChunkCoord { readonly cx: number; readonly cz: number; }

export class PassiveMobSystem {
  constructor(registry: EntityRegistry, seed: number);
  spawnCycle(
    world: PassiveMobWorld,
    dimension: ResourceId,
    chunks: readonly ChunkCoord[],
    nearestPlayerDistance: (x: number, y: number, z: number) => number,
  ): number;
  tick(dt: number, world: PassiveMobWorld, isChunkTicking: (cx: number, cz: number) => boolean): void;
  getActivePigs(): readonly EntityInstance[];
}
```
```ts
// src/rendering/PassiveMobRenderer.ts

export class PassiveMobRenderer {
  constructor(scene: THREE.Scene);
  sync(pigs: readonly EntityInstance[]): void;
  dispose(): void;
}
```

## Control/data flow
1. **Adapter construction** (once, in `Game`'s constructor): `new PassiveMobWorldAdapter({ world,
   blockRegistry, generator, biomeRegistry: createDefaultBiomeRegistry() })`.
2. **Spawn-cycle sweep** (throttled, every `SPAWN_CYCLE_INTERVAL_TICKS` frames): `Game` enumerates
   currently-simulating chunks (reusing the same `world.forEachLoadedChunk` +
   `world.isChunkSimulating` pattern `tickRandomBlocks` already uses), calls
   `passiveMobs.spawnCycle(adapter, OVERWORLD, chunks, nearestPlayerDistance)`.
   `spawnCycle` builds one `SpawnCategoryConfig` (`category: 'CREATURE'`, `typeId: <pig id>`,
   `cap: SPAWN_CAP`, `attemptsPerChunk: SPAWN_ATTEMPTS_PER_CHUNK`) and calls `runSpawnCycleForChunk`
   once per chunk, with `surfaceHeightAt` delegating to `world.getSurfaceHeightAt` and `biome`
   resolved per-chunk via `world.getBiomeDefinition` at the chunk's center column.
3. **Per-frame tick** (every frame, alongside `worldLife.update`): `passiveMobs.tick(dt, adapter,
   world.isChunkSimulating.bind(world))`:
   a. `selectTickingEntities(manager, isChunkTicking)` — the live set for this frame.
   b. For each entity without a registered `GoalSelector`: create one, add `LookGoal` (priority 0)
      and `WanderGoal` (priority 1, using the adapter as its `NavigationWorld`), each seeded via
      `createNamedRng(seed, \`passive-mob-ai-${entity.id}\`).fork('look'|'wander')`.
   c. `selector.tick()` then `tickEntityPhysics(manager, entity.id, adapter, resolver,
      PIG_BOUNDING_BOX, dt)`.
4. **Per-frame render sync** (every frame): `passiveMobRenderer.sync(passiveMobs.getActivePigs())`.

## Detailed behavior
- The spawn-cycle sweep's chunk list matches `tickRandomBlocks`'s own enumeration
  (`world.forEachLoadedChunk` filtered by `world.isChunkSimulating`), so spawn attempts never target
  a chunk outside the simulated ring — consistent with how random ticks are already gated.
- `nearestPlayerDistance` is supplied by the caller (`Game` knows the player position;
  `PassiveMobSystem` does not), matching `runSpawnCycleForChunk`'s own signature exactly.
- `getBiomeDefinition` is evaluated once per chunk per sweep (at the chunk's center column, `cx*16+8,
  cz*16+8`), not per spawn attempt — a chunk is assumed biome-uniform for this baseline (matches
  `TerrainGenerator`'s own per-column biome granularity closely enough for a spawn gate).
- A `GoalSelector` is retained in a `Map<number, GoalSelector>` keyed by entity id for the system's
  lifetime (no despawning, so no cleanup is needed yet — a future despawn change would also clear
  the map entry).
- `PassiveMobRenderer` reuses `WorldLife`'s low-poly box-body/box-head/box-leg aesthetic (new,
  independent geometry/material instances — no shared state with `WorldLife`) so a rendered pig
  looks visually consistent with the existing critters; `sync` positions each mesh directly from
  `entity.transform` (`x`/`y`/`z` plus `yaw` converted to a Y-axis rotation) with no interpolation.

## Failure modes
- `PassiveMobSystem` constructor throws if the supplied `EntityRegistry` has no `pig` definition
  (defensive; `createDefaultEntityRegistry()` always has one).
- `getBiomeDefinition` throws for an unrecognized biome key (defensive/unreachable given
  `TerrainGenerator`'s current return type).
- No other function/method throws for well-formed inputs.

## Compatibility/migration
- Two new, additive files. `Game.ts` gains one adapter/system/renderer construction plus two
  per-frame call sites (spawn-cycle sweep is throttled by a tick-count guard; tick/sync run every
  frame) — no existing method signature changes. No schema/save-format change; pigs are not
  persisted (see proposal Non-goals).

## Performance/resource constraints
- Spawn-cycle sweep: O(ticking chunks × `SPAWN_ATTEMPTS_PER_CHUNK`) pure-math checks, run once per
  `SPAWN_CYCLE_INTERVAL_TICKS` frames (~5s at typical frame rate), bounded further by `SPAWN_CAP`
  once reached (each category's `runSpawnCycleForChunk` returns immediately once at cap).
- Per-frame tick/render: O(live pig count), bounded by `SPAWN_CAP`.

## Testing seams
- `PassiveMobWorldAdapter` is tested against small fakes/stubs for `World`/`BlockRegistry`/
  `TerrainGenerator`/`BiomeRegistry` (matching how 134/137's own tests avoid a real `World`) —
  no real chunk generation needed.
- `PassiveMobSystem` is tested by constructing a `PassiveMobWorldAdapter`-shaped fake directly (an
  object literal satisfying `ShapeWorld & NavigationWorld & SpawnWorld`) rather than the concrete
  adapter, keeping its tests independent of `World`.
- `PassiveMobRenderer` is tested with a real `THREE.Scene` and no GL context, exactly matching
  `WorldLife.test.ts`'s existing pattern.

## Observability/debugging
- `PassiveMobSystem.getActivePigs()` exposes the full live set for a future debug-overlay hook
  (not added in this change — no HUD/debug-overlay edit here).

## Affected files/symbols
- `src/simulation/PassiveMobBaseline.ts` (new).
- `src/rendering/PassiveMobRenderer.ts` (new).
- `src/engine/Game.ts` (edit: construction + two per-frame call sites).
- Tests: `tests/unit/PassiveMobBaseline.test.ts` (new), `tests/unit/PassiveMobRenderer.test.ts` (new).

## Rejected alternatives
- **Replacing `WorldLife` outright with `PassiveMobSystem`-driven pigs**: rejected — `WorldLife` has
  its own passing e2e coverage ("spawns deterministic passive world life") and is a distinct,
  simpler visual layer; removing it is unnecessary scope/risk for a baseline change. A future change
  can retire it once mob coverage is broad enough.
- **Wiring the real light-engine stack (`LightStorage`/`SkyLightEngine`/etc.) now**: rejected — a
  substantial, separate integration (persisting light data per chunk, propagation on block
  edit/chunk load) out of proportion to "first passive mob baseline"; the simplified open-sky scan
  is sufficient for a `CREATURE`'s light gate and is fully documented as a seam.
- **Giving `PassiveMobSystem` its own internal fixed-20TPS sub-stepping**: rejected — no other
  per-frame system in `Game` does this yet (`ItemEntityManager` ticks with raw `dt`); consistency
  with the existing update loop outweighs matching vanilla's exact tick cadence for a baseline.

## Downstream dependencies
- 146 (`hostile-mob-baseline`) will likely reuse `PassiveMobWorldAdapter` (renamed/generalized) and
  add `HostileTargetAI`/`MeleeCombat` goals plus `EntityDataTracker` health.
- 147 (`animal-breeding`) will read/write `PassiveMobSystem`'s pig set for love-state/child-spawn.
- 148 (`mob-drop-loot`) will need `EntityDataTracker` health wired in before death/loot makes sense —
  not yet present here.
