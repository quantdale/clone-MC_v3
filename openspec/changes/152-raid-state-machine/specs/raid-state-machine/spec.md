# Spec: raid-state-machine

## Contract
This capability adds a bounded, deterministic, immutable settlement-raid lifecycle: trigger,
escalating wave composition, per-wave raider tracking, win/loss resolution, and a strict
serialize/deserialize codec for outcome persistence. No raider entity types, no mob spawning, no
village-boundary detection, no bad-omen trigger, no IndexedDB store, no `Game` wiring, no raid HUD
— see the proposal's Non-goals.

## Definitions
- **Raid**: a `RaidState` value — status, center, wave progress, remaining raiders, bad-omen level,
  elapsed ticks.
- **Terminal**: a raid whose `status` is `VICTORY` or `DEFEAT`.
- **Wave roster**: the `RaidWaveEntry[]` returned by `waveComposition` for a given wave index and
  bad-omen level.
- **Cleared wave**: an `ACTIVE` raid whose `raidersRemaining` is `0`.

## Invariants
- Every transition function returns a new state and never mutates its input.
- `status` progresses `INACTIVE → ACTIVE → (VICTORY | DEFEAT)` only; a terminal raid is never
  changed again by any transition function.
- `waveIndex` never exceeds `totalWaves`; `raidersRemaining` is never negative.
- `waveComposition` is a pure function of `(waveIndex, badOmenLevel)` with no RNG or shared state.
- `totalWaves === min(RAID_MAX_WAVES, RAID_BASE_WAVES + max(0, badOmenLevel - 1))`.
- A wave roster never contains a zero-count entry.

## Requirements

### Requirement: startRaid produces an ACTIVE raid with a bad-omen-derived wave count
`startRaid` MUST return an `ACTIVE` raid at the supplied center with `waveIndex: 0`,
`raidersRemaining: 0`, `ticks: 0`, and `totalWaves` equal to
`min(RAID_MAX_WAVES, RAID_BASE_WAVES + max(0, badOmenLevel - 1))`.

#### Scenario: a level-1 raid uses the base wave count
- **GIVEN** `badOmenLevel` of `1`
- **WHEN** `startRaid(0, 64, 0, 1)` is called
- **THEN** the raid is `ACTIVE` with `totalWaves === RAID_BASE_WAVES`, `waveIndex === 0`, and
  `raidersRemaining === 0`

#### Scenario: a high bad-omen level is clamped at the maximum
- **GIVEN** a `badOmenLevel` far above what `RAID_MAX_WAVES` allows
- **WHEN** `startRaid` is called with it
- **THEN** `totalWaves === RAID_MAX_WAVES`

### Requirement: waveComposition is deterministic and escalates
`waveComposition(waveIndex, badOmenLevel)` MUST return the same roster for the same inputs, MUST
omit zero-count entries, and MUST produce a larger total raider count for a later wave index.

#### Scenario: identical inputs yield identical rosters
- **GIVEN** the same `(waveIndex, badOmenLevel)` pair
- **WHEN** `waveComposition` is called twice
- **THEN** both calls return equal rosters

#### Scenario: later waves are larger
- **GIVEN** wave indices `0` and `2` at the same bad-omen level
- **WHEN** `waveComposition` is called for each
- **THEN** the wave-2 roster's summed count exceeds the wave-0 roster's

#### Scenario: no zero-count entries are returned
- **GIVEN** wave index `0` (where some raider types have a computed count of zero)
- **WHEN** `waveComposition` is called
- **THEN** every returned entry has `count > 0`

### Requirement: spawnWave advances the wave and seeds the raider count
`spawnWave` MUST increment `waveIndex` by one, set `raidersRemaining` to the summed count of that
wave's roster, and return the roster. It MUST return the input state unchanged with an empty roster
when the raid is terminal or every wave has already spawned.

#### Scenario: the first wave spawns
- **GIVEN** a freshly started raid
- **WHEN** `spawnWave` is called
- **THEN** `waveIndex` is `1`, `raidersRemaining` equals the returned roster's summed count, and
  that count is positive

#### Scenario: spawning past the final wave is refused
- **GIVEN** a raid whose `waveIndex` already equals `totalWaves`
- **WHEN** `spawnWave` is called
- **THEN** the returned state is unchanged and the roster is empty

### Requirement: recordRaiderDeath decrements without going negative
`recordRaiderDeath` MUST decrement `raidersRemaining` by one, never below `0`, and MUST return the
input state unchanged for a non-`ACTIVE` raid.

