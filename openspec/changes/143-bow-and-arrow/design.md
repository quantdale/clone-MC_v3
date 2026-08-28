# Design: 143-bow-and-arrow

## Context/current state
- 142 `stepProjectile` moves/collides a `ProjectileState` given an initial velocity; nothing computes
  that initial velocity from a bow draw, nor an arrow's damage from its speed.
- 112 `ItemEntityManager` established the pickup-delay/merge-radius/pickup-radius/
  `collectPlayerDrops` convention for dropped items; no equivalent exists for a landed arrow.
- `Player.yaw` (radians, `-Z`-forward convention per `PlayerController.ts`) and 129
  `EntityTransform.yaw` (degrees, per 139's `LookGoal`) use different units — this change avoids
  choosing between them by accepting a normalized direction vector instead.

## Target state
- `src/simulation/BowAndArrow.ts` provides the charge/fire/damage formulas plus a standalone
  `LandedArrowTracker`, both usable by a future `PlayerInteraction`/`Game` wiring change without this
  change needing to pick a yaw convention or couple to `Inventory`/`EntityManager`.

## Invariants
- `bowPullProgress` is monotonically non-decreasing in `ticksCharged` and stays within `[0, 1]`, with
  `bowPullProgress(0) = 0` and `bowPullProgress(20) = 1` (vanilla's exact reference points).
- `computeArrowSpeed`/`computeFireVelocity` clamp `pullProgress` into `[0, 1]` before scaling, so an
  out-of-range input can never produce a stronger-than-full-draw or negative shot.
- `computeFireVelocity` returns a velocity whose magnitude equals `computeArrowSpeed(...)` for any
  non-zero direction, and `{0,0,0}` for a (degenerate) zero-length direction.
- `computeArrowDamage` is monotonically non-decreasing in `speed` and never negative.
- `canFireBow(arrowCount, infiniteAmmo)` is `true` whenever `infiniteAmmo` is `true`, regardless of
  `arrowCount`, and otherwise exactly `arrowCount > 0`.
- `LandedArrowTracker.collectNearby` only ever collects (and removes) an arrow whose age
  (`currentTick - landedTick`) is `>= pickupDelayTicks` AND whose distance to the query point is
  `<= pickupRadius`; every other arrow is left untouched.

## API and data model
```ts
export const DEFAULT_ARROW_SPEED = 3.0;         // blocks/tick at full draw
export const DEFAULT_ARROW_BASE_DAMAGE = 2;
export const DEFAULT_PICKUP_DELAY_TICKS = 10;   // mirrors 112's PICKUP_DELAY_TICKS
export const DEFAULT_PICKUP_RADIUS = 1.5;       // mirrors 112's PICKUP_RADIUS

export function bowPullProgress(ticksCharged: number): number;
export function computeArrowSpeed(pullProgress: number, baseSpeed?: number): number;
export interface FireVelocity { vx: number; vy: number; vz: number; }
export function computeFireVelocity(
  dirX: number, dirY: number, dirZ: number,
  pullProgress: number, baseSpeed?: number,
): FireVelocity;
export function computeArrowDamage(speed: number, baseDamage?: number): number;
export function canFireBow(arrowCount: number, infiniteAmmo?: boolean): boolean;

export interface LandedArrow {
  readonly id: number;
  readonly x: number; readonly y: number; readonly z: number;
  readonly landedTick: number;
  readonly ownerId: number | null;
}

export class LandedArrowTracker {
  addLandedArrow(x: number, y: number, z: number, landedTick: number, ownerId: number | null): number;
  getArrow(id: number): LandedArrow | undefined;
  removeArrow(id: number): boolean;
  getAll(): LandedArrow[];
  get size(): number;
  clear(): void;
  collectNearby(
    playerX: number, playerY: number, playerZ: number,
    currentTick: number,
    pickupRadius?: number, pickupDelayTicks?: number,
  ): number[]; // ids collected (and removed from the tracker)
}
```

## Control/data flow
1. `bowPullProgress(t)`: `f = clamp(t/20, 0, 1)`; return `(f*f + f*2) / 3`.
2. `computeArrowSpeed(p, base = DEFAULT_ARROW_SPEED)`: `base * clamp(p, 0, 1)`.
3. `computeFireVelocity(dx, dy, dz, p, base)`: `len = hypot(dx,dy,dz)`; if `len < 1e-9` return
   `{vx:0,vy:0,vz:0}`; else `speed = computeArrowSpeed(p, base)`; return
   `{vx: dx/len*speed, vy: dy/len*speed, vz: dz/len*speed}`.
4. `computeArrowDamage(speed, base = DEFAULT_ARROW_BASE_DAMAGE)`: `max(0, ceil(speed * base))`.
5. `canFireBow(count, infinite = false)`: `infinite || count > 0`.
6. `LandedArrowTracker.addLandedArrow(...)`: mint the next id, store, return it (mirrors 111/112's
   id-minting style).
7. `collectNearby(...)`: for each stored arrow (snapshot iteration, safe against mutation during the
   call), skip if `currentTick - landedTick < pickupDelayTicks`; else compute squared distance to
   `(playerX, playerY, playerZ)`; if `<= pickupRadius²`, collect (push id, delete from the map).
   Return the collected ids.

## Detailed behavior
- The charge curve is evaluated exactly at vanilla's own reference points in tests
  (`t=0 → 0`, `t=20 → 1`, plus a mid-draw value), so a formula transcription error (wrong exponent/
  coefficient) is caught the same way 141's cooldown-multiplier test caught it.
- `LandedArrowTracker` intentionally does not depend on 129's `EntityManager` or 112's
  `ItemEntityManager` types — it mirrors their *convention* (delay + radius + collect-returns-ids),
  not their code, keeping this change fully standalone per the established pattern for this whole
  arc.
- `canFireBow`'s `infiniteAmmo` parameter exists so a future creative-mode caller can pass `true`
  without special-casing the call site.

## Failure modes
- None of these functions throw for finite numeric inputs.
- `collectNearby` is a safe no-op (returns `[]`) when no arrow qualifies; it never throws for an
  empty tracker.

## Compatibility/migration
- One new, additive file; no edits to `ProjectileCore`, `ItemEntityManager`, `Inventory`, or any
  other module. No schema/save-format change; no migration.

## Performance/resource constraints
- All pure formulas are O(1). `LandedArrowTracker.collectNearby` is O(n) over currently-tracked
  arrows (matching 112's `ItemEntityManager.collectPlayerDrops`'s own O(n) cost model).

## Testing seams
- Every function/class is pure or trivially self-contained (`LandedArrowTracker`'s own map) — no
  `Game`/`World`/`EntityManager`/`Inventory` dependency needed to construct a test.

## Observability/debugging
- `LandedArrowTracker.getAll()`/`size` expose exactly which arrows are tracked, for inspection or a
  future debug overlay.

## Affected files/symbols
- `src/simulation/BowAndArrow.ts` (new).
- Tests: `tests/unit/BowAndArrow.test.ts` (new).

## Rejected alternatives
- **Accepting yaw/pitch instead of a direction vector**: rejected (see proposal Non-goals) — this
  codebase already has two different yaw unit conventions (`Player`'s radians vs. 129
  `EntityTransform`'s degrees per 139); a direction vector sidesteps picking one, leaving that
  conversion to whichever caller (player-fired or mob-fired) already has its own yaw representation.
- **Coupling `LandedArrowTracker` to 129's `EntityManager` or 112's `ItemEntityManager`**: rejected —
  keeps 143 fully standalone and testable without constructing either, consistent with 142's own
  standalone design; a future wiring change can bridge them if needed.
- **Applying arrow damage directly (calling into `SurvivalSystem`)**: rejected — 143 computes; a
  future wiring change applies, matching the "compute, caller applies" convention used since 137.

## Downstream dependencies
- A future `PlayerInteraction`/`Game` wiring change will read mouse-hold duration into
  `bowPullProgress`, call `computeFireVelocity` with the player's own look direction, construct a 142
  `ProjectileState`, tick it via `stepProjectile`, and on `hitBlock` call
  `LandedArrowTracker.addLandedArrow`; on `hitEntityId`, apply `computeArrowDamage` through whatever
  damage pathway that change wires up.
