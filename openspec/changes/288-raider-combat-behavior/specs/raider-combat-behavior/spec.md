# Spec: raider-combat-behavior

## Contract

Live raid-wave entities spawned by Change 284 MUST fight using existing
verified AI/combat/projectile/health systems so a raid can reach `VICTORY` or
`DEFEAT` in normal play. This capability owns combat behavior only; spawn,
persistence, village detection, and HUD contracts remain 282–287.

## Definitions

- **Tracked raider**: an entity id currently returned by
  `RaidWaveController.getRaidWaveEntityIds()` for the active generation.
- **Attackable player target**: the live player position when the mode allows
  attack (`isAttackable`) and health > 0; otherwise absent.
- **Home**: the active `RaidState` center `(centerX, centerY, centerZ)`.
- **Witch fallback**: ranged projectile damage using
  `WITCH_RANGED_FALLBACK_DAMAGE` because no throwable potion entity stepper
  exists in-tree.

## Invariants

- I1. Only tracked raiders receive combat ticks.
- I2. Raider death notifications that affect `raidersRemaining` MUST go through
  `RaidWaveController.consumeDeath` exactly once per `(generation, entityId)`.
- I3. Combat MUST NOT run on the fixed-tick path while the Game is paused,
  loading, or disposed.
- I4. Combat state (AI bundles, projectiles, health map) MUST NOT be written to
  any persistence/archive namespace.
- I5. `RaidStateMachine` remains the authority for wave counters; combat never
  arithmetic-edits `raidersRemaining` except via `recordRaiderDeath` /
  `forceRaidDefeat`.

## Requirements

### Requirement: Per-type combat roles

The system MUST assign combat roles as follows:

| typeKey | role | damage source |
|---|---|---|
| `pillager` | RANGED | arrow damage formula over projectile impact speed |
| `vindicator` | MELEE | registry `attackDamage` (6) via `resolveMeleeAttack` |
| `ravager` | MELEE | registry `attackDamage` (12) via `resolveMeleeAttack` |
| `witch` | RANGED | `WITCH_RANGED_FALLBACK_DAMAGE` (5) via projectile hit |

Unknown keys MUST be treated as MELEE with damage `max(0, registryDamage ?? 3)`
and MUST NOT throw on the tick path.

#### Scenario: Role mapping is pinned

- **GIVEN** the four registered raider type keys
- **WHEN** `raiderCombatRole` / `raiderCombatProfile` are evaluated
- **THEN** pillager and witch are RANGED and vindicator and ravager are MELEE
- **AND** witch profile baseDamage equals `WITCH_RANGED_FALLBACK_DAMAGE`

### Requirement: Target player or home to raid center

Each tick, every tracked active raider MUST:

1. Acquire the attackable player target within detection/forget radii when
   present; and
2. Otherwise steer toward the raid center (home) while farther than the home
   stop distance.

#### Scenario: Player in range is chased

- **GIVEN** an ACTIVE raid with a tracked vindicator and an attackable player
  within detection radius
- **WHEN** combat ticks
- **THEN** the raider's horizontal motion reduces distance toward the player
  (or holds within melee range)

#### Scenario: No target homes to center

- **GIVEN** a tracked raider and `getPlayerTarget()` returning null
- **WHEN** combat ticks
- **THEN** the raider steers toward the raid center
- **AND** MUST NOT call `onPlayerDamaged`

### Requirement: Melee attacks damage the player through hurtPlayer

Melee raiders within melee range MUST resolve attacks through
`resolveMeleeAttack` and, when applied, invoke `onPlayerDamaged` with the
resolved damage and source coordinates so Game can route through `hurtPlayer`
(279 shield choke).

#### Scenario: Vindicator melee applies damage

- **GIVEN** a vindicator within melee range of an attackable player and a fresh
  invulnerability window
- **WHEN** combat ticks
- **THEN** `onPlayerDamaged` is called with damage > 0 and reason suitable for
  mob/raider attribution
- **AND** a second immediate tick within invulnerability MUST NOT apply again

### Requirement: Ranged attacks use ProjectileCore

Pillager and witch MUST launch projectiles aimed at the player using
`computeFireVelocity` / `stepProjectile`, subject to per-type cooldown and a
hard live-projectile cap. Hits on the player MUST call `onPlayerDamaged`.

#### Scenario: Pillager projectile hits player

- **GIVEN** a pillager within ranged max of an attackable player and cooldown
  ready
- **WHEN** enough combat ticks elapse for fire + flight
- **THEN** the player receives damage > 0 through `onPlayerDamaged`
- **AND** live projectiles never exceed the documented cap

#### Scenario: Witch uses fallback damage

