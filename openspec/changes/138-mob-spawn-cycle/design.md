# Design: 138-mob-spawn-cycle

## Context/current state
- 137 `canSpawn` answers "is this exact position eligible," but nothing picks positions or bounds
  attempts.
- 129 `EntityManager.getAll()`/`spawn` and 017 `EntityRegistry` (`get(typeId).category`) exist;
  nothing counts live entities by category or spawns through a bounded, deterministic cycle.
- 048 `hash32(...values: number[])` is the codebase's established deterministic pseudo-random
  primitive (already used by `RandomTickSelector`).

## Target state
- `src/simulation/MobSpawnCycle.ts` provides per-category cap counting, deterministic candidate
  selection, and a bounded per-chunk spawn cycle built only on already-VERIFIED primitives.

## Invariants
- `countLiveByCategory` counts exactly the `ACTIVE` entities (129) whose registered type's
  `category` (017) equals the requested category — never a `REMOVED` one.
- `selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt)` is a pure function of its inputs (via
  `hash32`); identical inputs always produce an identical `(x, z)`, and the result always falls
  within chunk `(cx, cz)`'s 16×16 footprint.
- `runSpawnCycleForChunk` never spawns more entities of a category than would keep
  `countLiveByCategory` at or below that category's `cap` — attempts for a category stop immediately
  once the cap is reached, whether from entities live before the cycle started or spawned during it.
- A category already at or above its cap when the cycle starts makes zero attempts (and therefore no
  `hash32`/`canSpawn`/`spawn` calls) for that category.
- Every spawn goes through 137's `canSpawn` first; `runSpawnCycleForChunk` never calls
  `EntityManager.spawn` for a candidate `canSpawn` rejected.

## API and data model
```ts
export interface SpawnCategoryConfig {
  readonly category: EntityCategory;
  readonly typeId: ResourceId;
  readonly cap: number;
  readonly attemptsPerChunk: number;
  readonly height?: number; // default 2, forwarded to canSpawn
}

export function countLiveByCategory(
  manager: EntityManager,
  registry: EntityRegistry,
  category: EntityCategory,
): number;

export function selectSpawnCandidate(
  seed: number,
  cx: number,
  cz: number,
  categoryIndex: number,
  attempt: number,
): { x: number; z: number };

export function runSpawnCycleForChunk(
  manager: EntityManager,
  registry: EntityRegistry,
  world: SpawnWorld,
  biome: BiomeTypeDefinition,
  cx: number,
  cz: number,
  surfaceHeightAt: (x: number, z: number) => number,
  nearestPlayerDistance: (x: number, y: number, z: number) => number,
  dimension: ResourceId,
  seed: number,
  configs: readonly SpawnCategoryConfig[],
): number; // total spawned across all configs
```

## Control/data flow
1. `countLiveByCategory`: filter `manager.getAll()` to entities whose `registry.get(e.typeId).category
   === category`; return the count.
2. `selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt)`:
   `localX = hash32(seed, cx, cz, categoryIndex, attempt, 0) % 16`,
   `localZ = hash32(seed, cx, cz, categoryIndex, attempt, 1) % 16`;
   return `{ x: cx * 16 + localX, z: cz * 16 + localZ }`.
