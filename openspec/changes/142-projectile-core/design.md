# Design: 142-projectile-core

## Context/current state
- 057 `CollisionResolver.move(world, box, dx, dy, dz)` resolves axis-separated swept collision
  against per-cell `VoxelShape`s, returning the clamped final position and per-axis collision flags —
  already reused by 130's `EntityPhysics` for normal entities.
- Nothing models projectile-specific motion (gravity + drag, no ground/water interaction) or
  ownership/immunity.

## Target state
- `src/simulation/ProjectileCore.ts` provides one pure per-tick step function, `stepProjectile`,
  built only on 057's `CollisionResolver`.

## Invariants
- Physics order is fixed and documented: `vy' = vy - gravity` → integrate position by
  `(vx, vy', vz)` → (if neither collision fired) apply drag to `(vx, vy', vz)` for the next tick's
  stored velocity. This exact order is part of the contract, not an implementation detail.
- Entity-hit detection is checked before block collision each tick; if both would report a hit the
  same tick, the entity hit wins and no block collision is reported.
- The firer (`state.ownerId`) is excluded from entity-hit candidates while
  `ageTicks <= ownerImmunityTicks` (checked using the *post-increment* age for this tick), and
  included (hittable) once that window has elapsed.
- Once `ageTicks` (post-increment) exceeds `maxAgeTicks`, `stepProjectile` returns `expired: true`
  with the state's position/velocity unchanged from the input (only `ageTicks` advances) — no
  gravity/drag/collision computation runs for an expired tick.
- On any hit (block or entity), the returned state's velocity is exactly `{vx:0, vy:0, vz:0}`.

## API and data model
```ts
export interface ProjectileState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ownerId: number | null;
  ageTicks: number;
}

export interface ProjectileOptions {
  gravity?: number;            // default 0.05 (blocks/tick^2, vanilla arrow gravity)
  drag?: number;                // default 0.99 (velocity retained factor per tick)
  maxAgeTicks?: number;         // default 1200 (60s at 20 TPS)
  ownerImmunityTicks?: number;  // default 5
  hitboxSize?: number;          // default 0.25 (cube edge length used for block collision)
}

export interface ProjectileTarget {
  id: number;
  x: number; y: number; z: number;
  radius: number;
}

export interface ProjectileStepResult {
  state: ProjectileState;
  hitBlock: { x: number; y: number; z: number } | null;
  hitEntityId: number | null;
  expired: boolean;
}

export function stepProjectile(
  world: ShapeWorld,           // 057
  resolver: CollisionResolver, // 057
  state: ProjectileState,
  targets: readonly ProjectileTarget[],
  options?: ProjectileOptions,
): ProjectileStepResult;
```

## Control/data flow
1. `ageTicks = state.ageTicks + 1`. If `ageTicks > maxAgeTicks`: return
   `{ state: { ...state, ageTicks }, hitBlock: null, hitEntityId: null, expired: true }`.
2. `vy = state.vy - gravity`; `dx = state.vx`, `dy = vy`, `dz = state.vz`;
   `newX/newY/newZ = state.x/y/z + dx/dy/dz` (unclamped intended destination).
3. Entity check: for each `target` in `targets` (in array order), skip when
   `target.id === state.ownerId && ageTicks <= ownerImmunityTicks`; else compute the squared
   distance from `(newX, newY, newZ)` to `(target.x, target.y, target.z)`; the first target whose
   squared distance is `<= target.radius²` is the hit (`hitEntityId`), stopping the scan.
4. If an entity was hit: return
   `{ state: { x: newX, y: newY, z: newZ, vx: 0, vy: 0, vz: 0, ownerId, ageTicks }, hitBlock: null,
   hitEntityId, expired: false }`.
