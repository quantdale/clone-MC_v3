# Spec: bad-omen-raid-escalation-and-death-parity

## Contract

When the player's Bad Omen triggers inside a village that already has an
ACTIVE raid, the Game MUST escalate that raid in place (raise its omen level
up to the cap, extend its wave total per the existing wave table), MUST
consume the omen, MUST dismiss live patrols, and MUST save the raid and the
consumed omen in one durable flush. Every player death MUST clear Bad Omen and
persist the cleared state durably. It does not own concurrent raids, omen
items or the wave composition table.

## Definitions

- **Wave table**: `raidWavesForOmen(l) = min(7, 3 + max(0, clamp(l) − 1))`.
- **Raid in village**: an ACTIVE raid whose center is within 96 blocks
  (3D, strict) of the triggering village center.
- **Consume omen**: set Bad Omen level 0 and remaining seconds 0.

## Invariants

- I1. Escalation never changes status, center, `waveIndex`,
  `raidersRemaining` or `ticks`.
- I2. Escalated level = `clamp(raid + player)` ∈ [0, 5].
- I3. `totalWaves` is never reduced by escalation.
- I4. Applied escalation always consumes the omen (also at the cap);
  non-applied keeps it.
- I5. Death always leaves omen level 0 and remaining 0, durably.
- I6. START_RAID behaviour without an ACTIVE raid in the village is unchanged.
- I7. 258 stays BLOCKED.

## Requirements

### Requirement: Escalation math

`escalateRaid(state, playerLevel)` MUST, for an ACTIVE raid and player level
≥ 1, return `applied: true` with `badOmenLevel = clamp(state.badOmenLevel +
clamp(playerLevel))` and `totalWaves = max(state.totalWaves,
raidWavesForOmen(newLevel))`, all other fields unchanged; for a non-ACTIVE
raid or player level < 1 it MUST return the same state with `applied: false`.

#### Scenario: Level and waves rise

- **GIVEN** an ACTIVE raid at level 1 (3 waves) and player omen 2
- **THEN** the raid is level 3 with 5 waves, same `waveIndex`,
  `raidersRemaining`, `ticks`

#### Scenario: Cap

- **GIVEN** an ACTIVE raid at level 5 (7 waves) and player omen 3
- **THEN** `applied` is true, level stays 5, waves stay 7

#### Scenario: Terminal raid

- **GIVEN** a VICTORY raid
- **THEN** `applied` is false and the state is the same object

### Requirement: Action resolution

`resolveVillageOmenAction(omen, village, raid)` MUST return the 285 `NONE`
decision when the 285 trigger is `NONE`; `ESCALATE_RAID` (with player level,
raid level/waves before and after) when the trigger is `START_RAID` and the
raid is in the village; otherwise the 285 `START_RAID` decision.

#### Scenario: Active raid in the village

- **GIVEN** omen 2, a village containing the player at (8,64,8) and an ACTIVE
  raid centered at (10,64,8)
- **THEN** the action is `ESCALATE_RAID`

#### Scenario: Far or finished raid

- **GIVEN** the raid is 96+ blocks away, or VICTORY/DEFEAT
- **THEN** the action is `START_RAID`

### Requirement: Live escalation

On `ESCALATE_RAID`, `Game.evaluateBadOmenVillageTrigger()` MUST replace
`raidState` with the escalated state (no wave respawn, no controller clear),
dismiss any live patrol, consume the omen, refresh the raid bar and save the
raid then the player state durably. When escalation is not applied the omen
MUST be kept.

#### Scenario: Escalate during an active raid

- **GIVEN** a raid started by omen 1 in a fixture village with a live patrol
- **WHEN** the player gains omen 2 and the trigger runs
- **THEN** the same raid continues at level 3 with 5 waves and the same wave
  entities, the patrol is gone, omen is 0 and the bar shows "Bad Omen 3"
- **AND** after pagehide + reload the raid is level 3 / 5 waves and omen is 0

#### Scenario: HOTV after an escalated victory

- **WHEN** the escalated level-3 raid is won
- **THEN** HOTV is granted with amplifier 2

### Requirement: Death clears Bad Omen

Every death MUST set omen level 0 and remaining 0 in `respawnPlayer()` before
the existing durable player save.

#### Scenario: Death then reload

- **GIVEN** omen 3 with remaining time
- **WHEN** the player dies and the page reloads
- **THEN** omen level and remaining seconds are 0 before and after reload

## Error and failure behavior

Non-applied escalation keeps the omen; village query failure yields
`NO_VILLAGE`; non-finite raid center is never "in village".

## Performance and resource bounds

O(1) per fixed tick.

## Compatibility and migration

No schema change; escalated raids are valid `schemaVersion: 1` records.

## Security and integrity

No new input surface; all levels clamped through 285 helpers; omen consumed
atomically with the raid save so reloads cannot farm raids or levels.

## Observability

`ESCALATE_RAID` action payload; escalation toast; raid bar omen badge.

## Verification mapping

| Requirement | Unit | E2E |
|---|---|---|
| Escalation math | RaidEscalation.test.ts | bad-omen-raid-escalation (level/waves) |
| Action resolution | RaidEscalation.test.ts, LiveBadOmen.test.ts | bad-omen-raid-escalation (decision kind) |
| Live escalation | LiveRaidEscalation.test.ts (composition + source guards) | bad-omen-raid-escalation (patrol, bar, reload, HOTV) |
| Death clears Bad Omen | LiveRaidEscalation.test.ts (source guard + snapshot) | bad-omen-raid-escalation (death + reload) |
