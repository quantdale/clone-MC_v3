# Spec: player-status-effect-persistence

## Contract

The Game MUST persist the player's active status effects (type, amplifier,
remaining duration) and Bad Omen (level, remaining duration) inside the
existing per-world player-state record, MUST restore them on load resuming the
stored remaining durations, MUST treat records without the payload as "no
effects", and MUST write the payload through the 289 durable save path on
pagehide/dispose and on effect/omen events. This capability does not own the
HOTV grant rule (290), the omen→raid rule (285), patrols (291), raid
persistence (283) or any HUD.

## Definitions

- **Payload**: `{ version: 1, effects: StatusEffectInstanceData[], badOmen:
  { level, remainingSeconds } }` stored as `PlayerStateRecord.effects`.
- **Remaining duration**: seconds left on an effect or on Bad Omen; ticks only
  during unpaused fixed ticks.
- **Durable save**: `Game.savePlayerStateDurable()` (enqueue + `flush`).
- **Restore**: the effects step of `applyInitialPlayerState`.

## Invariants

- I1. Round-trip exactness for type, amplifier, remaining duration, omen.
- I2. Restore never lengthens a duration, never exceeds registry bounds, omen
  cap 5 or omen duration 6000 s.
- I3. Restore never grants HOTV or Bad Omen.
- I4. Absent payload ⇒ no effects, omen 0.
- I5. Parsing never throws.
- I6. Omen level > 0 ⇔ omen remaining > 0.
- I7. No new store/namespace/schema version.
- I8. Consumed omen is durable together with the raid it started.
- I9. Change 258 stays BLOCKED.

## Requirements

### Requirement: Payload serialization

`buildPlayerSnapshot` MUST include the payload with every active effect
(`typeId`, `duration` seconds remaining, `amplifier`) and the normalized omen
state. Entries with non-finite or non-positive duration MUST be omitted; at
most 64 entries are written.

#### Scenario: HOTV and omen serialize

- **GIVEN** HOTV amplifier 1 with 2300.5 s remaining and Bad Omen level 3 with
  4000 s remaining
- **WHEN** the payload is serialized
- **THEN** it equals `{ version: 1, effects: [{ typeId:
  'minecraft:effect/hero_of_the_village', duration: 2300.5, amplifier: 1 }],
  badOmen: { level: 3, remainingSeconds: 4000 } }`

#### Scenario: No effects

- **GIVEN** no active effects and omen 0
- **THEN** the payload is `{ version: 1, effects: [], badOmen: { level: 0,
  remainingSeconds: 0 } }`

### Requirement: Resume on restore

Restore MUST re-apply each valid entry with exactly the stored remaining
duration and amplifier, and set omen level and remaining seconds from the
payload. It MUST NOT refresh any duration to its default/full value.

#### Scenario: Partially elapsed HOTV resumes

- **GIVEN** a saved payload with HOTV amplifier 1 and 1234.25 s remaining
- **WHEN** the world loads
- **THEN** HOTV amplifier is 1 and remaining is 1234.25 s (not 2400)
- **AND** ticking 34.25 s leaves 1200 s

#### Scenario: Reload after VICTORY does not double-grant

- **GIVEN** a VICTORY raid (persisted, 283) and HOTV amplifier 1 aged by 100 s
- **WHEN** pagehide + reload
- **THEN** HOTV amplifier is still 1 and remaining ≤ the pre-reload value
  (strictly below the 2400 s full grant)
- **AND** the raid is VICTORY and no second grant occurs

#### Scenario: Bad Omen resumes

- **GIVEN** omen level 3 aged by 1000 s (5000 s remaining)
- **WHEN** pagehide + reload
- **THEN** omen level is 3 and remaining is in (0, 5000]

### Requirement: Caps and clamps

Restore MUST clamp duration to the type's `maxDuration`, amplifier to
`maxAmplifier` (floored), omen level to 0..5 (floored) and omen remaining to
[0, 6000]; an omen with level 0 or remaining 0 MUST restore as `{0, 0}`.

#### Scenario: Over-cap payload

- **GIVEN** HOTV duration 999999 amplifier 9, omen level 9 remaining 999999
- **WHEN** parsed
- **THEN** HOTV is `96000 s` amplifier 4 and omen is `{5, 6000}`

### Requirement: Backward compatibility and fail-closed parsing

A record without `effects` MUST load with no effects and omen 0. A malformed
payload (non-object, wrong version, non-array `effects`) MUST load the same
way without throwing. Malformed or unregistered entries MUST be dropped
individually while valid entries are restored.

