# Design: 130-entity-collision-and-physics

## Context/current state
- 057 `CollisionResolver.move(world: ShapeWorld, box: CollisionBox, dx, dy, dz)` resolves
  axis-separated (X→Y→Z) swept movement against per-cell `VoxelShape`s, returning the clamped final
  position and per-axis `collidedX/Y/Z` flags. `box.x/y/z` is the box's **minimum corner**.
- `PlayerPhysics` (pre-057, still in place) integrates gravity/terminal-velocity and resolves
  collision against raw solid voxels directly (not via `CollisionResolver`), using the convention
  that `player.position.x/z` is the horizontal **center** and `player.position.y` is the **feet**
  (bottom). It is untouched by this change.
- 129 `EntityInstance.transform` is `{x, y, z, yaw, pitch}` with no established center/corner
  convention yet (129 stores/queries only; nothing interprets `x/y/z` spatially).

## Target state
- `src/simulation/EntityPhysics.ts` defines the center/feet convention for `EntityTransform` (matching
  `PlayerPhysics`, for consistency across the codebase's two physics paths) and provides a pure
  gravity+collision step plus a thin `EntityManager` integration wrapper.

## Invariants
- `transform.x`/`transform.z` are the entity's horizontal bounding-box **center**; `transform.y` is
  the box's **bottom** (feet). `box.width`/`box.depth` are the full horizontal extents (centered on
  x/z); `box.height` is the full vertical extent (from `y` upward).
- Gravity is applied to `velocity.vy` before movement is resolved (matches `PlayerPhysics` order);
  the result is clamped so `vy >= -terminalVelocity`.
- After resolution, `velocity.vx`/`vy`/`vz` is set to `0` on any axis the resolver reports as
  collided; `onGround` is `true` exactly when the Y axis collided while moving downward
  (`dy < 0 && result.collidedY`).
- `computeEntityPhysicsStep` is pure: it never mutates its `transform`/`velocity`/`box` inputs and
  returns new objects.
- `tickEntityPhysics` performs no write when the target entity is missing, `REMOVED`, or `dt <= 0`;
  it is the only symbol in this module that touches an `EntityManager`.

## API and data model
```ts
export interface EntityPhysicsBox { readonly width: number; readonly height: number; readonly depth: number; }
export interface EntityPhysicsOptions { gravity?: number; terminalVelocity?: number; }
export interface EntityPhysicsStepResult { transform: EntityTransform; velocity: EntityVelocity; onGround: boolean; }

export const DEFAULT_GRAVITY = 26.0;           // blocks/s^2 — matches CONFIG.player.gravity's value
export const DEFAULT_TERMINAL_VELOCITY = 54.0; // blocks/s — matches CONFIG.player.terminalVelocity's value

export function computeEntityPhysicsStep(
  world: ShapeWorld,
  resolver: CollisionResolver,
  transform: EntityTransform,
  velocity: EntityVelocity,
  box: EntityPhysicsBox,
  dt: number,
  opts?: EntityPhysicsOptions,
): EntityPhysicsStepResult;

export function tickEntityPhysics(
  manager: EntityManager,
  id: number,
  world: ShapeWorld,
  resolver: CollisionResolver,
  box: EntityPhysicsBox,
  dt: number,
  opts?: EntityPhysicsOptions,
): { ran: boolean; onGround: boolean };
```
The two gravity/terminal-velocity constants are declared locally in this module (not imported from
`CONFIG.player`) so non-player entity physics is not coupled to the player config namespace; their
values are chosen to match `CONFIG.player.gravity`/`terminalVelocity` for a physically consistent
world, documented in a code comment referencing the duplication.

## Control/data flow
1. `computeEntityPhysicsStep`:
   a. Validates `box.width > 0 && box.height > 0 && box.depth > 0` and `dt` is finite; a non-finite
      `dt` is treated as `0` (no movement, gravity still integrates — see Failure modes).
   b. `vy' = clamp(velocity.vy - gravity * dt, -terminalVelocity, +Infinity)`.
   c. Builds a `CollisionBox` from `transform`/`box`:
      `{ x: transform.x - box.width/2, y: transform.y, z: transform.z - box.depth/2, width, height, depth }`.
   d. Calls `resolver.move(world, collisionBox, velocity.vx * dt, vy' * dt, velocity.vz * dt)`.
   e. Converts the result back to a transform (`x: result.x + box.width/2`, `y: result.y`,
      `z: result.z + box.depth/2`; `yaw`/`pitch` passed through unchanged).
   f. Builds the output velocity: `vx: result.collidedX ? 0 : velocity.vx`,
      `vy: result.collidedY ? 0 : vy'`, `vz: result.collidedZ ? 0 : velocity.vz`.
   g. `onGround = result.collidedY && vy' < 0`.
