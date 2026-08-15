# Spec: projectile-core

## Contract
This capability adds one pure per-tick projectile physics/collision step, `stepProjectile`, over
057's `CollisionResolver`: vanilla-style gravity+drag motion, entity-hit detection (with
owner-immunity), block-hit detection, and age-based expiration. No damage computation, no
entity/item representation, and no `Game`/spawning wiring — see the proposal's Non-goals.

## Definitions
- **Projectile state**: `{x, y, z, vx, vy, vz, ownerId, ageTicks}`.
- **Owner immunity window**: the number of ticks (from the projectile's post-increment age) during
  which the firer (`ownerId`) is excluded from entity-hit candidates.
- **Entity hit**: the first target (in supplied order) whose squared distance to the tick's
  destination point is within its squared radius, excluding the owner during its immunity window.
- **Block hit**: a collision reported by `CollisionResolver.move` on any axis, using a small cube
  centered on the projectile's pre-tick position. `hitBlock` reports `floor(x/y/z)` of the resolved
  (embedded) rest position — typically the cell immediately against the solid surface, not
  necessarily the solid cell itself (see design.md).
- **Expired**: `ageTicks` (post-increment) exceeds `maxAgeTicks`.

## Invariants
- Physics order is fixed: gravity subtracted from `vy`, then position integrated, then (only on a
  clear/non-hit tick) drag applied to velocity.
- Entity-hit detection is evaluated before block collision; an entity hit suppresses any block-hit
  report for that tick.
- On any hit (block or entity), the returned velocity is exactly `{vx:0, vy:0, vz:0}`.
- An expired tick performs no physics: the returned state's position/velocity equal the input's,
  only `ageTicks` differs.

## Requirements

### Requirement: gravity and drag apply in the documented order on a clear-flight tick
On a tick with no block or entity collision, `stepProjectile` MUST subtract `gravity` from `vy`
before integrating position, and MUST apply `drag` to the resulting velocity components only for the
*next* tick's stored velocity (not to the displacement just applied).

#### Scenario: a free-falling projectile in an empty world updates position and velocity in order
- **GIVEN** an empty `ShapeWorld`, `state.vy = 0`, default `gravity`/`drag`
- **WHEN** `stepProjectile` is called
- **THEN** the returned `state.y` decreased by exactly `gravity` (the pre-drag `vy`), and the
  returned `state.vy` equals `-gravity * drag`

### Requirement: block collision embeds the projectile, zeroes velocity, and reports the cell
When `CollisionResolver.move` reports a collision on any axis, `stepProjectile` MUST return the
resolved (clamped) position, zeroed velocity, and `hitBlock` set to the floored cell the projectile
now occupies, with `hitEntityId: null`.

#### Scenario: a projectile flying into a solid floor embeds and reports the resting block
- **GIVEN** a `ShapeWorld` with a full-cube floor directly below the projectile's flight path
- **WHEN** `stepProjectile` is called with a downward velocity that would cross the floor
- **THEN** the result has `hitBlock` equal to `floor` of the resolved embedded position (the cell
  the projectile now rests in, directly against the floor's top face), `state.vx/vy/vz` all `0`,
  and `hitEntityId: null`

### Requirement: entity collision takes priority over block collision and reports the target id
When a non-immune target's squared distance to the tick's destination point is within its squared
radius, `stepProjectile` MUST return `hitEntityId` set to that target's id and zeroed velocity, MUST
NOT report `hitBlock` even if a block collision would also have fired this tick, and MUST use the
first matching target in supplied order.

#### Scenario: a target directly in the flight path is hit instead of the block behind it
- **GIVEN** a `ShapeWorld` with a solid block behind a target, and a target positioned exactly at
  the tick's destination point with a non-zero radius
- **WHEN** `stepProjectile` is called
- **THEN** the result has `hitEntityId` equal to that target's id, `hitBlock: null`, and zeroed
  velocity

### Requirement: the owner is immune to being hit within ownerImmunityTicks, then hittable
`stepProjectile` MUST exclude a target whose `id` equals `state.ownerId` from entity-hit detection
while the post-increment `ageTicks <= ownerImmunityTicks`, and MUST include it (hittable like any
other target) once `ageTicks > ownerImmunityTicks`.

#### Scenario: the owner is not hit during the immunity window
- **GIVEN** a target whose `id` equals `state.ownerId`, positioned exactly at the tick's destination
  point, and `state.ageTicks = 0` with default `ownerImmunityTicks = 5`
- **WHEN** `stepProjectile` is called
- **THEN** `hitEntityId` is `null` (the owner was skipped)

#### Scenario: the owner becomes hittable after the immunity window elapses
- **GIVEN** the same owner-target setup, but `state.ageTicks` already at `ownerImmunityTicks`
- **WHEN** `stepProjectile` is called (making the post-increment age exceed the window)
- **THEN** `hitEntityId` equals the owner's id

### Requirement: expiration stops physics without altering position/velocity
Once the post-increment `ageTicks` exceeds `maxAgeTicks`, `stepProjectile` MUST return
`expired: true` with the returned state's `x`/`y`/`z`/`vx`/`vy`/`vz` identical to the input state's
(only `ageTicks` differs), and MUST NOT report a block or entity hit.

#### Scenario: an aged-out projectile's physics are frozen
- **GIVEN** `state.ageTicks = maxAgeTicks` (so the post-increment age exceeds it)
- **WHEN** `stepProjectile` is called
- **THEN** `expired` is `true`, `hitBlock`/`hitEntityId` are both `null`, and the returned
  position/velocity equal the input's exactly

## Error and failure behavior
- `stepProjectile` does not throw for a well-formed `ShapeWorld`/`CollisionResolver` and finite
  state/options.

## Performance and resource bounds
- One `CollisionResolver.move` call per tick when no entity hit already fired; O(m) distance checks
  against the supplied `targets` array.

## Compatibility and migration
- One new, additive file (`src/simulation/ProjectileCore.ts`); no edits to `CollisionResolver`,
  `VoxelShape`, or any other module. No schema/save-format change; no migration.

## Security and integrity
- All returned position/velocity values are derived from finite arithmetic on finite inputs, so no
  non-finite value can be produced from a well-formed call.

## Observability
- `ProjectileStepResult`'s `hitBlock`/`hitEntityId`/`expired` fields fully explain one tick's outcome.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 gravity/drag order on a clear tick | `tests/unit/ProjectileCore.test.ts` free-fall case |
| REQ-2 block collision embeds and reports the cell | `tests/unit/ProjectileCore.test.ts` block-hit case |
| REQ-3 entity collision takes priority, reports the id | `tests/unit/ProjectileCore.test.ts` entity-hit-priority case |
| REQ-4 owner immunity then hittable | `tests/unit/ProjectileCore.test.ts` owner-immunity cases |
| REQ-5 expiration freezes physics | `tests/unit/ProjectileCore.test.ts` expiration case |
