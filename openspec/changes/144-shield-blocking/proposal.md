# Proposal: 144-shield-blocking

## Problem
Nothing computes whether a raised shield blocks an incoming hit, how much shield durability that
costs, or the post-hit "shield disabled" cooldown (vanilla: a sufficiently strong/axe hit disables
the shield for a few seconds). 116's `ArmorProtection` reduces damage by worn armor; nothing reduces
it by an actively-raised, directional shield.

## Goals
- `bearingYawDegrees(fromX, fromZ, toX, toZ)`: this module's own self-consistent yaw convention
  (`0°` along `+Z`, increasing toward `+X`) for the direction between two horizontal positions —
  documented explicitly rather than assuming any subsystem's yaw convention (mirroring 143's
  direction-vector approach to the same cross-subsystem inconsistency).
- `isWithinBlockingArc(defenderFacingYawDegrees, attackerX, attackerZ, defenderX, defenderZ,
  arcDegrees?)`: whether an attacker falls within the defender's forward blocking arc (default 90°,
  vanilla-like).
- `computeShieldDurabilityDamage(incomingDamage)`: shield durability lost per block (vanilla-like:
  at least 1, scaling with blocked damage).
- `resolveShieldBlock(...)`: the composed outcome — blocked or not (raised, not disabled, attacker
  within arc), the damage remaining after blocking, the durability cost, and whether this hit should
  trigger the shield-disable cooldown (e.g. an axe hit).
- `ShieldCooldownTracker`: per-entity-id shield-disable window tracking (`disable`/`isDisabled`/
  `clear`), mirroring 141's `InvulnerabilityTracker` convention exactly.

## Non-goals
- **No `Inventory`/`Equipment`/durability application.** `resolveShieldBlock` returns a durability
  cost number; applying it to the shield `ItemStack` via 115's `DurabilityRules.applyDamage` is the
  caller's job.
- **No damage-type-specific exceptions** (vanilla blocks less of some damage types, e.g. explosions
  partially bypass). 144 models one uniform block-reduction fraction as a documented baseline
  simplification.
- **No `SurvivalSystem`/`ArmorProtection` integration.** This module computes a post-block damage
  number; folding it into the existing armor/enchantment damage pipeline is a future wiring step.
- **No `Game`/input wiring.** Nothing yet reads a held-right-click state to determine "is the shield
  raised"; `resolveShieldBlock` takes `isRaised` as a plain boolean the caller determines.

## Preconditions
- Change 143 (`bow-and-arrow`) is VERIFIED.
- Change 113 (`equipment-slots`) and change 115 (`item-durability-repair`, source of
  `DurabilityRules.applyDamage`) are VERIFIED and unchanged.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond TypeScript/JS built-ins — this is a self-contained, dependency-free module (pure math
  plus one small tracker class, mirroring 141's `InvulnerabilityTracker` shape). It does not import
  115's `DurabilityRules` directly; it only returns a number for the caller to apply through it.

## Proposed change
1. `src/simulation/ShieldBlocking.ts` (NEW):
   - Constants: `SHIELD_BLOCK_ARC_DEGREES = 90`, `SHIELD_DISABLE_TICKS = 100`,
     `SHIELD_BLOCK_DAMAGE_REDUCTION = 1.0`.
   - `bearingYawDegrees`, `angleBetweenYawDegrees`, `isWithinBlockingArc`.
   - `computeShieldDurabilityDamage`.
   - `ShieldBlockResult`, `resolveShieldBlock`.
   - `ShieldCooldownTracker` (`disable`/`isDisabled`/`clear`).
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Yaw-convention confusion for a caller mixing this module's convention with `Player`'s or 129's.**
  Mitigation: `bearingYawDegrees`'s convention is explicitly documented, and `isWithinBlockingArc`'s
  `defenderFacingYawDegrees` parameter is documented as requiring the *same* convention — a caller
  converts once at its own boundary, consistent with 143's precedent.
- **A single uniform block-reduction fraction feeling too simple for full vanilla parity.**
  Mitigation: documented explicitly (see Non-goals); the fraction is a named constant, not a magic
  number, and can be refined later without an API break.
- **`ShieldCooldownTracker` growing unbounded.** Mitigation: `clear(entityId)` releases an entry a
  caller no longer needs (e.g. on entity removal), mirroring 141's tracker.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- All listed functions/classes implemented per design.md/spec.md.
- Unit tests cover: bearing-angle computation at the four cardinal directions; the blocking-arc
  boundary (just inside/outside the arc); durability-damage monotonicity/minimum; `resolveShieldBlock`
  composition (not raised, disabled, out-of-arc, and a successful block, including the axe-disable
  flag); `ShieldCooldownTracker`'s window gating and `clear`.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
