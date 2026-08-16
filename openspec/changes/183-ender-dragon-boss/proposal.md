# Proposal: 183-ender-dragon-boss

## Problem
182 wired the End's entry/exit but the boss fight — the reason the return gateway is closed — has no
state. The Ender Dragon is the largest boss: 200 health with phase thresholds at 100%/50%/20%,
end crystals that heal it and are summoned as it weakens (0..10), a bite attack, and the victory
transition that flips 182's `endReturnGatewayAllowed` to open the exit.

## Goals
- `src/simulation/EnderDragon.ts` (NEW):
  - **Vanilla-keyed data over 153's `BossFramework`**: `ENDER_DRAGON_DEFINITION`
    (`minecraft:ender_dragon`, maxHealth 200, phases 100%/50%/20%, purple bar). The framework owns
    SPAWNING→ACTIVE→DEFEATED, phase transitions, damage, and capped healing.
  - **End crystals**: `summonEndCrystals(healthFraction)` — 1 / 4 / 7 / 10 crystals at 80%/50%/20%/
    below (vanilla's 0..10 progression); `endCrystalHealAmount(liveCrystals)` —
    `END_CRYSTAL_HEAL_PER_TICK` per tick while any crystal lives (0 otherwise).
  - **Attack**: `dragonDamageTowardsPlayer(distance)` — `ENDER_DRAGON_BITE_DAMAGE = 3` within the
    exclusive range `ENDER_DRAGON_BITE_RANGE = 4`.
  - **Victory → return gateway**: `dragonDefeated(state)` (`status === 'DEFEATED'`) and
    `dragonReturnGatewayOpen(state)` — the composition with 182: the gateway opens exactly on
    defeat.

## Non-goals
- **No dragon entity/movement/AI** (the framework models the fight state; flight pathing is an
  entity concern for later work), **no crystal blocks/entities in the registry** (215), **no
  dragon-fireball projectile** (a ranged-attack addition), **no `Game`/`World` wiring**.

## Preconditions
- Change 182 (`end-portal-progression`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/BossFramework.ts` (153), `src/simulation/EndPortalProgression.ts` (182).

## Proposed change
1. `src/simulation/EnderDragon.ts` (NEW): the definition and the seven functions/constants above.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Misreading the framework's defaults** (153 already registers a builtin dragon under a different
  id). Mitigation: the registration test asserts the builtin dragon exists rather than identity with
  this module's definition; the module's definition is the vanilla-keyed data for consumption.
- **Phase-boundary arithmetic** (health ≤ 40 is phase 2; ≤ 100 is phase 1). Mitigation: the
  lifecycle tests use exact damage amounts (100→phase 1, 170→phase 2, full→defeat) and the
  heal-back test (30→90 restores phase 1).

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All listed functions implemented per design.md/spec.md.
- Unit tests cover: the definition's vanilla fields; registration presence in 153's registry; the
  fight lifecycle (SPAWNING, phase transitions at 50%/20%, defeat at 0, no-revive); heal-back
  restoring an earlier phase; crystal summoning progression + per-crystal heal; bite damage at
  range; the return-gateway flip exactly on defeat.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
