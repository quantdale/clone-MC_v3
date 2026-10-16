# Proposal: 141-melee-combat-cooldown

## Problem
140 lets a hostile mob chase into range, but nothing computes what happens when an attack lands:
Java 1.9+-style attack-cooldown damage scaling, knockback, and invulnerability frames (a short
window after taking damage during which further hits from the same source are ignored) don't exist
anywhere in the codebase.

## Goals
- `attackCooldownProgress(ticksSinceLastAttack, attacksPerSecond)`: a `[0, 1]` charge value (vanilla
  formula), `0` immediately after attacking, `1` once fully recovered.
- `cooldownDamageMultiplier(progress)`: `0.2 + progress² × 0.8` (vanilla formula) — a fresh swing
  deals 20% damage, a fully charged one deals 100%.
- `computeAttackDamage(baseDamage, ticksSinceLastAttack, attacksPerSecond)`: the composed scaled
  damage.
- `computeKnockback(fromX, fromZ, toX, toZ, strength, existingVelocity)`: a horizontal-direction
  impulse away from the attacker plus a fixed vertical pop, added to the target's *halved* existing
  velocity (matching vanilla's "existing motion is halved before the knockback impulse" rule).
- `InvulnerabilityTracker`: per-target-id last-hit-tick tracking; `canDamage`/`registerHit`/`clear`.
- `resolveMeleeAttack(...)`: composes all of the above into one outcome — `{ applied, damage,
  knockback }` — gated by the invulnerability tracker, registering the hit only when it applies.

## Non-goals
- **No critical hits.** Vanilla crits require a falling-and-not-sprinting state this program doesn't
  generically expose yet; a future change may add them without changing this change's contract.
- **No `SurvivalSystem`/`EntityManager` wiring.** `resolveMeleeAttack` returns the computed damage/
  knockback for a caller to apply through 116's `ArmorProtection`/`SurvivalSystem.damage` and 129's
  `EntityManager.setVelocity`; it does not call either itself.
- **No weapon-specific damage/attribute lookup.** `baseDamage`/`attacksPerSecond` are caller-supplied
  numbers (from whatever attribute/item source the caller has); this change does not read the 012
  `AttributeRegistry` or 017 `EntityTypeDefinition` itself.
- **No `Game`/mob-AI wiring.** Nothing yet calls this from `HostileTargetAI`'s `ChaseGoal` hand-off;
  that is a future attack-goal change.

## Preconditions
- Change 140 (`hostile-target-ai`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond TypeScript/JS built-ins — this is a self-contained, dependency-free module (pure math
  plus one small tracker class).

## Proposed change
1. `src/simulation/MeleeCombat.ts` (NEW):
   - `DEFAULT_INVULNERABILITY_TICKS = 10` (0.5s at 20 TPS).
   - `attackCooldownProgress`, `cooldownDamageMultiplier`, `computeAttackDamage`.
   - `KnockbackVector`, `computeKnockback`.
   - `InvulnerabilityTracker` (`canDamage`/`registerHit`/`clear`).
   - `MeleeAttackResult`, `resolveMeleeAttack`.
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Formula drift from vanilla feel.** Mitigation: both the cooldown-progress and damage-multiplier
  formulas are the documented vanilla ones; tests assert the exact boundary values (0 progress → 0.2
  multiplier, 1 progress → 1.0 multiplier).
- **Knockback direction undefined when attacker and target share a position.** Mitigation:
  `computeKnockback` falls back to the halved existing velocity with no directional impulse when the
  horizontal distance is negligible, documented and tested explicitly.
- **Invulnerability tracker growing unbounded across a long session.** Mitigation: `clear(entityId)`
  lets a caller (e.g. on entity removal/forget, 132's `forgetChunk`) release a tracked id; `clear()`
  with no argument resets everything.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- All listed functions/classes implemented per design.md/spec.md.
- Unit tests cover: cooldown-progress boundary/mid-range values; the damage-multiplier formula at
  progress 0/0.5/1; knockback direction/magnitude/velocity-halving, including the degenerate
  same-position case; `InvulnerabilityTracker`'s gate/hit/clear behavior; `resolveMeleeAttack`'s
  full composition, including a blocked (invulnerable) case that registers no hit and applies no
  damage/knockback.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
