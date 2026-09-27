# Spec: throwable-splash-potion-entities

## Contract

Splash potions (Potion items whose `potion_contents` kind is `SPLASH`) MUST
be throwable by the player's use action and by raid witches as ProjectileCore
entities with a gravity arc. A potion MUST shatter on its first block or
entity contact and MUST apply its effects to living targets within the
vanilla splash radius with distance-scaled amounts, instant harming/healing
applying immediately. Raid witches MUST choose their potion with the vanilla
rule table and MUST NOT use a fixed-damage fallback. In-flight potions MUST
render as small bottles without touching shared scene setup. It does not own
lingering clouds, drinking, brewing of splash potions or per-mob effects.

## Definitions

- **Splash radius**: 4 blocks (`POTION_SPLASH_RADIUS`); vertical band ±2
  around the target's body.
- **Intensity** `i`: 1 for the directly hit target, else `1 − dist/4` for
  `distSq < 16` (distance from impact point to target feet).
- **Instant effects**: `instant_damage` (alias `harming`) and
  `instant_health` (alias `healing`) effect ids.
- **Witch choice**: the vanilla ordered rule table in design.md.

## Invariants

- I1. Flight uses `stepProjectile` with gravity 0.05 and drag 0.99.
- I2. Each potion shatters at most once; expiry never splashes.
- I3. `0 ≤ i ≤ 1`; targets outside the radius or band are unaffected.
- I4. Harming `floor(i·(6 << amp) + 0.5)`; healing `floor(i·(4 << amp) + 0.5)`.
- I5. Duration effects apply only above 20 ticks after scaling.
- I6. Consume one iff `depletesItems(mode)`; spectators never throw; refused
  spawns never consume.
- I7. Witch choice and roll are deterministic.
- I8. No fixed witch damage path remains.
- I9. Witch potions never hit or affect raiders.
- I10. 258 stays BLOCKED.

## Requirements

### Requirement: Throw and flight

The player throw MUST use direction `(−sin yaw·cos p, sin(p + 20°),
−cos yaw·cos p)` normalized at speed 0.5 from eye − 0.1; the witch throw MUST
aim `(dx, dy + 0.2·d3, dz)` at speed 0.75 from its eye − 0.1. Every tick MUST
step through ProjectileCore with gravity 0.05 and drag 0.99.

#### Scenario: Gravity arc

- **GIVEN** a potion thrown level at speed 0.5
- **WHEN** it is stepped in open air
- **THEN** `vy` decreases by 0.05 per tick before drag and the path curves
  downward

#### Scenario: Owner immunity

- **GIVEN** a potion spawned inside the thrower's hit sphere
- **WHEN** it is stepped for its first 5 ticks
- **THEN** it does not shatter on the thrower

### Requirement: Shatter and splash falloff

A potion MUST shatter on block contact or on entering a candidate's hit
sphere, and MUST compute each in-scope target's intensity per the
definition.

#### Scenario: Direct hit

- **GIVEN** a potion entering a raider's hit sphere
- **THEN** that raider's intensity is 1

#### Scenario: Falloff

- **GIVEN** an impact 2 blocks from the player's feet
- **THEN** intensity is 0.5; at 4 blocks or more it is 0 (unaffected)

### Requirement: Effect application

Instant harming MUST damage (player via `hurtPlayer`, raid/patrol raiders via
their damage seams), instant healing MUST heal the player, and duration
effects MUST be added to the player's effect manager with scaled duration and
original amplifier when above 20 ticks; unknown ids MUST be skipped.

#### Scenario: Self splash of poison

- **GIVEN** a survival player holding a 45 s poison splash potion
- **WHEN** they throw it straight down
- **THEN** after it shatters they have poison with `1 < duration ≤ 45`

#### Scenario: Harming kills a raider

- **GIVEN** a raid raider with 4 health left at the impact point
- **WHEN** a player harming potion shatters on it
- **THEN** the raider dies through the exactly-once raid death path

### Requirement: Player use and consume rules

Right-click with a SPLASH potion selected MUST throw it when there is no
block target or the target is not a container / bone-meal use; survival and
adventure MUST consume one potion; creative MUST NOT; spectators MUST NOT
throw; NORMAL and LINGERING potions MUST NOT be thrown.

#### Scenario: Creative keeps the potion

- **GIVEN** creative mode and one splash potion
- **WHEN** the player throws it
- **THEN** a potion is in flight and the stack count is still 1

### Requirement: Witch potions replace the fallback

A RANGED witch within range with an expired cooldown MUST throw a splash
potion chosen by the vanilla table through the Game sink; with no sink it
MUST NOT attack; `WITCH_RANGED_FALLBACK_DAMAGE` MUST NOT exist.

#### Scenario: Close healthy target

- **GIVEN** a witch 3 blocks from a 20-HP player without poison
- **THEN** the witch throws poison and the player receives poison when it
  shatters

#### Scenario: Far target

- **GIVEN** a witch 10 blocks from a player without slowness
- **THEN** the witch chooses slowness

### Requirement: Rendering

Each live potion MUST have exactly one `splash-potion` group in the scene,
tinted by its first effect; groups MUST be removed when the potion shatters;
shared resources MUST be allocated once and disposed once.

#### Scenario: In-flight potion visible

- **GIVEN** one live potion
- **WHEN** a frame renders
- **THEN** one `splash-potion` group exists at the potion position; after the
  shatter it is gone

## Error and failure behavior

Non-finite throw inputs and cap overflow refuse the spawn (no consume, no
witch cooldown); unregistered effects are skipped; stale candidates are
rebuilt per step.

## Performance and resource bounds

≤ 64 live potions; O(potions × candidates) per fixed tick; renderer resources
fixed after construction.

## Compatibility and migration

No schema change; in-flight potions are transient.

## Security and integrity

No new persisted input; contents validated by the 122 component guard; all
seams test-only.

## Observability

`getSplashPotionState()` (potions, shatters, witch throws, meshes) and
`getPlayerEffect(key)`.

## Verification mapping

| Requirement | Unit | E2E |
|---|---|---|
| Throw and flight | SplashPotion.test.ts | splash-potion (in-flight state) |
| Shatter and splash falloff | SplashPotion.test.ts | splash-potion (shatter record) |
| Effect application | SplashPotion.test.ts, LiveSplashPotion.test.ts | splash-potion (poison on self; witch effect) |
| Player use and consume rules | LiveSplashPotion.test.ts | splash-potion (survival consume, creative keep) |
| Witch potions replace the fallback | RaiderCombatBehavior.test.ts, LiveSplashPotion.test.ts | splash-potion (raid witch) |
| Rendering | SplashPotionRenderer.test.ts | splash-potion (mesh present) |
