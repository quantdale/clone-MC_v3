# Spec: hostile-mob-baseline

## Contract
This capability wires the existing hostile-mob primitives (140 `HostileTargetAI`, 141 `MeleeCombat`)
together with the reused entity-simulation primitives (129-139) into one real, live hostile mob
(zombie): a `HostileMobSystem` orchestrating spawn/tick/melee-attack, and a `HostileMobRenderer`
giving each live zombie a visible mesh. No player-initiated attack on a mob, no zombie
health/death, no knockback applied to the player, no line-of-sight pathing, no
breeding/loot/despawn/persistence — see the proposal's Non-goals.

## Definitions
- **Zombie**: the entity spawned/ticked by this capability, identified by the `zombie` key in the
  017 `EntityRegistry` (`createDefaultEntityRegistry()`).
- **Goal bundle**: one zombie's `GoalSelector` plus its `TargetAcquisitionGoal`/`ChaseGoal`/
  `WanderGoal`/`LookGoal` instances, created lazily on its first tick after spawn.
- **Player target**: the `PlayerTarget` a caller-supplied `getPlayerTarget()` callback returns —
  the player's current position (+ optional velocity).
- **Ticking set**: the entities `EntityChunkTracking.selectTickingEntities` returns for a given
  ticking predicate, in one `HostileMobSystem.tick` call.
- **Player sentinel id**: `PLAYER_SENTINEL_ID`, a fixed negative number keyed into the shared
  `InvulnerabilityTracker` to represent "the player" without the player having a real
  `EntityManager` record.

## Invariants
- `HostileMobSystem.spawnCycle` never causes the live zombie count to exceed `HOSTILE_SPAWN_CAP`.
- `HostileMobSystem.tick` never advances (moves, retargets) an entity whose current chunk fails the
  supplied `isChunkTicking` predicate.
- Each zombie has at most one goal bundle, created no earlier than its first tick after spawn, never
  recreated while the entity remains active.
- A melee attack against the player is attempted only when a zombie has an acquired target (via its
  `TargetAcquisitionGoal`) within `HOSTILE_ATTACK_RANGE` horizontal distance of the zombie's current
  position in that same tick.
- The shared `InvulnerabilityTracker` (keyed by `PLAYER_SENTINEL_ID`) admits at most one successful
  hit per `DEFAULT_INVULNERABILITY_TICKS`-tick window, regardless of how many zombies attempt one
  that tick or across however many ticks are processed.
- `onPlayerDamaged` is invoked with a positive amount only when the underlying `resolveMeleeAttack`
  call reports `applied: true`.
- After `HostileMobRenderer.sync(zombies)`, the scene contains exactly one mesh per element of
  `zombies` (by id), and no others; after `dispose()`, zero.

## Requirements

### Requirement: HostileMobSystem requires a zombie definition
`HostileMobSystem`'s constructor MUST throw when the supplied `EntityRegistry` has no `zombie`
definition, and MUST NOT throw when it does.

#### Scenario: missing zombie definition
- **GIVEN** an `EntityRegistry` with no `zombie` entry
- **WHEN** `new HostileMobSystem(registry, seed)` is called
- **THEN** it throws

#### Scenario: default registry has a zombie definition
- **GIVEN** `createDefaultEntityRegistry()`
- **WHEN** `new HostileMobSystem(registry, seed)` is called
- **THEN** it does not throw

### Requirement: spawnCycle never exceeds the configured zombie cap
`HostileMobSystem.spawnCycle` MUST never bring the live zombie count above `HOSTILE_SPAWN_CAP`,
regardless of how many chunks or attempts are offered.

#### Scenario: repeated sweeps stop growing the population at the cap
- **GIVEN** a world where every spawn attempt would otherwise succeed (standable, dark enough for
  `MONSTER`, non-water-biome chunks) and more chunks/attempts than `HOSTILE_SPAWN_CAP`
- **WHEN** `spawnCycle` is called (possibly more than once)
- **THEN** the live zombie count never exceeds `HOSTILE_SPAWN_CAP`

### Requirement: tick only advances entities in the ticking set
`HostileMobSystem.tick` MUST NOT change the transform or velocity of any entity whose chunk fails
the supplied `isChunkTicking` predicate, and MUST run goal AI + physics for every entity whose chunk
passes it.

#### Scenario: a non-ticking entity is left untouched
- **GIVEN** one spawned zombie in a chunk that `isChunkTicking` reports `false` for
- **WHEN** `tick` is called
- **THEN** that zombie's transform and velocity are unchanged after the call

#### Scenario: a ticking entity gets a goal bundle and moves under AI/physics
- **GIVEN** one spawned zombie in a chunk that `isChunkTicking` reports `true` for, in an open area
  with ground below it and no player target available
