# Spec: passive-mob-baseline

## Contract
This capability wires the existing entity-simulation primitives (129-139) into one real, live
passive mob (pig): a `PassiveMobWorldAdapter` bridging `World` to the interfaces those primitives
require, a `PassiveMobSystem` orchestrating spawn/tick, and a `PassiveMobRenderer` giving each live
pig a visible mesh. No combat/damage/health/death, no breeding/feeding/taming, no despawning, no
save/load persistence — see the proposal's Non-goals.

## Definitions
- **Adapter**: `PassiveMobWorldAdapter`, the sole bridge between `World`/`TerrainGenerator`/
  `BiomeRegistry` and the `ShapeWorld`/`NavigationWorld`/`SpawnWorld` interfaces.
- **Open-sky column**: a vertical run of non-solid cells from a given `y` up to `CONFIG.chunk.height`
  at a fixed `(x, z)`.
- **Spawn-cycle sweep**: one invocation of `PassiveMobSystem.spawnCycle` over a list of chunks.
- **Ticking set**: the entities `EntityChunkTracking.selectTickingEntities` returns for a given
  ticking predicate, in one `PassiveMobSystem.tick` call.

## Invariants
- `getCollisionShape` returns `VoxelShape.FULL_CUBE` exactly when the block at that cell is solid
  per `BlockRegistry.isSolid`, else `VoxelShape.EMPTY`.
- `getSkyLight(x, y, z)` returns `15` exactly when `(x, z)` is an open-sky column from `y` upward,
  else `0`. `getBlockLight` always returns `0`.
- `getBiomeDefinition` returns a defined `BiomeTypeDefinition` for every biome key
  `TerrainGenerator.getBiomeAt` can produce.
- `PassiveMobSystem.spawnCycle` never causes the live pig count to exceed `SPAWN_CAP`.
- `PassiveMobSystem.tick` never advances (moves, retargets) an entity whose current chunk fails the
  supplied `isChunkTicking` predicate.
- Each pig has at most one `GoalSelector`, created no earlier than its first tick after spawn.
- After `PassiveMobRenderer.sync(pigs)`, the scene contains exactly one mesh per element of `pigs`
  (by id), and no others; after `dispose()`, zero.

## Requirements

### Requirement: getCollisionShape reflects block solidity as a full cube or empty
`PassiveMobWorldAdapter.getCollisionShape(x, y, z)` MUST return `VoxelShape.FULL_CUBE` when
`world.isSolid(x, y, z)` is `true`, and `VoxelShape.EMPTY` otherwise.

#### Scenario: a solid block yields a full cube
- **GIVEN** a world where `(0, 0, 0)` holds a solid block
- **WHEN** `getCollisionShape(0, 0, 0)` is called
- **THEN** it returns a shape equal to `VoxelShape.FULL_CUBE` (non-empty, occupying the full unit
  cube)

#### Scenario: air yields an empty shape
- **GIVEN** a world where `(0, 5, 0)` holds air
- **WHEN** `getCollisionShape(0, 5, 0)` is called
- **THEN** it returns `VoxelShape.EMPTY` (`isEmpty` is `true`)

### Requirement: getSkyLight reflects open-sky exposure
`getSkyLight(x, y, z)` MUST return `15` when every cell from `(x, y, z)` up to the world height
ceiling is non-solid, and `0` when any cell in that column is solid.

#### Scenario: an unobstructed column is fully lit
- **GIVEN** a column with no solid blocks from `y` to the world height ceiling
- **WHEN** `getSkyLight` is called at that `(x, y, z)`
- **THEN** it returns `15`

#### Scenario: an overhang blocks sky light
- **GIVEN** a column with a solid block somewhere above `y`
- **WHEN** `getSkyLight` is called at that `(x, y, z)`
- **THEN** it returns `0`

### Requirement: getBiomeDefinition bridges the legacy biome string to a registry definition
`getBiomeDefinition(x, z)` MUST return the `BiomeTypeDefinition` whose key equals
`TerrainGenerator.getBiomeAt(x, z)`, for every key that function can produce.