#### Scenario: a death decrements the counter
- **GIVEN** an `ACTIVE` raid with `raidersRemaining` of `3`
- **WHEN** `recordRaiderDeath` is called
- **THEN** `raidersRemaining` is `2`

#### Scenario: the counter floors at zero
- **GIVEN** an `ACTIVE` raid with `raidersRemaining` of `0`
- **WHEN** `recordRaiderDeath` is called
- **THEN** `raidersRemaining` is still `0`

#### Scenario: a terminal raid is unaffected
- **GIVEN** a `VICTORY` raid
- **WHEN** `recordRaiderDeath` is called
- **THEN** the returned state is unchanged

### Requirement: tickRaid drives the full lifecycle
`tickRaid` MUST advance `ticks`; spawn the next wave when the current one is cleared and waves
remain; transition to `VICTORY` when the final wave is cleared; transition to `DEFEAT` when `ticks`
exceeds `RAID_TIMEOUT_TICKS`; and return a terminal raid unchanged.

#### Scenario: a cleared wave spawns the next one
- **GIVEN** an `ACTIVE` raid with `raidersRemaining === 0` and waves remaining
- **WHEN** `tickRaid` is called
- **THEN** `waveIndex` increases by one, `spawned` is a non-empty roster, and `raidersRemaining` is
  positive

#### Scenario: an in-progress wave is not interrupted
- **GIVEN** an `ACTIVE` raid with `raidersRemaining > 0`
- **WHEN** `tickRaid` is called
- **THEN** only `ticks` advances; `waveIndex` and `raidersRemaining` are unchanged and `spawned` is
  `null`

#### Scenario: clearing the final wave wins the raid
- **GIVEN** an `ACTIVE` raid whose `waveIndex === totalWaves` and `raidersRemaining === 0`
- **WHEN** `tickRaid` is called
- **THEN** `status` is `VICTORY` and `spawned` is `null`

#### Scenario: exceeding the timeout loses the raid
- **GIVEN** an `ACTIVE` raid whose `ticks` is at `RAID_TIMEOUT_TICKS`
- **WHEN** `tickRaid` is called
- **THEN** `status` is `DEFEAT`

#### Scenario: a terminal raid ignores further ticks
- **GIVEN** a `VICTORY` raid
- **WHEN** `tickRaid` is called
- **THEN** the returned state is unchanged and `spawned` is `null`

### Requirement: serializeRaid/deserializeRaid round-trip and reject malformed input
`serializeRaid` MUST emit a `schemaVersion: 1` envelope carrying every state field, and
`deserializeRaid` MUST reconstruct an equal state from it. `deserializeRaid` MUST throw for a
malformed payload (bad version, unknown status, non-finite/negative numbers, or
`waveIndex > totalWaves`) without producing a partial state.

#### Scenario: a valid state round-trips
- **GIVEN** any `RaidState`
- **WHEN** it is serialized then deserialized
- **THEN** the result equals the original state

#### Scenario: an unsupported schema version is rejected
- **GIVEN** a payload with `schemaVersion: 2`
- **WHEN** `deserializeRaid` is called
- **THEN** it throws

#### Scenario: an inconsistent wave index is rejected
- **GIVEN** a payload whose `waveIndex` exceeds its `totalWaves`
- **WHEN** `deserializeRaid` is called
- **THEN** it throws

## Error and failure behavior
- `deserializeRaid` throws for a malformed/unsupported payload.
- No other function throws for well-formed inputs; every "cannot advance" case returns the input
  state unchanged.

## Performance and resource bounds
- Every function is O(1) over a fixed four-entry roster template; no unbounded loops.

## Compatibility and migration
- One new, additive file; no existing module edited; no schema/save-format change (no store is
  wired).

## Security and integrity
- All inputs are caller-supplied plain numbers/objects; `deserializeRaid` fully validates untrusted
  payloads before returning.

## Observability
- `RaidState` is a plain, fully-inspectable data object; `serializeRaid` doubles as a debug dump.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 startRaid wave-count derivation | `tests/unit/RaidStateMachine.test.ts` startRaid cases |
| REQ-2 waveComposition determinism/escalation | waveComposition cases |
| REQ-3 spawnWave advance + refusal past final | spawnWave cases |
| REQ-4 recordRaiderDeath decrement/floor/terminal | recordRaiderDeath cases |
| REQ-5 tickRaid full lifecycle | tickRaid next-wave/in-progress/victory/defeat/terminal cases |
| REQ-6 serialize/deserialize round-trip + rejection | codec cases |
