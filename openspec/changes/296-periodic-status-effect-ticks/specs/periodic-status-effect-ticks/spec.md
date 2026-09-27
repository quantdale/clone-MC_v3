# Spec: periodic-status-effect-ticks

## Contract

The player's poison, regeneration and wither effects apply vanilla periodic
damage/healing once per unpaused fixed tick according to
`remainingTicks % max(1, base >> amplifier) == 0`, before the duration count
-down, through the existing damage/heal/death paths.

## Definitions

- **remainingTicks**: `round(remainingSeconds · 20)`.
- **Interval**: `max(1, base >> amp)`; base poison 25, regeneration 50,
  wither 40.
- **Magic damage**: damage reason `magic`, a `BYPASS_ARMOR` damage type.

## Invariants

- Runs only in the unpaused fixed tick (or explicit test seam); deterministic.
- Poison never takes the player below 1 HP; regeneration never above max.
- Creative/spectator players take no periodic damage.
- Exactly one wither-effect damage path.

## Requirements

### Requirement: Vanilla schedule

The system SHALL apply an effect on a tick iff its remaining ticks are > 0 and
divisible by its interval, evaluated before the tick's count-down.

#### Scenario: Poison I cadence

- **GIVEN** poison amplifier 0 with 900 remaining ticks
- **WHEN** 100 fixed ticks run on a 20-HP survival player without other damage
- **THEN** exactly 4 poison hits apply (remaining 900, 875, 850, 825)

#### Scenario: Amplifier shortens the interval

- **THEN** intervals are poison 25/12/6/3/1, regeneration 50/25/12/6/3 and
  wither 40/20/10/5/2 for amplifiers 0–4

### Requirement: Poison floor

Poison SHALL deal 1 magic damage only while health > 1.

#### Scenario: Poison stops at half a heart

- **GIVEN** a survival player splashed with poison long enough to deal 30 HP
- **WHEN** the effect runs out
- **THEN** health is exactly 1 and the player never died

### Requirement: Regeneration

Regeneration SHALL heal 1 per interval while health < max health.

#### Scenario: Regeneration caps at max

- **GIVEN** 18 HP and regeneration II for 10 s
- **THEN** health rises to 20 and stays 20

### Requirement: Wither kills

Wither SHALL deal 1 wither damage per interval and MAY kill.

#### Scenario: Wither death screen

- **GIVEN** a survival player at 3 HP with wither
- **WHEN** enough fixed ticks run
- **THEN** the player dies once, the death screen opens with cause "Wither",
  the respawn restores 20 HP and clears every effect

### Requirement: Mode and armor rules

Periodic damage SHALL route through `hurtPlayer`; poison/wither bypass armor.

#### Scenario: Creative is immune

- **GIVEN** a creative player with poison and wither
- **THEN** no health is lost; durations still count down

#### Scenario: Armor ignored

- **GIVEN** a survival player in full armor with poison
- **THEN** each hit deals exactly 1 HP

### Requirement: Pause and persistence

The pass SHALL NOT run while paused and SHALL continue after a reload.

#### Scenario: Paused game

- **GIVEN** a paused game (no pointer lock) with poison
- **WHEN** real time passes
- **THEN** health and remaining duration are unchanged

#### Scenario: Reload continuity

- **GIVEN** a serialized poison effect with 30 s left, restored into a new manager
- **THEN** the next hits land on the same remaining ticks as without reload

## Error and failure behavior

Non-finite health/amplifier/duration → no action; unknown kinds → no action.

## Performance and resource bounds

O(3) per fixed tick; the E2E seam is capped at 20 000 ticks per call.

## Compatibility and migration

No schema change; `magic` damage now bypasses armor (295 harming parity).

## Security and integrity

Seams are test-only and validate inputs (registered keys, finite values).

## Observability

Applied actions are returned; HUD/toasts show damage/heal as before.

## Verification mapping

| Requirement | Unit | E2E |
|---|---|---|
| Vanilla schedule | PeriodicStatusEffects.test.ts | periodic-status-effects (poison) |
| Poison floor | PeriodicStatusEffects.test.ts, LivePeriodicStatusEffects.test.ts | poison splash stops at 1 HP |
| Regeneration | both | regeneration heals |
| Wither kills | LivePeriodicStatusEffects.test.ts | wither → death screen |
| Mode and armor | LivePeriodicStatusEffects.test.ts | — |
| Pause and persistence | LivePeriodicStatusEffects.test.ts | paused game unchanged |
