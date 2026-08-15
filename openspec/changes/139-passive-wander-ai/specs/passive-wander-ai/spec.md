# Spec: passive-wander-ai

## Contract
This capability adds the first two concrete `Goal` (136) implementations: `WanderGoal` (move toward
a nearby walkable, non-water target) and `LookGoal` (periodically face a new random direction). Both
are deterministic given an injected `SeedRng` (054). No pathfinding-through-obstacles, no
terrain-following target search, and no `Game`/mob-spawning wiring — see the proposal's Non-goals.

## Definitions
- **Wander target**: an `(x, z)` column (at the entity's current rounded `y`) that is not `Water`
  (134 `classifyNode`) and passes `canStandAt` (134).
- **Arrival**: the entity's horizontal distance to its wander target is within `arrivalRadius`.
- **Filler goal**: a goal (`LookGoal`) that is always eligible and has no meaningful "finish"
  condition beyond being interrupted or re-selected.

## Invariants
- `WanderGoal` never proposes a target that is `Water` or fails `canStandAt`.
- `WanderGoal.tick()` writes only `vx`/`vz`; it never writes `vy`. `LookGoal.tick()` writes only
  `yaw`; it never writes `x`/`y`/`z`/`pitch`/velocity.
- Both goals' only source of randomness is the injected `SeedRng`; identical RNG state and identical
  world/entity state always produce identical decisions.
- `WanderGoal.canContinueToUse()` is `false` at arrival, at the duration timeout, or when the entity
  no longer exists/is not `ACTIVE`.

## Requirements

### Requirement: WanderGoal only selects a walkable, non-water target
`WanderGoal.canUse()` MUST return `true` only when it has found, within its bounded attempt budget,
a target column that is not `Water` and passes `canStandAt`; it MUST return `false` when every
attempt fails (e.g. the entity is surrounded by water/obstructions) or the entity is missing/not
`ACTIVE`.

#### Scenario: a target is never selected in water
- **GIVEN** a `WanderGoal` whose entity is surrounded entirely by water within its wander radius
- **WHEN** `canUse()` is called repeatedly (varying the RNG's random-start gate to pass each time)
- **THEN** it always returns `false` (no valid non-water target exists)

#### Scenario: an open, standable area yields a valid target and canUse succeeds
- **GIVEN** a `WanderGoal` whose entity has open, standable, non-water ground throughout its wander
  radius, and an RNG state that passes the random-start gate
- **WHEN** `canUse()` is called
- **THEN** it returns `true`

### Requirement: WanderGoal steers toward its target and stops at arrival
Once started, `WanderGoal.tick()` MUST set the entity's horizontal velocity toward the target
(scaled by `speed`), leaving `vy` unchanged. `canContinueToUse()` MUST become `false` once the
entity's horizontal distance to the target is within `arrivalRadius`, and `stop()` MUST zero the
horizontal velocity while leaving `vy` unchanged.

#### Scenario: tick steers horizontal velocity toward the target without touching vy
- **GIVEN** a started `WanderGoal` with a target to the entity's `+x` side and a non-zero `vy`
- **WHEN** `tick()` is called
- **THEN** the entity's `vx` becomes positive (toward the target), `vz` reflects the target's `z`
  offset, and `vy` is unchanged

#### Scenario: reaching the target stops continuation and zeroes horizontal velocity on stop
- **GIVEN** an entity placed within `arrivalRadius` of its `WanderGoal`'s target
- **WHEN** `canContinueToUse()` is called, then (simulating the selector) `stop()` is called
- **THEN** `canContinueToUse()` returns `false`, and after `stop()` the entity's `vx`/`vz` are `0`
  while `vy` is unchanged

### Requirement: WanderGoal times out after maxDurationTicks
`WanderGoal.canContinueToUse()` MUST return `false` once `maxDurationTicks` ticks have elapsed since
`start()`, even if the entity has not reached the target.

#### Scenario: a goal that never arrives stops after the duration timeout
- **GIVEN** a started `WanderGoal` with `maxDurationTicks = 3` and a target the entity never
  actually approaches (velocity has no effect on position in this unit-test context)
- **WHEN** `tick()` is called 3 times and then `canContinueToUse()` is checked
- **THEN** `canContinueToUse()` returns `false`

### Requirement: LookGoal changes yaw at its change chance and touches nothing else
`LookGoal.tick()` MUST set a new random `yaw` in `[0, 360)` when `rng.nextFloat() < changeChance`,
and MUST leave `x`/`y`/`z`/`pitch` and velocity unchanged in every case (whether or not the yaw
changed).

#### Scenario: a tick below the change-chance threshold updates yaw only
- **GIVEN** a `LookGoal` with an `rng` that returns a value below `changeChance`
- **WHEN** `tick()` is called
- **THEN** the entity's `yaw` changes to a value in `[0, 360)`, and `x`/`y`/`z`/`pitch`/velocity are
  unchanged

#### Scenario: a tick at or above the change-chance threshold changes nothing
- **GIVEN** a `LookGoal` with an `rng` that returns a value at or above `changeChance`
- **WHEN** `tick()` is called
- **THEN** the entity's transform is completely unchanged

### Requirement: both goals are deterministic given identical RNG and world/entity state
Given two independently constructed goal instances with identically-seeded `SeedRng`s and identical
world/entity state, calling the same sequence of lifecycle methods on both MUST produce identical
observable outcomes (velocity/transform changes).

#### Scenario: two identically-seeded WanderGoals make the same target/steering decisions
- **GIVEN** two entities with identical starting transforms in identical worlds, each governed by a
  `WanderGoal` constructed with identically-seeded `SeedRng`s
- **WHEN** `canUse()`, `start()`, and `tick()` are called in the same sequence on both
- **THEN** both entities end up with identical velocity

## Error and failure behavior
- Neither goal throws when its entity is missing or not `ACTIVE`; `canUse()`/`canContinueToUse()`
  return `false` and `tick()`/`stop()` are no-ops in that case.

## Performance and resource bounds
- `WanderGoal.canUse()` performs a bounded number of target-search attempts (a fixed internal
  constant), each O(height) via `canStandAt`. All other methods on both goals are O(1).

## Compatibility and migration
- One new, additive file (`src/simulation/PassiveWanderAI.ts`); no edits to `GoalSelector`,
  `EntityManager`, `NavigationGridQuery`, or `SeedRng`. No schema/save-format change; no migration.

## Security and integrity
- Both goals only ever write through `EntityManager`'s existing validated setters
  (`setVelocity`/`setTransform`), so they can never write a non-finite value into entity state.

## Observability
- Goal-driven changes are directly observable via `EntityManager.get(entityId)`'s `transform`/
  `velocity` after each lifecycle call.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 WanderGoal target is walkable and non-water | `tests/unit/PassiveWanderAI.test.ts` canUse cases |
| REQ-2 WanderGoal steers toward target, stops at arrival | `tests/unit/PassiveWanderAI.test.ts` tick/arrival cases |
| REQ-3 WanderGoal times out after maxDurationTicks | `tests/unit/PassiveWanderAI.test.ts` timeout case |
| REQ-4 LookGoal changes yaw only at its chance | `tests/unit/PassiveWanderAI.test.ts` LookGoal cases |
| REQ-5 determinism given identical RNG/state | `tests/unit/PassiveWanderAI.test.ts` determinism case |
