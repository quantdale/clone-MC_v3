# Spec: ender-dragon-boss

## Contract
This capability adds the Ender Dragon boss as vanilla-keyed data over 153's `BossFramework`, plus
the dragon-specific lifecycle: end-crystal summoning (1/4/7/10 as the dragon weakens), per-tick
crystal healing, the bite attack, and the defeat → 182 return-gateway composition.

## Definitions
- **Definition**: `minecraft:ender_dragon`, maxHealth 200, phases at 1/0.5/0.2, purple bar.
- **Crystals**: `summonEndCrystals(f)`: 1 at f ≥ 0.8, 4 at ≥ 0.5, 7 at ≥ 0.2, 10 below (non-finite
  clamps to 10).
- **Bite**: 3 damage when distance < 4 (exclusive).

## Invariants
- The framework owns the fight state machine; this module owns the dragon data and the crystal/
  bite/gateway rules.
- `endCrystalHealAmount(live)` = 1 while live > 0, else 0.
- `dragonReturnGatewayOpen(state)` = `endReturnGatewayAllowed(dragonDefeated(state))` — true
  exactly on defeat.

## Requirements

### Requirement: the definition is vanilla-keyed data
`ENDER_DRAGON_DEFINITION` MUST have key `ender_dragon`, maxHealth 200, phases at 1/0.5/0.2, and
purple bar; 153's default registry MUST already carry a builtin dragon.

#### Scenario: definition fields and registry presence
- **GIVEN** `ENDER_DRAGON_DEFINITION` and `createDefaultBossRegistry()`
- **THEN** the fields match; `getByKey('ender_dragon')` is defined with maxHealth 200

### Requirement: the fight lifecycle follows the framework
Starting a fight MUST yield `SPAWNING` at phase 0; damage to 50% MUST move to phase 1; damage to
20% to phase 2; damage to 0 MUST defeat (no revival on further damage).

#### Scenario: lifecycle
- **GIVEN** `startBossFight(ENDER_DRAGON_DEFINITION)`
- **THEN** 100 damage → phase 1; 60 more → phase 2; 40 more → `DEFEATED`, health 0; further damage
  stays defeated

### Requirement: healing back restores the earlier phase
`healBoss` with enough health MUST move the fight back above a threshold.

#### Scenario: heal-back
- **GIVEN** a fight at health 30 (phase 2)
- **THEN** healing 60 (to 90) restores phase 1

### Requirement: crystals summon as the dragon weakens
`summonEndCrystals` MUST return 1/4/7/10 at the 80%/50%/20%/below fractions, and
`endCrystalHealAmount` MUST be 1 per tick while any crystal lives, else 0.

#### Scenario: summoning progression and healing
- **GIVEN** fractions 1, 0.9, 0.8, 0.5, 0.2, 0, NaN
- **THEN** the counts are 1, 1, 1, 4, 7, 10, 10; `endCrystalHealAmount(1)` is 1 and
  `endCrystalHealAmount(0)` is 0

### Requirement: the bite is range-limited
`dragonDamageTowardsPlayer(distance)` MUST return 3 when distance < 4 and 0 otherwise.

#### Scenario: bite range
- **GIVEN** distances 0, 3.9, 4, 10
- **THEN** the damages are 3, 3, 0, 0

### Requirement: the return gateway opens on defeat
`dragonDefeated` MUST be true exactly at `DEFEATED`; `dragonReturnGatewayOpen` MUST compose it with
182's rule.

#### Scenario: victory
- **GIVEN** a fresh fight and a fully-damaged fight
- **THEN** the gateway is false before and true exactly after defeat

## Error and failure behavior
- No throwing paths beyond the framework's own total functions.

## Performance and resource bounds
- All functions O(1).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- All inputs are caller-supplied values; no new untrusted-input surface.

## Observability
- `dragonDefeated`/`dragonReturnGatewayOpen` are explicit booleans.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 definition + registry | `tests/unit/EnderDragon.test.ts` › definition |
| REQ-2 lifecycle | › fight lifecycle |
| REQ-3 heal-back | › heal-back |
| REQ-4 crystals | › end crystals |
| REQ-5 bite | › attack |
| REQ-6 gateway | › victory/return gateway |