2. `tickEntityPhysics`:
   a. `dt <= 0` or non-finite → `{ ran: false, onGround: false }`, no manager write.
   b. `manager.get(id)` missing or `state !== 'ACTIVE'` → `{ ran: false, onGround: false }`.
   c. Else runs step (a), writes `setTransform(id, result.transform)` and
      `setVelocity(id, result.velocity)` (both guaranteed to succeed since the entity was just
      confirmed `ACTIVE` and the outputs are always finite), returns `{ ran: true, onGround }`.

## Detailed behavior
- Horizontal collision (`collidedX`/`collidedZ`) zeroes only that axis's velocity component, matching
  `PlayerPhysics`'s per-axis zeroing; it does not affect `onGround`.
- A ceiling collision (`collidedY` while moving upward, `vy' > 0`) zeroes `vy` but `onGround` stays
  `false` (only a downward collision grounds the entity, matching `PlayerPhysics`'s `resolve()`).
- `dt <= 0` in `computeEntityPhysicsStep` (called directly, not through `tickEntityPhysics`) still
  applies gravity to `vy` (mirrors `PlayerPhysics`, which always integrates gravity once `d` is
  clamped `>= 0`) but performs no displacement (`0 * anything = 0`), so position is unchanged and the
  resolver reports no collision, `onGround = false`. `tickEntityPhysics` short-circuits before this
  so a caller ticking through the manager never observes a wasted gravity-only step.

## Failure modes
- `box` with a non-positive `width`/`height`/`depth`: throws (mirrors `CollisionResolver.assertBox`'s
  existing contract, which `resolver.move` already enforces — `computeEntityPhysicsStep` does not
  duplicate the check, it simply propagates the resolver's `RangeError`).
- `tickEntityPhysics` on an unknown or `REMOVED` id: `{ ran: false, onGround: false }`, no throw, no
  write.
- `tickEntityPhysics` with `dt <= 0` or non-finite: `{ ran: false, onGround: false }`, no write.

## Compatibility/migration
- One new file; zero edits to existing modules. No schema/save-format change; no migration.

## Performance/resource constraints
- One `CollisionResolver.move` call per tick per entity, which is itself bounded by the swept cell
  range around the entity's box (057's existing cost model — no new unbounded cost introduced here).
- No sub-stepping (documented non-goal): O(1) resolver calls per tick per entity, not O(steps).

## Testing seams
- `computeEntityPhysicsStep` depends only on a `ShapeWorld` (fixture) and a `CollisionResolver`
  instance — no `Game`/`Player`/`World`.
- `tickEntityPhysics` additionally depends on an `EntityManager` constructed with
  `createDefaultEntityRegistry()` (129's existing testing seam).

## Observability/debugging
- `EntityPhysicsStepResult`/`tickEntityPhysics`'s return value directly exposes `onGround`, useful for
  a future consumer (mob AI, animation) without re-deriving it.

## Affected files/symbols
- `src/simulation/EntityPhysics.ts` (new).
- Tests: `tests/unit/EntityPhysics.test.ts` (new).

## Rejected alternatives
- **Reusing `PlayerPhysics` directly for non-player entities**: rejected — `PlayerPhysics` is bound to
  the concrete `Player` class and raw solid-voxel checks (not shape-aware), and mutates a `Player`
  instance in place; 130 needs a manager-/shape-agnostic pure step usable by any `EntityInstance`.
- **Storing bounding-box dimensions on `EntityTypeDefinition` (017)**: rejected for this change (see
  proposal Non-goals) — keeps 130 additive-only; can be layered on later without breaking this API
  (a future change could add an optional lookup that defaults to a caller-supplied box).
- **Importing `CONFIG.player.gravity`/`terminalVelocity` directly**: rejected — couples non-player
  entity physics to the player config namespace; local constants with matching values keep the
  modules independent while staying physically consistent.
- **Sub-stepping like `PlayerPhysics`**: rejected as a documented non-goal — not needed at current
  non-player entity speeds; can be added later without an API break (an additional internal loop).

## Downstream dependencies
- 132 (`entity-chunk-tracking`) will decide which entities' physics actually tick per frame.
- 136+ (mob AI) will supply per-mob bounding boxes and call `tickEntityPhysics` each simulation tick
  for spawned mobs.
- 142 (`projectile-core`) will very likely need its own step (sub-stepped, no gravity clamp the same
  way) rather than reusing this one, given projectiles' different motion profile.
