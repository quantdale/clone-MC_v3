# Design: 183-ender-dragon-boss

## Context/current state
- 153's `BossFramework` owns the full fight state machine (SPAWNING→ACTIVE→DEFEATED, phases,
  damage, capped healing, serialization) and registers a builtin dragon (a different id form) in
  `createDefaultBossRegistry`. 182's `endReturnGatewayAllowed(dragonDefeated)` is the exit gate.
- 183 provides the vanilla-keyed dragon data and the dragon-specific lifecycle rules the framework
  does not model: crystals and the bite.

## Target state
- `src/simulation/EnderDragon.ts` holding `ENDER_DRAGON_DEFINITION` (data), the crystal summon/heal
  functions, the bite, and the defeat→gateway composition.

## Invariants
- `ENDER_DRAGON_DEFINITION`: key `ender_dragon`, maxHealth 200, phases at 1/0.5/0.2, purple bar.
- `summonEndCrystals(f)`: 1 at ≥ 0.8, 4 at ≥ 0.5, 7 at ≥ 0.2, 10 below; non-finite clamps to 0 → 10.
- `endCrystalHealAmount(live)`: 1 while live > 0, else 0.
- `dragonDamageTowardsPlayer(d)`: 3 when d < 4, else 0 (exclusive range).
- `dragonDefeated(state)` = `status === 'DEFEATED'`; `dragonReturnGatewayOpen` composes it with 182.

## API and data model
```ts
// src/simulation/EnderDragon.ts (new)
export const ENDER_DRAGON_MAX_HEALTH = 200;
export const ENDER_DRAGON_PHASE_THRESHOLDS = [1, 0.5, 0.2];
export const ENDER_DRAGON_BITE_DAMAGE = 3;
export const ENDER_DRAGON_BITE_RANGE = 4;
export const MAX_END_CRYSTALS = 10;
export const END_CRYSTAL_HEAL_PER_TICK = 1;
export const DRAGON_CRYSTAL_SUMMON_FRACTIONS = [0.8, 0.5, 0.2];
export const ENDER_DRAGON_DEFINITION: BossDefinition;
export function summonEndCrystals(healthFraction: number): number;
export function endCrystalHealAmount(liveCrystals: number): number;
export function dragonDamageTowardsPlayer(distance: number): number;
export function dragonDefeated(state: BossState): boolean;
export function dragonReturnGatewayOpen(state: BossState): boolean;
```

## Control/data flow
1. A wiring change calls 153's `startBossFight(ENDER_DRAGON_DEFINITION)` on entry; per tick it calls
   `tickBossFight`, feeds player distance into `dragonDamageTowardsPlayer`, and applies
   `endCrystalHealAmount(liveCrystals)` via 153's `healBoss` while any crystal lives.
2. `summonEndCrystals` derives the live-crystal count from the current health fraction.
3. On `DEFEATED`, `dragonReturnGatewayOpen` becomes true — 184 builds the exit portal.

## Detailed behavior
- The framework's phase math is health-fraction based; the tests use exact damage amounts so the
  phase boundaries (≤ 50% and ≤ 20%) are pinned without guessing.
- 153's builtin dragon exists under a different resource id; this module's definition is the
  vanilla-keyed `minecraft:ender_dragon` data for consumption — the registration test asserts the
  builtin's presence, not identity.

## Failure modes
- The framework's `damageBoss`/`healBoss` are total and never revive a defeated boss; this module
  adds no throwing paths.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- All functions O(1) (crystal summon is a constant chain of comparisons).

## Testing seams
- Tests use 153's real `startBossFight`/`damageBoss`/`healBoss` and 182's real gateway function.

## Observability/debugging
- `dragonDefeated`/`dragonReturnGatewayOpen` are explicit booleans; the definition is data.

## Affected files/symbols
- `src/simulation/EnderDragon.ts` (new).
- Tests: `tests/unit/EnderDragon.test.ts` (new). No other files.

## Rejected alternatives
- **Modeling dragon flight/AI here**: rejected — fight STATE is 153's contract; movement is an
  entity concern for later work (documented non-goal).
- **A separate dragon entity registry entry**: rejected — the boss framework is the fight model;
  entity/block registration belongs to content changes (215/218).

## Downstream dependencies
- 184 (`end-exit-progression`) consumes `dragonReturnGatewayOpen` to spawn the exit portal;
  242's survival e2e runs the full entry→fight→exit loop.
