# Design: 137-mob-spawn-rules

## Context/current state
- 016 `BiomeRegistry`/`BiomeTypeDefinition` (`category: BiomeCategory`, including `OCEAN`/`RIVER`)
  and 017 `EntityRegistry`/`EntityCategory` (`MONSTER`/`CREATURE`/`AMBIENT`/`WATER_CREATURE`/
  `WATER_AMBIENT`/`PROJECTILE`/`OTHER`) exist as data models with no spawn-eligibility logic.
- 134 `canStandAt(world, x, y, z, height)` already answers "can a ground-walking entity occupy this
  column," reusable here for land-category block/clearance checks.
- No light-level query exists on `World` yet (`SectionLightStorage.getSkyLight`/`getBlockLight`
  exist in `src/rendering/LightStorage.ts` but are rendering-internal, not exposed via `World`) — 137
  declares its own minimal `SpawnWorld` interface rather than depending on a concrete `World` method.

## Target state
- `src/simulation/MobSpawnRules.ts` provides four independent, composable spawn predicates plus a
  `canSpawn` conjunction, over a minimal `SpawnWorld` access interface.

## Invariants
- Every predicate returns `false` for any `EntityCategory` outside its documented known set (in
  particular `OTHER`, `PROJECTILE`, and any category not `MONSTER`/`CREATURE`/`AMBIENT`/
  `WATER_CREATURE`/`WATER_AMBIENT`) — never throws, never defaults to permissive.
- `lightLevelAt` is always `max(clamp(skyLight, 0, 15), clamp(blockLight, 0, 15))`, so a
  `SpawnWorld` implementation returning an out-of-range value can never push the result outside
  `[0, 15]`.
- `canSpawn` is exactly the logical AND of the four sub-predicates; if any one is `false`, `canSpawn`
  is `false` — no predicate is skipped based on another's result (all four run; short-circuiting is
  an implementation performance detail, not an observable contract difference for pure functions with
  no side effects).

## API and data model
```ts
export interface SpawnWorld extends NavigationWorld {   // getCollisionShape, getBlockId
  getSkyLight(x: number, y: number, z: number): number;
  getBlockLight(x: number, y: number, z: number): number;
}

export const MONSTER_MAX_LIGHT = 7;
export const CREATURE_MIN_LIGHT = 9;
export const MIN_SPAWN_DISTANCE = 24;
export const MAX_SPAWN_DISTANCE = 128;

export function lightLevelAt(world: SpawnWorld, x: number, y: number, z: number): number;
export function isValidSpawnDistance(distanceBlocks: number): boolean;
export function isValidSpawnBiome(category: EntityCategory, biome: BiomeTypeDefinition): boolean;
export function isValidSpawnLight(category: EntityCategory, world: SpawnWorld, x: number, y: number, z: number): boolean;
export function isValidSpawnBlock(category: EntityCategory, world: SpawnWorld, x: number, y: number, z: number, height?: number): boolean;
export function canSpawn(
  category: EntityCategory,
  world: SpawnWorld,
  biome: BiomeTypeDefinition,
  x: number, y: number, z: number,
  distanceBlocks: number,
  height?: number,
): boolean;
```

## Control/data flow
- `lightLevelAt`: `Math.max(clampToByte(world.getSkyLight(x,y,z)), clampToByte(world.getBlockLight(x,y,z)))`
  where `clampToByte(v) = Math.max(0, Math.min(15, v))`.
- `isValidSpawnDistance(d)`: `d >= MIN_SPAWN_DISTANCE && d <= MAX_SPAWN_DISTANCE`.
- `isValidSpawnBiome(category, biome)`: `isWater = biome.category === 'OCEAN' || biome.category ===
  'RIVER'`; water categories require `isWater`; `MONSTER`/`CREATURE`/`AMBIENT` require `!isWater`;
  anything else `false`.