3. `runSpawnCycleForChunk`, for each `config` in `configs` (in array order — `categoryIndex` is that
   config's index in the array, so distinct configs never collide on the same hash stream):
   a. `let live = countLiveByCategory(manager, registry, config.category)`.
   b. If `live >= config.cap`, continue to the next config (zero attempts).
   c. For `attempt` in `[0, config.attemptsPerChunk)`:
      i. `{ x, z } = selectSpawnCandidate(seed, cx, cz, categoryIndex, attempt)`.
      ii. `y = surfaceHeightAt(x, z)`.
      iii. `distance = nearestPlayerDistance(x + 0.5, y, z + 0.5)`.
      iv. If `canSpawn(config.category, world, biome, x, y, z, distance, config.height ?? 2)`:
          spawn via `manager.spawn(config.typeId, dimension, { x: x+0.5, y, z: z+0.5, yaw: 0, pitch: 0 })`,
          increment `live` and a running total; if `live >= config.cap`, stop this config's attempt
          loop early.
   d. Continue to the next config regardless of whether this one reached its cap or exhausted its
      attempts.
4. Return the running total spawned across every config.

## Detailed behavior
- `categoryIndex` is the config's array index, not derived from the `EntityCategory` string itself —
  simpler than hashing a string, and sufficient for distinct hash streams per config since a caller
  supplies `configs` in a stable order.
- Spawned entities are placed at the column's block center (`x + 0.5`, `z + 0.5`) at the caller's
  supplied `y`, with default `yaw`/`pitch` of `0` (a documented simplification — no facing-direction
  variety is modeled here).
- `runSpawnCycleForChunk` does not itself call `hash32`/hash the whole 16×16 column exhaustively; it
  only ever tries up to `attemptsPerChunk` deterministic candidates per category, so a fully-blocked
  chunk costs exactly `attemptsPerChunk` `canSpawn` calls per category, not a full scan.

## Failure modes
- `runSpawnCycleForChunk` never throws for well-formed inputs; a `canSpawn` rejection for every
  attempted candidate is a normal, silent no-op for that category (matching vanilla's own frequent
  spawn-attempt misses).
- `manager.spawn` itself would throw only for an unregistered `typeId` or invalid dimension —
  `runSpawnCycleForChunk` does not catch this, since a caller supplying a bad `SpawnCategoryConfig`
  is a configuration bug that should surface immediately, not be silently swallowed.

## Compatibility/migration
- One new, additive file; no edits to `EntityManager`, `EntityType`, `MobSpawnRules`, or
  `RandomTickSelector`. No schema/save-format change; no migration.

## Performance/resource constraints
- `countLiveByCategory` is O(n) over `ACTIVE` entities (matching `getAll()`'s existing cost model),
  called once per config per cycle plus once more per successful spawn within that config's attempt
  loop (bounded by `attemptsPerChunk`, itself typically small).
- `runSpawnCycleForChunk`'s total cost is `O(configs.length × attemptsPerChunk)` `canSpawn` calls
  (each itself bounded per 137's own cost model), plus the `countLiveByCategory` calls above — no
  unbounded loops.

## Testing seams
- All functions depend only on a hand-built `SpawnWorld` fixture (137's style), a plain
  `EntityRegistry`/`EntityManager` pair (129/017's existing seams), and simple closures for
  `surfaceHeightAt`/`nearestPlayerDistance` — no `Game`/`World` needed.

## Observability/debugging
- `runSpawnCycleForChunk`'s return value (total spawned) directly reports cycle outcome; a caller can
  additionally inspect `manager.getAll()`/`countLiveByCategory` before/after to audit exactly what
  changed.

## Affected files/symbols
- `src/simulation/MobSpawnCycle.ts` (new).
- Tests: `tests/unit/MobSpawnCycle.test.ts` (new).

## Rejected alternatives
- **Per-biome weighted spawn tables**: rejected (see proposal Non-goals) — no such data model exists
  yet; one `typeId` per category config is the documented, simpler scope for this change.
- **Hashing the `EntityCategory` string directly for the candidate stream**: rejected — using the
  config's array index is simpler and equally sufficient for distinct per-config hash streams within
  one cycle call.
- **A global (multi-chunk) cap-coordination pass in this change**: rejected — `runSpawnCycleForChunk`
  operates on one chunk at a time; a caller invoking it across several chunks in one cycle already
  gets correct cap enforcement because `countLiveByCategory` re-reads live `EntityManager` state on
  every call (including across chunks in the same cycle, since it queries the manager itself, not a
  cached count) — no explicit multi-chunk orchestration needed in this module.

## Downstream dependencies
- A future `Game`-wiring change will call `runSpawnCycleForChunk` periodically for each ticking
  chunk, supplying a real `World`-backed `SpawnWorld`, biome sampler, height sampler, and player
  distance function.
