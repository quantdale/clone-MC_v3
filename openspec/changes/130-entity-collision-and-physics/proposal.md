# Proposal: 130-entity-collision-and-physics

## Problem
129 gave non-player entities a runtime model (`EntityInstance`/`EntityManager`) with a stored
`transform`/`velocity`, but nothing integrates that velocity into position, applies gravity, or
resolves collision against the world. The shape-aware collision primitive already exists (057
`CollisionResolver`/056 `VoxelShape`) and is already exercised by the player's shape-aware collision
path, but no non-player entity movement/gravity step exists yet.

## Goals
- A pure, deterministic per-tick physics step for one entity: apply gravity to vertical velocity
  (clamped at a terminal velocity), integrate `(vx, vy, vz) * dt` through the existing 057
  `CollisionResolver` against a `ShapeWorld`, zero the velocity component of any axis that collided,
  and report whether the entity is now grounded (a downward collision on the Y axis).
- A thin integration wrapper that reads one entity's transform/velocity from a 129 `EntityManager`,
  runs the physics step, and writes the result back via `setTransform`/`setVelocity`.
- Deterministic and unit-testable against fixture `ShapeWorld`s, independent of `Game`/`Player`.

## Non-goals
- **No player migration.** `PlayerPhysics` is untouched; this change is explicitly scoped to
  non-player entities per `CHANGE_SEQUENCE.md`'s title.
- **No per-entity-type bounding box stored on the 017 `EntityRegistry`.** Bounding-box dimensions
  (`width`/`height`/`depth`) are supplied by the caller per physics step, not persisted on
  `EntityTypeDefinition`, keeping 130 purely additive (one new file, zero edits elsewhere). A later
  change may attach per-type dimensions to the registry if a consumer needs it.
- **No sub-stepping / high-speed tunneling mitigation.** `PlayerPhysics` sub-steps to guard against a
  fast-moving player tunneling through thin geometry; typical non-player entity speeds in this
  program's current scope do not warrant it, and projectile-specific handling is 142's scope
  (`142-projectile-core`). A single-step resolve per tick is sufficient here.
- **No AI, pathing, spawning, or per-mob behavior.** Those begin at 134+ (navigation) and 136+ (AI).
- **No liquid/swimming physics (reduced gravity in water/lava).** `PlayerPhysics` has this; 130's
  non-player step uses one uniform gravity/terminal-velocity pair. A future change may add fluid
  interaction for non-player entities if a consumer needs it.
- **No wiring into the `Game` tick loop.** Nothing yet spawns non-player entities into `EntityManager`
  during gameplay (that begins with mob spawning, 137/138); 130 delivers the physics primitive only.

## Preconditions
- Change 129 (`entity-core`) is VERIFIED.
- Change 057 (`shape-aware-player-collision`, i.e. `CollisionResolver`/`VoxelShape`) is VERIFIED and
  unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/world/CollisionResolver.ts` (`CollisionResolver`, `ShapeWorld`, `CollisionBox`,
  `MovementResult`) — the shape-aware move/collide primitive this change wraps.
- `src/world/Entity.ts` / `src/simulation/EntityManager.ts` (129) — `EntityTransform`,
  `EntityVelocity`, `EntityManager.get`/`setTransform`/`setVelocity`.

## Proposed change
1. `src/simulation/EntityPhysics.ts` (NEW):
   - `EntityPhysicsBox { width: number; height: number; depth: number }` (all positive).
   - `EntityPhysicsOptions { gravity?: number; terminalVelocity?: number }` with documented defaults.
   - `computeEntityPhysicsStep(world, resolver, transform, velocity, box, dt, opts?)` → pure function
     returning `{ transform, velocity, onGround }`. Converts the entity's center/feet transform to a
     `CollisionBox`, applies gravity, calls `resolver.move`, converts the result back, zeroes
     collided-axis velocity, and reports `onGround` (a collided downward Y move).
   - `tickEntityPhysics(manager, id, world, resolver, box, dt, opts?)` → reads the entity via
     `manager.get(id)`, no-ops (`false`) for a missing/`REMOVED` entity or a non-positive `dt`, else
     runs `computeEntityPhysicsStep` and writes the result back via `setTransform`/`setVelocity`,
     returning whether it ran (and, on success, `onGround`).
2. No existing file is edited.

## Compatibility and migration
- Purely additive: one new file, zero edits to existing modules. No schema/save-format change, no
  registry change, no migration.

## Risks
- **Position/box convention mismatch with `PlayerPhysics`.** Mitigation: this change reuses the same
  convention as `PlayerPhysics` (transform `x`/`z` are the horizontal center, `y` is the feet/bottom),
  documented explicitly in design.md so a future consumer is not surprised.
- **Scope creep into AI/spawning/persistence.** Mitigation: the non-goals list is explicit; tasks
  implement only the pure step + the thin manager-integration wrapper.
- **Tunneling at high velocity.** Mitigation: documented non-goal (see above); `CollisionResolver`
  itself already resolves a swept path within one call, so even a single step does not pass through
  a face without clamping — only extremely large per-tick displacement is unguarded, which is out of
  scope for current entity speeds.

## Rollback strategy
One new file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `computeEntityPhysicsStep` implemented: gravity integration, terminal-velocity clamp, collision
  resolution via 057 `CollisionResolver`, collided-axis velocity zeroing, `onGround` reporting.
- `tickEntityPhysics` implemented: safe no-op on a missing/removed entity or non-positive `dt`;
  otherwise runs the step and writes back through `EntityManager`.
- Unit tests cover: free-fall gravity/terminal-velocity, landing on a solid floor (`onGround`,
  velocity.vy zeroed), horizontal collision against a wall (velocity.vx/vz zeroed, no `onGround`),
  ceiling collision, an empty world (unobstructed motion), a non-positive `dt` no-op, and a missing/
  removed entity no-op via `tickEntityPhysics`.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, since nothing consumes the
  new module yet).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