- **WHEN** `tick` is called repeatedly with a positive `dt`
- **THEN** the zombie is assigned exactly one goal bundle (stable across calls), and gravity is
  observably applied (vertical velocity/position changes when airborne)

### Requirement: an in-range acquired target triggers a melee attack
`HostileMobSystem.tick` MUST invoke `onPlayerDamaged` with a positive amount when a zombie has an
acquired target within `HOSTILE_ATTACK_RANGE`, and MUST NOT invoke it when no target is acquired or
the target is farther than `HOSTILE_ATTACK_RANGE`.

#### Scenario: an in-range target is hit
- **GIVEN** one ticking zombie positioned within `HOSTILE_ATTACK_RANGE` of the position
  `getPlayerTarget()` returns, with a fresh (never-hit) shared invulnerability tracker
- **WHEN** `tick` is called once
- **THEN** `onPlayerDamaged` is called exactly once with a positive amount

#### Scenario: a target beyond detection range is never attacked
- **GIVEN** one ticking zombie and a `getPlayerTarget` position farther than `HOSTILE_DETECTION_RADIUS`
  from it
- **WHEN** `tick` is called
- **THEN** `onPlayerDamaged` is never called

### Requirement: the shared invulnerability window gates repeat hits
Once a hit lands, `HostileMobSystem.tick` MUST NOT invoke `onPlayerDamaged` again for any zombie
until `DEFAULT_INVULNERABILITY_TICKS` internal ticks have elapsed since that hit.

#### Scenario: an immediately-following tick does not re-hit
- **GIVEN** a zombie within attack range of the player target that already landed a hit on the
  previous `tick` call
- **WHEN** `tick` is called again on the very next call (well inside the invulnerability window)
- **THEN** `onPlayerDamaged` is not called on that call

#### Scenario: two zombies in range the same tick only land one hit
- **GIVEN** two ticking zombies both within attack range of the same player target, with a fresh
  shared invulnerability tracker
- **WHEN** `tick` is called once
- **THEN** `onPlayerDamaged` is called exactly once (not twice) for that call

### Requirement: HostileMobRenderer keeps the scene in sync with the live zombie set
`HostileMobRenderer.sync(zombies)` MUST result in exactly one mesh per element of `zombies` (matched
by entity id) existing in the scene afterward, with no extra meshes left over from entities no
longer present. `dispose()` MUST remove every mesh the renderer added.

#### Scenario: sync adds, updates, and removes meshes to match the live set
- **GIVEN** an empty scene, then `sync` called with two zombies, then `sync` called again with only
  one of those two zombies (plus a new third zombie)
- **WHEN** each `sync` call completes
- **THEN** after the first call the scene has 2 meshes; after the second, it has 2 meshes matching
  the (survivor, new) pair, with the dropped zombie's mesh removed

#### Scenario: dispose empties the scene
- **GIVEN** a renderer that has synced at least one zombie into the scene
- **WHEN** `dispose()` is called
- **THEN** the scene contains none of the renderer's meshes afterward

## Error and failure behavior
- `HostileMobSystem`'s constructor throws if the supplied registry has no `zombie` definition.
- `getPlayerTarget` throwing propagates unmodified (not caught/swallowed).
- No other function/method throws for well-formed inputs.

## Performance and resource bounds
- Spawn-cycle sweep cost is O(chunks × attemptsPerChunk); per-frame tick/render cost is O(live
  zombie count), bounded by `HOSTILE_SPAWN_CAP`.

## Compatibility and migration
- Two new, additive files; one `Game.ts` edit adding construction and two per-frame call sites, no
  existing signature changes. No schema/save-format change; zombies are session-only (not
  persisted).

## Security and integrity
- All queries are pure functions of existing, already-validated world/registry data and a
  caller-supplied player-position callback; no new untrusted input surface.

## Observability
- `HostileMobSystem.getActiveZombies()` exposes the full live set for future debugging/HUD use.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 constructor requires a zombie definition | `tests/unit/HostileMobBaseline.test.ts` constructor cases |
| REQ-2 spawnCycle cap enforcement | `tests/unit/HostileMobBaseline.test.ts` spawn-cycle cases |
| REQ-3 tick ticking-set gating + goal/physics composition | `tests/unit/HostileMobBaseline.test.ts` tick cases |
| REQ-4 in-range acquired target triggers melee attack | `tests/unit/HostileMobBaseline.test.ts` melee-attack cases |
| REQ-5 shared invulnerability window gates repeat hits | `tests/unit/HostileMobBaseline.test.ts` invulnerability cases |
| REQ-6 HostileMobRenderer sync/dispose | `tests/unit/HostileMobRenderer.test.ts` |
