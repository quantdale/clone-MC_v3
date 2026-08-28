# Spec: bow-and-arrow

## Contract
This capability adds the bow-specific layer over 142's projectile core: charge-progress computation,
fire-velocity/damage formulas, an ammo gate, and a standalone landed-arrow pickup tracker mirroring
112's dropped-item pickup convention. No `Inventory`/`EntityManager`/`Game` wiring — see the
proposal's Non-goals.

## Definitions
- **Pull progress**: a `[0, 1]` charge value derived from ticks held via the vanilla curve
  `f = clamp(t/20, 0, 1)`, `progress = (f² + 2f) / 3`.
- **Fire velocity**: the initial `{vx, vy, vz}` for a fired arrow, along a normalized direction
  scaled by the pull-progress-derived speed.
- **Ammo gate**: whether firing is currently allowed, given an arrow count and an infinite-ammo flag.
- **Landed arrow**: an embedded arrow tracked by position, landing tick, and firer id, until
  collected by proximity after a pickup delay.

## Invariants
- `bowPullProgress` never leaves `[0, 1]`; `bowPullProgress(0) = 0` and `bowPullProgress(20) = 1`
  exactly.
- `computeArrowSpeed`/`computeFireVelocity` clamp `pullProgress` into `[0, 1]` before use.
- `computeFireVelocity`'s result has magnitude equal to `computeArrowSpeed(...)` for any non-zero
  direction, and is exactly `{0,0,0}` for a zero-length direction.
- `computeArrowDamage` is never negative and non-decreasing in `speed`.
- `canFireBow` is `true` whenever `infiniteAmmo` is `true`; otherwise exactly `arrowCount > 0`.
- `LandedArrowTracker.collectNearby` collects (and removes) exactly the arrows satisfying both the
  delay gate and the radius gate; every other arrow remains tracked.

## Requirements

### Requirement: bowPullProgress matches the vanilla charge curve at its reference points
`bowPullProgress(ticksCharged)` MUST equal `0` at `ticksCharged = 0`, `1` at `ticksCharged = 20`, and
a value strictly between `0` and `1` at a partial draw, and MUST stay within `[0, 1]` for any
`ticksCharged` (including values beyond `20`).

#### Scenario: reference points at no draw, full draw, and beyond
- **GIVEN** `ticksCharged` values `0`, `20`, and `40`
- **WHEN** `bowPullProgress` is evaluated on each
- **THEN** the results are `0`, `1`, and `1` respectively (clamped, not exceeding `1`)

### Requirement: computeFireVelocity scales a normalized direction by the charge-derived speed
`computeFireVelocity(dirX, dirY, dirZ, pullProgress, baseSpeed)` MUST return a vector whose magnitude
equals `computeArrowSpeed(pullProgress, baseSpeed)` and whose direction matches the normalized
`(dirX, dirY, dirZ)`, for any non-zero direction. For a zero-length direction it MUST return
`{vx:0, vy:0, vz:0}`.

#### Scenario: a full-draw shot along +x has the expected magnitude and direction
- **GIVEN** `dir = (1, 0, 0)`, `pullProgress = 1`, default `baseSpeed`
- **WHEN** `computeFireVelocity` is called
- **THEN** the result is `{ vx: DEFAULT_ARROW_SPEED, vy: 0, vz: 0 }`

#### Scenario: a zero-length direction returns zero velocity
- **GIVEN** `dir = (0, 0, 0)`
- **WHEN** `computeFireVelocity` is called with any `pullProgress`
- **THEN** the result is `{ vx: 0, vy: 0, vz: 0 }`

### Requirement: computeArrowDamage is non-negative and non-decreasing in speed
`computeArrowDamage(speed, baseDamage)` MUST return a value `>= 0` for any `speed >= 0`, and a
strictly greater (or equal) result for a strictly greater `speed` at the same `baseDamage`.

#### Scenario: damage increases with speed
- **GIVEN** two speeds, one greater than the other
- **WHEN** `computeArrowDamage` is evaluated on each with the same `baseDamage`
- **THEN** the greater speed's result is `>=` the lesser speed's result

### Requirement: canFireBow gates on ammo unless infinite
`canFireBow(arrowCount, infiniteAmmo)` MUST return `true` whenever `infiniteAmmo` is `true`
regardless of `arrowCount` (including `0` or negative), and otherwise MUST return `true` exactly when
`arrowCount > 0`.

#### Scenario: ammo gate without infinite ammo
- **GIVEN** `arrowCount` values `0`, `1`, and `-1`, with `infiniteAmmo` false/omitted
- **WHEN** `canFireBow` is evaluated on each
- **THEN** the results are `false`, `true`, and `false` respectively

#### Scenario: infinite ammo always allows firing
- **GIVEN** `arrowCount = 0` and `infiniteAmmo = true`
- **WHEN** `canFireBow` is called
- **THEN** it returns `true`

### Requirement: LandedArrowTracker.collectNearby gates on both delay and radius, removing collected arrows
`collectNearby(playerX, playerY, playerZ, currentTick, pickupRadius, pickupDelayTicks)` MUST collect
(and remove from the tracker) exactly the arrows whose age (`currentTick - landedTick`) is
`>= pickupDelayTicks` AND whose distance to `(playerX, playerY, playerZ)` is `<= pickupRadius`,
leaving every other arrow untouched and still retrievable via `getArrow`/`getAll`.

#### Scenario: an arrow within delay and radius is collected and removed
- **GIVEN** an arrow landed at tick `100`, queried at tick `110` (delay `10`) from a position `1`
  block away (radius `1.5`)
- **WHEN** `collectNearby` is called
- **THEN** the arrow's id is returned, and a subsequent `getArrow(id)` returns `undefined`

#### Scenario: an arrow still within the pickup delay is not collected
- **GIVEN** the same arrow queried at tick `105` (delay `10` not yet elapsed) from within radius
- **WHEN** `collectNearby` is called
- **THEN** no id is returned, and `getArrow(id)` still resolves the arrow

#### Scenario: an arrow outside the pickup radius is not collected
- **GIVEN** the same arrow past its delay but queried from `100` blocks away
- **WHEN** `collectNearby` is called
- **THEN** no id is returned, and `getArrow(id)` still resolves the arrow

## Error and failure behavior
- No function in this module throws for finite numeric inputs; `collectNearby` on an empty tracker
  returns `[]` without error.

## Performance and resource bounds
- All pure formulas are O(1). `collectNearby` is O(n) over currently-tracked arrows.

## Compatibility and migration
- One new, additive file (`src/simulation/BowAndArrow.ts`); no edits to any existing module. No
  schema/save-format change; no migration.

## Security and integrity
- All computed values are derived from finite arithmetic on finite inputs, so no non-finite value can
  result from a well-formed call.

## Observability
- `LandedArrowTracker.getAll()`/`size` expose exactly which arrows remain tracked.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 bowPullProgress reference points | `tests/unit/BowAndArrow.test.ts` bowPullProgress cases |
| REQ-2 computeFireVelocity scales/directs correctly | `tests/unit/BowAndArrow.test.ts` computeFireVelocity cases |
| REQ-3 computeArrowDamage non-negative/monotonic | `tests/unit/BowAndArrow.test.ts` computeArrowDamage case |
| REQ-4 canFireBow ammo gate | `tests/unit/BowAndArrow.test.ts` canFireBow cases |
| REQ-5 LandedArrowTracker delay+radius gating | `tests/unit/BowAndArrow.test.ts` LandedArrowTracker cases |
