# Proposal: 143-bow-and-arrow

## Problem
142 gave a generic projectile motion/collision step, but nothing charges a shot, converts a charge
into a fired arrow's velocity/damage, gates firing on ammo, or lets a landed arrow be picked back up.
143 is the bow-specific layer on top of 142's projectile core.

## Goals
- `bowPullProgress(ticksCharged)`: the vanilla charge-curve formula (`f=(t/20 clamped [0,1])`,
  `(f²+2f)/3`), so a quick tap yields a weak shot and a full second's draw yields full power.
- `computeArrowSpeed(pullProgress, baseSpeed?)` / `computeFireVelocity(dirX, dirY, dirZ,
  pullProgress, baseSpeed?)`: a fired arrow's initial velocity, given a normalized aim direction
  (not yaw/pitch — sidesteps this codebase's inconsistent yaw-unit conventions between `Player`
  (radians) and 129 `EntityTransform` (degrees, per 139's `LookGoal`); a caller normalizes whatever
  direction it has).
- `computeArrowDamage(speed, baseDamage?)`: damage from the arrow's speed at impact (vanilla-like
  `ceil(speed * baseDamage)`).
- `canFireBow(arrowCount, infiniteAmmo?)`: the ammo gate — an explicit, named, testable rule instead
  of inlining an inventory-count check at every call site.
- `LandedArrowTracker`: tracks arrows that have embedded (142's `hitBlock` event), gated by a pickup
  delay before becoming collectible by proximity — mirroring 112's `ItemEntityManager` pickup-delay/
  radius/`collectPlayerDrops` convention exactly, for a landed arrow instead of a dropped item.

## Non-goals
- **No `Inventory`/ammo-storage wiring.** `canFireBow` takes a plain `arrowCount` number; consuming
  one arrow on fire and crediting one back on pickup is the caller's job through the existing
  `Inventory` API (008/009).
- **No arrow item-entity or `EntityManager` representation.** `LandedArrowTracker` is a standalone
  positional tracker (mirroring `ItemEntityManager`'s own independence from 129's general
  `EntityManager`, per 129-133's precedent); a fired, in-flight arrow is a plain 142 `ProjectileState`
  the caller ticks itself.
- **No `Game`/rendering/input wiring.** Nothing yet reads mouse-hold duration or renders a drawn bow;
  a future change wires this to `PlayerInteraction`/`Game`.
- **No critical/sneak-shot bonuses, no fire-arrow, no multi-shot enchantment effects.** Vanilla-like
  baseline only, matching 143's scope in `CHANGE_SEQUENCE.md`.

## Preconditions
- Change 142 (`projectile-core`) is VERIFIED.
- Change 112 (`item-pickup-and-despawn`, source of the pickup-delay/radius convention this change
  mirrors) is VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond TypeScript/JS built-ins for the pure formulas; `LandedArrowTracker` is a standalone,
  dependency-free class (no import from 142/129/112 — it mirrors their conventions without coupling
  to their types).

## Proposed change
1. `src/simulation/BowAndArrow.ts` (NEW):
   - Constants: `DEFAULT_ARROW_SPEED`, `DEFAULT_ARROW_BASE_DAMAGE`, `DEFAULT_PICKUP_DELAY_TICKS`,
     `DEFAULT_PICKUP_RADIUS`.
   - `bowPullProgress`, `computeArrowSpeed`, `computeFireVelocity`, `computeArrowDamage`,
     `canFireBow`.
   - `LandedArrow`, `LandedArrowTracker` (`addLandedArrow`/`getArrow`/`removeArrow`/`getAll`/`size`/
     `clear`/`collectNearby`).
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Charge-curve formula drift from vanilla feel.** Mitigation: the exact vanilla formula is used and
  tested at named reference points (0, half-draw, full-draw).
- **Direction-vector API being less convenient than yaw/pitch for a future caller.** Mitigation:
  documented explicitly as the deliberate choice to avoid this codebase's existing yaw-unit
  inconsistency between subsystems; a future caller normalizes its own yaw/pitch to a direction
  vector at the call site.
- **`LandedArrowTracker` growing unbounded if arrows are never collected.** Mitigation: `removeArrow`/
  `clear` let a caller despawn old arrows (e.g. on a very long age, mirroring 112's despawn timer, at
  the caller's own discretion) without needing that policy baked into this change.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- All listed functions/classes implemented per design.md/spec.md.
- Unit tests cover: the charge-curve formula at 0/half/full draw and its `[0,1]` clamp;
  speed/velocity computation (including a zero-length direction fallback); the damage formula;
  `canFireBow`'s ammo gate (including `infiniteAmmo`); `LandedArrowTracker`'s add/get/remove/clear and
  `collectNearby`'s delay-gate + radius-gate + removal-on-collection behavior.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
