# Spec: entity-collision-and-physics

## Contract
This capability adds a pure gravity+collision physics step for non-player entities,
`computeEntityPhysicsStep`, built on the existing 057 `CollisionResolver`/056 `VoxelShape` shape-aware
collision primitive, plus a thin wrapper, `tickEntityPhysics`, that reads/writes one entity's
transform/velocity through a 129 `EntityManager`. No player migration, no per-type bounding-box
storage, no sub-stepping, no AI/spawning, and no fluid physics are in scope — see the proposal's
Non-goals.

## Definitions
- **Transform convention**: `transform.x`/`z` are the entity bounding box's horizontal center;
  `transform.y` is the box's bottom (feet). Matches `PlayerPhysics`'s existing convention.
- **Entity physics box**: `{ width, height, depth }`, all positive numbers; `width`/`depth` are full
  horizontal extents centered on `x`/`z`, `height` is the full vertical extent measured up from `y`.
- **Physics step**: one gravity-then-collision resolution of an entity's transform/velocity over
  `dt` seconds, producing a new transform, a new velocity, and an `onGround` flag.
- **Grounded**: `onGround === true` exactly when the step's Y-axis movement was collided while moving
  downward (post-gravity `vy < 0` and the resolver reports `collidedY`).
- **Tick wrapper**: `tickEntityPhysics` — resolves one entity by id through an `EntityManager`, runs a
  physics step, and writes the result back via `setTransform`/`setVelocity`; a safe no-op for a
  missing/`REMOVED` entity or a non-positive/non-finite `dt`.

## Invariants
- `computeEntityPhysicsStep` never mutates its `transform`/`velocity`/`box` arguments; it returns new
  objects.
- Post-step `velocity.vy >= -terminalVelocity` always (gravity clamp applied before movement).
- Any axis the resolver reports as collided has its output velocity component set to exactly `0`.
- `onGround` is `true` only for a collided downward Y move; a horizontal collision or an upward
  (ceiling) collision never sets it.
- `tickEntityPhysics` performs no write to the `EntityManager` when it returns `ran: false`.

## Requirements

### Requirement: free-fall integrates gravity and clamps at terminal velocity
`computeEntityPhysicsStep`, given an empty `ShapeWorld` (no collision anywhere) and a starting
`velocity.vy`, MUST subtract `gravity * dt` from `vy` before integrating position, and MUST clamp the
result so it never goes below `-terminalVelocity`.

#### Scenario: gravity reduces vy and moves the entity down over one step
- **GIVEN** an empty `ShapeWorld`, `velocity = { vx: 0, vy: 0, vz: 0 }`, `dt = 1`, default gravity
- **WHEN** `computeEntityPhysicsStep` is called
- **THEN** the returned `velocity.vy` equals `-gravity` and `transform.y` has decreased by `gravity * dt`
- **AND** `onGround` is `false`

#### Scenario: repeated free-fall clamps vy at the terminal velocity
- **GIVEN** an empty `ShapeWorld` and a `velocity.vy` already far beyond `-terminalVelocity`
- **WHEN** `computeEntityPhysicsStep` is called
- **THEN** the returned `velocity.vy` equals exactly `-terminalVelocity`, not a more negative value

### Requirement: landing on a solid floor grounds the entity and zeroes vertical velocity
`computeEntityPhysicsStep`, given a `ShapeWorld` with a full-cube floor directly below a falling
entity's box, MUST clamp the entity's final Y position to the floor's top face, set the returned
`velocity.vy` to `0`, and report `onGround === true`.

#### Scenario: a falling entity lands exactly on top of a full-cube floor
- **GIVEN** a `ShapeWorld` returning `VoxelShape.FULL_CUBE` at `y = 0` and `EMPTY` elsewhere, an
  entity box of `height = 1.8` starting with its feet at `y = 5` and `velocity.vy = -20`
- **WHEN** `computeEntityPhysicsStep` is called with `dt` large enough that the unobstructed fall
  would cross `y = 1`
- **THEN** the returned `transform.y` equals `1` (the floor's top face), `velocity.vy === 0`, and
  `onGround === true`

### Requirement: horizontal collision zeroes only the colliding axis and never grounds the entity
`computeEntityPhysicsStep`, given a `ShapeWorld` with a full-cube wall directly ahead on the X or Z
axis, MUST clamp that axis to the wall's face, zero only that axis's velocity component, leave the
other axes' velocity untouched, and report `onGround === false` (unless a separate, simultaneous
downward Y collision also occurred).