- **GIVEN** a witch projectile that hits the player
- **WHEN** damage is computed
- **THEN** the amount equals `WITCH_RANGED_FALLBACK_DAMAGE`
- **AND** no potion entity type is spawned

### Requirement: Raider deaths advance the raid exactly once

Damaging a raider to HP ≤ 0 MUST remove the entity and invoke the Game death
choke that calls `consumeDeath` + `recordRaiderDeath` exactly once for that id
in the current generation. Duplicate damage after death MUST be a no-op.

#### Scenario: Killing all wave raiders can reach VICTORY

- **GIVEN** an ACTIVE raid with raidersRemaining > 0
- **WHEN** each tracked raider is killed through the combat damage path
- **THEN** `raidersRemaining` decrements once per id
- **AND** after all waves are cleared, `tickRaid` yields `VICTORY`

#### Scenario: Double death is exactly-once

- **GIVEN** a raider already consumed for death
- **WHEN** a second death notification arrives for the same id
- **THEN** `recordRaiderDeath` is not applied a second time

### Requirement: Player melee and debug damage seams

Game MUST provide:

1. A live proximity player→raider melee path (wither-style) paced by cooldown
   while break/attack is requested and the player is attackable; and
2. `debugDamageRaidEntity(entityId, amount)` for deterministic tests.

Both MUST use `MobHealthTracker` initialized from registry health.

#### Scenario: Debug damage kills a raider

- **GIVEN** a tracked pillager with full health
- **WHEN** `debugDamageRaidEntity` applies at least registry health
- **THEN** the entity is removed and the death choke returns true once

### Requirement: LOSS paths — timeout and player death

- Timeout MUST continue to yield `DEFEAT` via existing `tickRaid` rules.
- When the player dies (`SurvivalEvent` `'death'`) while `raidState.status ===
  'ACTIVE'`, Game MUST transition the raid to `DEFEAT` (via `forceRaidDefeat`
  or equivalent), clear wave entities + combat state, and sync the HUD.

#### Scenario: Player death defeats an active raid

- **GIVEN** an ACTIVE raid
- **WHEN** the player dies
- **THEN** raid status becomes `DEFEAT`
- **AND** tracked wave entities are cleared

### Requirement: Pause, dispose, and reload safety

- While paused, combat tick MUST be a no-op (no motion, damage, or projectile
  advance driven by that path).
- Dispose / debug clear / terminal / generation replace MUST clear combat
  bundles, projectiles, and health tracking.
- Reload MUST NOT resurrect raiders or combat state (284 non-resurrection).

#### Scenario: Pause freezes combat

- **GIVEN** an ACTIVE raid with raiders and a nearby player
- **WHEN** the Game is paused and time passes
- **THEN** player health attributable to raiders does not change
- **AND** raider positions do not advance via combat steering

### Requirement: Scope limits

The change MUST NOT: add a new AI framework; spawn villagers; grant Hero of
the Village; implement patrols/outposts/captain banners; add a persistence
namespace; mark Change 258 VERIFIED; or claim headed GPU/FPS evidence.

#### Scenario: No new persistence key

- **GIVEN** a raid with active combat
- **WHEN** the world is saved
- **THEN** no new metadata key beyond existing `__raid__` (and prior keys) is
  introduced for combat state

## Error and failure behavior

Non-finite damage, unknown ids, missing entities, and stale generations MUST
be identity no-ops on the tick/damage path and MUST NOT throw across the fixed
tick. Projectile step failures MUST drop the projectile, not abort the raid.

## Performance and resource bounds

Per unpaused fixed tick, combat work MUST be O(trackedRaiders + liveProjectiles)
with `liveProjectiles ≤ RAIDER_PROJECTILE_CAP` (32). No A* pathfinding and no
worker offload are required for 288.

## Compatibility and migration

No registry id renames, archive fields, or save migrations. Existing 284–287
APIs remain valid. Behavioral addition only: raiders act and can be fought.

## Security and integrity

Debug damage seams are test/harness-facing (same class as `debugStartRaid`) and
MUST NOT bypass `consumeDeath` generation checks.

## Observability

Raid HUD continues to reflect `RaidState` only (286). Combat does not invent a
second remaining-count source.

## Verification mapping

| Requirement cluster | Primary tests |
|---|---|
| Roles / profiles / witch fallback | `RaiderCombatBehavior.test.ts` |
| Target/home, melee, ranged, pause, death once | `RaiderCombatBehavior.test.ts` + `LiveRaiderCombat.test.ts` |
| Game wiring, player death DEFEAT, debug damage | `LiveRaiderCombat.test.ts` |
| Browser journey VICTORY / damage / LOSS | `tests/e2e/raider-combat.spec.ts` |
| Baseline gates | typecheck/lint/unit/build/e2e/file-audit/validate-state |