#### Scenario: Pre-292 record

- **GIVEN** a player-state record with no `effects` key
- **WHEN** validated, converted and restored
- **THEN** validation succeeds, the record has no `effects` key, and restore
  reports `absent` with no effects and omen 0

#### Scenario: Mixed-validity entries

- **GIVEN** entries `[HOTV valid, 'minecraft:effect/nope', duration NaN,
  duration 0, speed valid]`
- **WHEN** parsed
- **THEN** HOTV and speed are restored and `dropped` is 3

#### Scenario: Wrong version

- **GIVEN** `{ version: 2, effects: [...] }`
- **THEN** status `invalid`, no effects, omen 0, no throw

### Requirement: Bad Omen duration

Bad Omen MUST expire 6000 s of unpaused play after its last valid grant. A
valid grant MUST refresh remaining to 6000 s (also at cap); invalid amounts
MUST be no-ops; clear/consume MUST set `{0, 0}`; expiry MUST clear the level.

#### Scenario: Expiry

- **GIVEN** omen level 2 with 1 s remaining
- **WHEN** 1 s of fixed ticks elapses
- **THEN** level 0 and remaining 0

#### Scenario: Refresh on stack

- **GIVEN** omen level 1 with 10 s remaining
- **WHEN** `grantBadOmen(1)`
- **THEN** level 2 and remaining 6000

### Requirement: Durable save points

The payload MUST be written through `savePlayerStateDurable()` on pagehide,
dispose (with the live omen, before any reset), HOTV grant (together with
`saveRaid()`), effective omen grant/clear, omen consumption by a raid start
(together with `saveRaid()`), omen expiry, respawn and HOTV debug removal; and
through the existing 5 s autosave otherwise.

#### Scenario: Pagehide persists without dispose

- **GIVEN** HOTV and omen active
- **WHEN** only `pagehide` fires and the facade flushes, then the page reloads
- **THEN** both are restored

### Requirement: Restored omen triggers raids like live omen

A restored omen MUST be evaluated by the unchanged 285 trigger every unpaused
fixed tick. When the player is inside a detected village the raid MUST start
on the first such tick; the 291 raid-start rule MUST dismiss any live patrol
without granting omen; the omen MUST be consumed and written durably with the
raid record.

#### Scenario: Restored omen inside a village

- **GIVEN** a reload restored omen level 1 and a live patrol was spawned
- **WHEN** a village query containing the player is installed and one
  unpaused fixed tick runs
- **THEN** a raid is ACTIVE with omen level 1, the patrol has 0 members, omen
  is 0
- **AND** after another pagehide + reload omen is still 0 and the raid is
  restored ACTIVE

#### Scenario: Restored omen outside any village

- **GIVEN** a restored omen level 2 and no village
- **THEN** omen stays 2 across ticks (subject to expiry) and no raid starts

## Error and failure behavior

Parsing never throws; unexpected `deserialize` failure falls back to no
effects; persistence absent / recovery-required skips saving and restore per
existing gates.

## Performance and resource bounds

≤ 64 entries; O(1) omen tick; event-driven durable saves only.

## Compatibility and migration

Additive optional record field; no schema bump; old saves → no effects;
rollback-safe (old validator ignores the field).

## Security and integrity

Untrusted stored payload is validated and clamped; unknown types dropped;
omen cannot be raised above cap or duration above 6000 s through storage.

## Observability

`getStatusEffectRestoreReport()`, `getBadOmenRemainingSeconds()`,
`playerEffects.serialize()`.

## Verification mapping

| Requirement | Unit | E2E |
|---|---|---|
| Payload serialization | PlayerEffectsPersistence.test.ts | status-effect-persistence.spec.ts |
| Resume on restore | PlayerEffectsPersistence / LiveStatusEffectPersistence | status-effect-persistence + hero-of-the-village reload |
| Caps and clamps | PlayerEffectsPersistence.test.ts | — |
| Backward compatibility | PlayerEffectsPersistence + PlayerStateRecord tests | fresh world boot (no field) |
| Bad Omen duration | PlayerEffectsPersistence + LiveStatusEffectPersistence | status-effect-persistence (debugTick) |
| Durable save points | LiveStatusEffectPersistence (Game source guards) | status-effect-persistence (pagehide) + pillager-patrol reload |
| Restored omen triggers raids | LiveStatusEffectPersistence | status-effect-persistence restored-omen test |
