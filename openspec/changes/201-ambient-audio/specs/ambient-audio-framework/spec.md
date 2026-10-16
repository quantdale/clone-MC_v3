# Spec: ambient-audio-framework

## Contract
This capability adds the deterministic ambient audio scheduler: environment cue definitions,
day/night music timing, an immutable scheduler state, and a per-tick advance that produces at most
one cue (environment/weather ambience or music) — headless-safe, with injected randomness.

## Definitions
- **Environment**: one of `cave`, `forest`, `plains`, `ocean`, `nether`, `end`, with a cue event
  id, interval range, and volume.
- **Cue**: `{ kind: 'music' | 'cue', soundEvent, volume }`.
- **Roll**: `min + floor(rng() * (max - min + 1))` — ticks.

## Invariants
- Pure and headless-safe: no audio context, no mutation of inputs, no randomness inside the
  module.
- Exactly one cue per tick at most; a delay of 1 fires on that tick (decrement-then-fire).
- Music takes precedence when both delays hit 0 in the same tick.
- Cue selection: rain -> `rain` (volume 0.5); thunder -> `thunder` (volume 1.0); clear -> the
  environment's cue at its volume.
- A changed environment re-rolls `cueDelay` immediately (before the decrement); `musicDelay` is
  untouched by environment changes.

## Requirements

### Requirement: environment table and music constants
`AMBIENT_ENVIRONMENTS` MUST contain exactly the six environments in order, each with a
`soundEvent`, `intervalMin <= intervalMax` (both positive), and `volume` in [0, 1];
`ambientEnvironment(id)` MUST return the definition for known ids and `undefined` otherwise.
`MUSIC_INTERVAL_MIN` MUST be 12000 and `MUSIC_INTERVAL_MAX` 24000.

#### Scenario: table
- **GIVEN** `AMBIENT_ENVIRONMENTS` and lookups for `cave`, `plains`, `nope`
- **THEN** the table has 6 entries in order [cave, forest, plains, ocean, nether, end] satisfying
  the constraints; `cave` has `ambient_cave` with interval [200, 600] and volume 0.5; `plains`
  has `ambient_plains` with interval [400, 1000] and volume 0.3; `nope` is `undefined`

### Requirement: default state
`createDefaultAmbientState(rng)` MUST return `{ environment: 'plains', musicDelay: roll(12000,
24000), cueDelay: roll(400, 1000) }` using the given rng.

#### Scenario: defaults
- **GIVEN** rng `() => 0.5`
- **THEN** `musicDelay` is 12000 + floor(0.5 * 12001) = 18000 and `cueDelay` is 400 + floor(0.5 *
  601) = 700

### Requirement: music fires and re-rolls
When `musicDelay` reaches 0, `tickAmbient` MUST emit the day/night music cue (volume 1) and
re-roll `musicDelay`; when both delays reach 0 in the same tick, the music cue MUST fire and both
delays MUST be re-rolled (one cue).

#### Scenario: music
- **GIVEN** a state with `musicDelay: 1`, `cueDelay: 50`, `isDay` true, rng `() => 0.5`
- **THEN** the tick yields cue `{ kind: 'music', soundEvent: 'music_day', volume: 1 }` and
  `musicDelay` 18000, `cueDelay` 49
- **AND** with a state `{ musicDelay: 1, cueDelay: 1 }` the tick yields only the music cue and
  both delays are re-rolled (18000 and 700)

### Requirement: environment and weather cues
When `cueDelay` reaches 0 (and music did not fire), `tickAmbient` MUST emit `rain` 0.5 during
rain, `thunder` 1.0 during thunder, and the environment's cue at its volume during clear weather,
then re-roll `cueDelay`.

#### Scenario: cues
- **GIVEN** a state with `musicDelay: 100`, `cueDelay: 1`, environment `cave`, weather `clear`,
  rng `() => 0.5`
- **THEN** the cue is `{ kind: 'cue', soundEvent: 'ambient_cave', volume: 0.5 }` and `cueDelay`
  re-rolls to 400; with weather `rain` the cue is `{ soundEvent: 'rain', volume: 0.5 }`; with
  weather `thunder` it is `{ soundEvent: 'thunder', volume: 1.0 }`

### Requirement: environment change re-rolls the cue delay
When `options.environment` differs from `state.environment`, `tickAmbient` MUST re-roll
`cueDelay` (not decremented on the change tick), leaving `musicDelay` untouched (it still
decrements).

#### Scenario: change
- **GIVEN** a state with environment `plains`, `musicDelay: 5`, `cueDelay: 3`, and
  `options.environment` `nether`, rng `() => 0.5`
- **THEN** the result has environment `nether`, `musicDelay` 4, and `cueDelay` 325 (150 +
  floor(0.5 * 351)); no cue fires

### Requirement: quiet ticks and immutability
When neither delay reaches 0, `tickAmbient` MUST return `cue: null` with both delays decremented,
and MUST NOT mutate the input state.

#### Scenario: quiet tick
- **GIVEN** a state with `musicDelay: 5`, `cueDelay: 7`, same environment
- **THEN** the result is `{ state: { ..., musicDelay: 4, cueDelay: 6 }, cue: null }` and the
  input object still holds 5/7

## Error and failure behavior
- None — total functions over typed inputs.

## Performance and resource bounds
- O(1) per tick; linear scans over the 6-entry table.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions; cues are descriptors only — no audio side effects.

## Observability
- State and cues are plain immutable objects; a tick's result fully determines the next.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 table/constants | `tests/unit/AmbientAudioFramework.test.ts` › environment table |
| REQ-2 default state | › default state |
| REQ-3 music | › music |
| REQ-4 cues | › environment and weather cues |
| REQ-5 environment change | › environment change |
| REQ-6 quiet ticks | › quiet ticks and immutability |