#### Scenario: walking into a wall zeroes vx but leaves vy/vz and the Y position from gravity alone
- **GIVEN** a `ShapeWorld` with a full-cube wall immediately ahead on +X and otherwise empty, an
  entity moving with `velocity = { vx: 5, vy: 0, vz: 2 }`
- **WHEN** `computeEntityPhysicsStep` is called with a `dt` that would otherwise cross into the wall
- **THEN** the returned `transform.x` is clamped to the wall's face, `velocity.vx === 0`,
  `velocity.vz` is unchanged from its post-step (non-collided) value, and `onGround === false`

### Requirement: a ceiling collision zeroes vy without grounding the entity
`computeEntityPhysicsStep`, given a `ShapeWorld` with a full-cube ceiling directly above a rising
entity, MUST clamp the Y position to the ceiling's bottom face, zero `velocity.vy`, and report
`onGround === false`.

#### Scenario: jumping into a ceiling stops upward motion without grounding
- **GIVEN** a `ShapeWorld` with a full-cube ceiling directly above, `velocity.vy = 20` (net positive
  after gravity for the tested `dt`)
- **WHEN** `computeEntityPhysicsStep` is called
- **THEN** `transform.y` clamps to the ceiling's bottom face, `velocity.vy === 0`, and
  `onGround === false`

### Requirement: tickEntityPhysics is a safe no-op off a valid active entity or a non-positive dt
`tickEntityPhysics` MUST return `{ ran: false, onGround: false }` and perform no `EntityManager`
write when `id` does not resolve to an `ACTIVE` entity, or when `dt` is not a finite positive number.
Otherwise it MUST run `computeEntityPhysicsStep` and write the resulting transform/velocity back via
`setTransform`/`setVelocity`, returning `{ ran: true, onGround }`.

#### Scenario: tickEntityPhysics no-ops on an unknown id, a removed id, and dt <= 0
- **GIVEN** an `EntityManager`, an unknown id, and a removed id
- **WHEN** `tickEntityPhysics` is called on each, and separately on a valid active id with `dt = 0`
- **THEN** every call returns `{ ran: false, onGround: false }` and no entity's transform/velocity
  changes

#### Scenario: tickEntityPhysics runs the step and persists the result through the manager
- **GIVEN** an `EntityManager` with one `ACTIVE` entity falling toward a full-cube floor
- **WHEN** `tickEntityPhysics` is called with a `dt` that reaches the floor
- **THEN** it returns `{ ran: true, onGround: true }`, and `manager.get(id)` reflects the landed
  transform and zeroed vertical velocity

## Error and failure behavior
- `computeEntityPhysicsStep`/`tickEntityPhysics` propagate `CollisionResolver`'s `RangeError` for a
  non-positive `box` dimension (not re-validated/re-thrown differently).
- `tickEntityPhysics` never throws for a missing/removed id or a non-positive/non-finite `dt`; it
  returns the documented no-op result.

## Performance and resource bounds
- One `CollisionResolver.move` call per `computeEntityPhysicsStep` invocation; cost is bounded by the
  swept cell range around the entity's box, per 057's existing model. No sub-stepping (documented
  non-goal): O(1) resolver calls per tick per entity.

## Compatibility and migration
- One new file (`src/simulation/EntityPhysics.ts`); zero edits to any existing module. No schema/
  save-format change; no migration.

## Security and integrity
- Output velocity/transform values are always finite: gravity/collision arithmetic on finite inputs
  produces finite outputs, and `CollisionResolver` itself only ever clamps within the swept range.

## Observability
- `onGround` is directly exposed on both `computeEntityPhysicsStep`'s result and
  `tickEntityPhysics`'s return value.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 free-fall gravity + terminal-velocity clamp | `tests/unit/EntityPhysics.test.ts` free-fall cases |
| REQ-2 landing grounds and zeroes vy | `tests/unit/EntityPhysics.test.ts` floor-landing case |
| REQ-3 horizontal collision zeroes only that axis | `tests/unit/EntityPhysics.test.ts` wall-collision case |
| REQ-4 ceiling collision zeroes vy without grounding | `tests/unit/EntityPhysics.test.ts` ceiling case |
| REQ-5 tickEntityPhysics no-ops / persists via manager | `tests/unit/EntityPhysics.test.ts` tickEntityPhysics cases |