#### Scenario: each of the four producible biome keys resolves
- **GIVEN** a generator that can return `'plains'`, `'forest'`, `'desert'`, or `'taiga'` for a column
- **WHEN** `getBiomeDefinition` is called for a column of each kind
- **THEN** each call returns a definition whose `key` matches that biome string

### Requirement: spawnCycle never exceeds the configured pig cap
`PassiveMobSystem.spawnCycle` MUST never bring the live pig count above `SPAWN_CAP`, regardless of
how many chunks or attempts are offered.

#### Scenario: repeated sweeps stop growing the population at the cap
- **GIVEN** a world where every spawn attempt would otherwise succeed (open, lit, land chunks) and
  more chunks/attempts than `SPAWN_CAP`
- **WHEN** `spawnCycle` is called (possibly more than once)
- **THEN** the live pig count never exceeds `SPAWN_CAP`

### Requirement: tick only advances entities in the ticking set
`PassiveMobSystem.tick` MUST NOT change the transform or velocity of any entity whose chunk fails
the supplied `isChunkTicking` predicate, and MUST run goal AI + physics for every entity whose
chunk passes it.

#### Scenario: a non-ticking entity is left untouched
- **GIVEN** one spawned pig in a chunk that `isChunkTicking` reports `false` for
- **WHEN** `tick` is called
- **THEN** that pig's transform and velocity are unchanged after the call

#### Scenario: a ticking entity gets a goal selector and moves under AI/physics
- **GIVEN** one spawned pig in a chunk that `isChunkTicking` reports `true` for, in an open area with
  ground below it
- **WHEN** `tick` is called repeatedly with a positive `dt`
- **THEN** the pig is assigned exactly one `GoalSelector` (stable across calls), and gravity is
  observably applied (vertical velocity/position changes when airborne)

### Requirement: PassiveMobRenderer keeps the scene in sync with the live pig set
`PassiveMobRenderer.sync(pigs)` MUST result in exactly one mesh per element of `pigs` (matched by
entity id) existing in the scene afterward, with no extra meshes left over from entities no longer
present. `dispose()` MUST remove every mesh the renderer added.

#### Scenario: sync adds, updates, and removes meshes to match the live set
- **GIVEN** an empty scene, then `sync` called with two pigs, then `sync` called again with only one
  of those two pigs (plus a new third pig)
- **WHEN** each `sync` call completes
- **THEN** after the first call the scene has 2 meshes; after the second, it has 2 meshes matching
  the (survivor, new) pair, with the dropped pig's mesh removed

#### Scenario: dispose empties the scene
- **GIVEN** a renderer that has synced at least one pig into the scene
- **WHEN** `dispose()` is called
- **THEN** the scene contains none of the renderer's meshes afterward

## Error and failure behavior
- `PassiveMobSystem`'s constructor throws if the supplied registry has no `pig` definition.
- `getBiomeDefinition` throws for an unrecognized biome key.
- No other function/method throws for well-formed inputs.

## Performance and resource bounds
- Spawn-cycle sweep cost is O(chunks × attemptsPerChunk); per-frame tick/render cost is O(live pig
  count), bounded by `SPAWN_CAP`.

## Compatibility and migration
- Two new, additive files; one `Game.ts` edit adding construction and two per-frame call sites, no
  existing signature changes. No schema/save-format change; pigs are session-only (not persisted).

## Security and integrity
- All adapter queries are pure functions of existing, already-validated world/registry data; no
  new untrusted input surface.

## Observability
- `PassiveMobSystem.getActivePigs()` exposes the full live set for future debugging/HUD use.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 getCollisionShape solid/air | `tests/unit/PassiveMobBaseline.test.ts` adapter collision cases |
| REQ-2 getSkyLight open-sky/overhang | `tests/unit/PassiveMobBaseline.test.ts` adapter light cases |
| REQ-3 getBiomeDefinition bridging | `tests/unit/PassiveMobBaseline.test.ts` adapter biome cases |
| REQ-4 spawnCycle cap enforcement | `tests/unit/PassiveMobBaseline.test.ts` spawn-cycle cases |
| REQ-5 tick ticking-set gating + goal/physics composition | `tests/unit/PassiveMobBaseline.test.ts` tick cases |
| REQ-6 PassiveMobRenderer sync/dispose | `tests/unit/PassiveMobRenderer.test.ts` |
