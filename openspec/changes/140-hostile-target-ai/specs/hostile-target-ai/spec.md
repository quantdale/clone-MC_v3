# Spec: hostile-target-ai

## Contract
This capability adds the hostile analog to 139's baseline: `TargetAcquisitionGoal` (finds/tracks the
nearest valid target via an injected callback) and `ChaseGoal` (steers toward that target, stopping
within attack range). No obstacle-aware pathfinding, no line-of-sight checks, no actual attack/
damage, and no `Game`/mob-spawning wiring — see the proposal's Non-goals.

## Definitions
- **Target position**: `{x, y, z}` returned by the caller-supplied `findNearestTarget` callback.
- **Detection radius**: the maximum distance at which `TargetAcquisitionGoal` may newly acquire a
  target.
- **Forget radius**: the maximum distance at which an already-acquired target is retained (larger
  than the detection radius, providing hysteresis).
- **Attack range**: the distance within which `ChaseGoal` stops steering and hands off to a future
  attack goal (141).

## Invariants
- `TargetAcquisitionGoal.canUse()` is `true` only when `findNearestTarget` returns a non-`null`
  position within `detectionRadius`.
- `TargetAcquisitionGoal.canContinueToUse()` re-queries `findNearestTarget` every call and is `false`
  exactly when it returns `null` or the (possibly updated) distance exceeds `forgetRadius`.
- `TargetAcquisitionGoal.getTarget()` reflects the most recently accepted target, or `null` before
  acquisition or after `stop()`.
- `ChaseGoal.canUse()`/`canContinueToUse()` are `true` only when `targetSource.getTarget()` is
  non-`null`.
- `ChaseGoal.tick()` never writes `vy`.

## Requirements

### Requirement: TargetAcquisitionGoal only acquires a target within detectionRadius
`TargetAcquisitionGoal.canUse()` MUST return `true` when `findNearestTarget` returns a position
within `detectionRadius` of the entity, and `false` when it returns `null` or a position farther
than `detectionRadius`.

#### Scenario: a target within detection radius is acquired
- **GIVEN** a `findNearestTarget` callback returning a position 5 blocks away and a
  `detectionRadius` of 16
- **WHEN** `canUse()` is called
- **THEN** it returns `true`

#### Scenario: a target beyond detection radius is not acquired
- **GIVEN** the same callback returning a position 50 blocks away
- **WHEN** `canUse()` is called
- **THEN** it returns `false`

### Requirement: an acquired target is tracked live and dropped beyond forgetRadius
Once started, `TargetAcquisitionGoal.canContinueToUse()` MUST re-query `findNearestTarget` and
update `getTarget()` to the fresh position each call, returning `true` while that position is within
`forgetRadius`, and `false` once the callback returns `null` or the position exceeds `forgetRadius`.

#### Scenario: a target that moves but stays within forgetRadius keeps being tracked
- **GIVEN** an acquired target whose position (per a stateful test callback) moves closer or farther
  but always stays within `forgetRadius`
- **WHEN** `canContinueToUse()` is called after the move
- **THEN** it returns `true`, and `getTarget()` reflects the new position

#### Scenario: a target moving beyond forgetRadius is dropped
- **GIVEN** an acquired target whose position then moves beyond `forgetRadius`
- **WHEN** `canContinueToUse()` is called
- **THEN** it returns `false`

#### Scenario: the callback returning null drops the target
- **GIVEN** an acquired target, then `findNearestTarget` starts returning `null` (e.g. the target
  died)
- **WHEN** `canContinueToUse()` is called
- **THEN** it returns `false`

### Requirement: ChaseGoal requires an acquired target to run
`ChaseGoal.canUse()` and `canContinueToUse()` MUST return `false` whenever
`targetSource.getTarget()` is `null`, and MUST return `true` (subject to the entity existing) when it
is non-`null`.

#### Scenario: no chase without an acquired target
- **GIVEN** a `TargetAcquisitionGoal` with no acquired target (`getTarget()` returns `null`)
- **WHEN** a dependent `ChaseGoal.canUse()` is called
- **THEN** it returns `false`

### Requirement: ChaseGoal steers toward the target and stops within attackRange
While farther than `attackRange`, `ChaseGoal.tick()` MUST set the entity's horizontal velocity toward
the target scaled by `speed`, leaving `vy` unchanged. Once within `attackRange`, `tick()` MUST zero
the horizontal velocity instead, leaving `vy` unchanged.

#### Scenario: steering toward a distant target
- **GIVEN** an acquired target farther than `attackRange`
- **WHEN** `ChaseGoal.tick()` is called
- **THEN** the entity's horizontal velocity has nonzero magnitude directed toward the target, and
  `vy` is unchanged

#### Scenario: stopping within attack range
- **GIVEN** an acquired target within `attackRange`
- **WHEN** `ChaseGoal.tick()` is called
- **THEN** the entity's `vx`/`vz` become `0` and `vy` is unchanged

### Requirement: both goals are deterministic given a deterministic target callback
Given a deterministic `findNearestTarget` callback and identical entity/world state, calling the
same sequence of lifecycle methods on independently constructed goal instances MUST produce
identical observable outcomes.

#### Scenario: repeated identical runs produce identical velocity
- **GIVEN** two entities with identical starting transforms, each governed by identically-configured
  `TargetAcquisitionGoal`/`ChaseGoal` pairs using the same deterministic callback
- **WHEN** the same lifecycle call sequence is run on both
- **THEN** both entities end up with identical velocity

## Error and failure behavior
- Neither goal throws when its entity is missing/not `ACTIVE`, or when `findNearestTarget` returns
  `null`; a throwing `findNearestTarget` propagates unmodified.

## Performance and resource bounds
- Every method on both goals is O(1) (one `findNearestTarget` call plus arithmetic).

## Compatibility and migration
- One new, additive file (`src/simulation/HostileTargetAI.ts`); no edits to `GoalSelector` or
  `EntityManager`. No schema/save-format change; no migration.

## Security and integrity
- Both goals only ever write through `EntityManager`'s existing validated `setVelocity`, so they can
  never write a non-finite value into entity state.

## Observability
- `TargetAcquisitionGoal.getTarget()` exposes the tracked target for inspection or for a dependent
  goal to read.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 acquisition bounded by detectionRadius | `tests/unit/HostileTargetAI.test.ts` acquisition cases |
| REQ-2 tracking/dropping via forgetRadius | `tests/unit/HostileTargetAI.test.ts` continuation cases |
| REQ-3 ChaseGoal requires an acquired target | `tests/unit/HostileTargetAI.test.ts` no-target case |
| REQ-4 ChaseGoal steers/stops correctly | `tests/unit/HostileTargetAI.test.ts` tick cases |
| REQ-5 determinism given a deterministic callback | `tests/unit/HostileTargetAI.test.ts` determinism case |