- `isValidSpawnLight(category, world, x, y, z)`: water categories → `true` (light-independent, a
  documented simplification); `MONSTER`/`AMBIENT` → `lightLevelAt(...) <= MONSTER_MAX_LIGHT`;
  `CREATURE` → `lightLevelAt(...) >= CREATURE_MIN_LIGHT`; anything else → `false`.
- `isValidSpawnBlock(category, world, x, y, z, height = 2)`: water categories →
  `world.getBlockId(x, y, z) === BlockId.Water`; `MONSTER`/`CREATURE`/`AMBIENT` →
  `canStandAt(world, x, y, z, height)` (134, reused via `SpawnWorld`'s structural `NavigationWorld`
  compatibility); anything else → `false`.
- `canSpawn(...)`: `isValidSpawnDistance(distanceBlocks) && isValidSpawnBiome(category, biome) &&
  isValidSpawnLight(category, world, x, y, z) && isValidSpawnBlock(category, world, x, y, z, height)`.

## Detailed behavior
- `SpawnWorld extends NavigationWorld` (structural — `SpawnWorld`'s `getBlockId`/
  `getCollisionShape` members satisfy `NavigationWorld` directly), so `isValidSpawnBlock` passes a
  `SpawnWorld` value straight into `canStandAt` with no adapter.
- Water-category light-independence is a deliberate simplification: real Minecraft's water-mob
  spawning has its own light rules in some versions, but modeling that nuance is out of this
  program's current scope (documented in Non-goals).
- `height` defaults to `2` (matching 134's own default convention) when omitted from
  `isValidSpawnBlock`/`canSpawn`.

## Failure modes
- None of these functions throw for a well-formed `SpawnWorld`/`BiomeTypeDefinition` and finite
  numeric inputs; an unrecognized `EntityCategory` string (TypeScript's `EntityCategory` union is
  closed, but a caller could still pass an arbitrary string at a JS boundary) falls through every
  predicate's category switch to the documented `false` default rather than throwing.

## Compatibility/migration
- One new, additive file; no edits to `BiomeRegistry`/`EntityRegistry`/`NavigationGridQuery`/
  `BlockRegistry`/`World`. No schema/save-format change; no migration.

## Performance/resource constraints
- Every predicate is O(1) except `isValidSpawnBlock`'s land-category path, which delegates to
  `canStandAt`'s O(height) cost (134's existing model).

## Testing seams
- All functions depend only on a hand-built `SpawnWorld` fixture (reusing 134's `FakeNavWorld`-style
  approach, extended with sky/block light maps) and plain `BiomeTypeDefinition` object literals — no
  `Game`/`World`/registry construction beyond what a test needs directly.

## Observability/debugging
- Each predicate is independently callable, so a caller (or test) can determine exactly which
  dimension (distance/biome/light/block) rejected a candidate position without needing to inspect
  `canSpawn`'s internals.

## Affected files/symbols
- `src/simulation/MobSpawnRules.ts` (new).
- Tests: `tests/unit/MobSpawnRules.test.ts` (new).

## Rejected alternatives
- **Modeling full vanilla per-biome/per-mob spawn tables**: rejected (see proposal Non-goals) — a
  generic, category-level rule set is what 137's title asks for ("light/biome/block/distance/
  category spawn predicates"), not a full data-driven spawn-table system.
- **Exposing `World.getSkyLight`/`getBlockLight` in this change**: rejected — that would be scope
  creep into `World`'s own API surface; 137 declares the minimal interface it needs and lets a
  future wiring change adapt a concrete `World`/light-engine pair to it.
- **Short-circuiting `canSpawn`'s AND for performance**: considered equivalent and left as an
  implementation detail (JS `&&` already short-circuits) rather than a documented contract point,
  since none of the four predicates have side effects to worry about ordering.

## Downstream dependencies
- 138 (`mob-spawn-cycle`) will call `canSpawn` repeatedly per category/chunk each spawn cycle,
  respecting per-category caps.