5. Else, block check: build a `CollisionBox` of edge `hitboxSize` centered on `(state.x, state.y,
   state.z)`; call `resolver.move(world, box, dx, dy, dz)`. If any axis collided: return
   `{ state: { x: result.x + half, y: result.y + half, z: result.z + half, vx: 0, vy: 0, vz: 0,
   ownerId, ageTicks }, hitBlock: { x: floor(...), y: floor(...), z: floor(...) }, hitEntityId: null,
   expired: false }`.
6. Else (clear flight): return
   `{ state: { x: newX, y: newY, z: newZ, vx: dx*drag, vy: vy*drag, vz: dz*drag, ownerId, ageTicks },
   hitBlock: null, hitEntityId: null, expired: false }`.

## Detailed behavior
- The projectile is treated as a point for entity-hit purposes (distance to the destination point)
  and as a small cube for block collision (reusing 057's existing box-based resolver) — two
  different, independently appropriate simplifications for the two collision kinds, both documented.
- Owner immunity is keyed on the *post-increment* `ageTicks` so a projectile's very first step
  (`ageTicks` becomes `1`) is still within the default 5-tick window and cannot immediately hit its
  own firer at the moment of release.
- `hitBlock`'s coordinates are `floor(x/y/z)` of the resolved (embedded) rest position — the cell the
  projectile now occupies once clamped to the colliding surface. Because `CollisionResolver.move`
  clamps to the face boundary rather than reporting which specific neighboring cell was solid, this
  is the *resting* cell (typically the empty cell immediately against the solid surface, e.g. the air
  cell a projectile embeds in just above a floor), not necessarily the solid cell itself. A caller
  wanting the exact solid neighbor can inspect the six cells adjacent to `hitBlock` using the same
  `ShapeWorld` it passed in.

## Failure modes
- `stepProjectile` never throws for a well-formed `ShapeWorld`/`CollisionResolver` and finite state;
  `CollisionResolver.move`'s own `RangeError` for a non-positive box dimension would propagate, but
  `hitboxSize` is a caller-controlled positive default, not user input.

## Compatibility/migration
- One new, additive file; no edits to `CollisionResolver`, `VoxelShape`, `EntityManager`, or any
  other module. No schema/save-format change; no migration.

## Performance/resource constraints
- One `CollisionResolver.move` call per tick (skipped when an entity hit already fired), plus O(m)
  distance checks against `targets` (bounded by however many candidates the caller supplies — a
  caller is expected to pre-filter to nearby entities, mirroring 137/138's "caller supplies the
  relevant candidates" convention).

## Testing seams
- `stepProjectile` depends only on a hand-built `ShapeWorld` fixture (057's existing test style), a
  real `CollisionResolver` instance, and plain `ProjectileTarget` object literals — no `Game`/
  `EntityManager` needed.

## Observability/debugging
- `ProjectileStepResult`'s three outcome fields (`hitBlock`/`hitEntityId`/`expired`) fully explain one
  tick's result without additional instrumentation.

## Affected files/symbols
- `src/simulation/ProjectileCore.ts` (new).
- Tests: `tests/unit/ProjectileCore.test.ts` (new).

## Rejected alternatives
- **Computing damage in this change**: rejected (see proposal Non-goals) — 143 owns the
  weapon-specific damage formula; 142 only reports that a hit occurred.
- **A full swept-segment entity-collision check**: rejected — added complexity with no current
  consumer needing sub-tick precision; a documented simplification, revisitable later without an API
  break (the function signature already accepts arbitrary `targets`).
- **Attaching `ProjectileState` to 129's `EntityInstance`/`EntityManager`**: rejected — keeps 142
  fully standalone and testable without constructing a manager/registry; a future change can wire a
  projectile kind onto `EntityManager` if it needs the shared id/lifecycle machinery.

## Downstream dependencies
- 143 (`bow-and-arrow`) will construct `ProjectileState`s on fire, call `stepProjectile` each tick,
  and apply damage/pickup behavior on `hitEntityId`/`hitBlock`.
