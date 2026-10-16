# Spec: weather-framework

## Contract
This capability adds the deterministic weather state machine: `WeatherState` holding the current
weather and two tick timers, a command entry (`setWeather`), per-tick advance gated by 189's
`doWeatherCycle` with injected durations (`tickWeather`), clear/rain/thunder queries, and versioned
validate-before-accept persistence — all pure and headless-safe.

## Definitions
- **Weather**: `clear`, `rain`, or `thunder` (191's `WeatherKind`).
- **rainTime**: ticks until the next weather transition (clear period before rain, or remaining
  rain).
- **thunderTime**: ticks until thunder ends; it also counts down during plain rain so thunder can
  start mid-rain (vanilla).
- **Rolls**: the caller-supplied clear/rain/thunder durations in ticks (the wiring's RNG output).

## Invariants
- No world access, no mutation, no randomness inside the module; fully deterministic given inputs.
- `setWeather` MUST return the identical state for invalid weather or a non-integer/negative
  duration.
- `tickWeather` MUST return the identical state when `doWeatherCycle` is false; otherwise exactly
  one decrement and at most one transition per tick.
- Transition rules: clear -> rain on rainTime expiry (rain starts with a pending thunder roll);
  rain -> clear on rainTime expiry (taking precedence over a same-tick thunder start); thunder
  starts within rain on thunderTime expiry (rain's own timer continues); thunder -> plain rain on
  thunderTime expiry (with a fresh pending thunder roll); rain ends during thunder on rainTime
  expiry. Timers never go negative.
- Deserialization MUST validate the entire payload before accepting anything and MUST throw
  descriptive errors on any violation.

## Requirements

### Requirement: default and set
`createDefaultWeatherState()` MUST return `{ weather: 'clear', rainTime: 0, thunderTime: 0 }`.
`setWeather(state, weather, duration)` MUST set clear to `{ clear, duration, 0 }`, rain to
`{ rain, duration, 0 }`, and thunder to `{ thunder, duration, duration }` for a non-negative
integer duration, and MUST return the identical state for a negative, non-integer, or NaN duration
or an unknown weather.

#### Scenario: setting weather
- **GIVEN** a default state and `setWeather(state, 'rain', 6000)`
- **THEN** the result is `{ weather: 'rain', rainTime: 6000, thunderTime: 0 }`; `setWeather(state,
  'thunder', 6000)` is `{ weather: 'thunder', rainTime: 6000, thunderTime: 6000 }`;
  `setWeather(state, 'clear', 6000)` is `{ weather: 'clear', rainTime: 6000, thunderTime: 0 }`;
  `setWeather(state, 'rain', -1)`, `setWeather(state, 'rain', 1.5)`, and
  `setWeather(state, 'sunny', 6000)` all return the identical default-state object

### Requirement: doWeatherCycle gates natural change
`tickWeather(state, false, rolls)` MUST return the IDENTICAL state regardless of timers (frozen
weather and timers).

#### Scenario: frozen weather
- **GIVEN** `{ weather: 'rain', rainTime: 1, thunderTime: 0 }` and `tickWeather(state, false, rolls)`
- **THEN** the result is the identical object

### Requirement: clear becomes rain
`tickWeather` on a clear state MUST decrement `rainTime` while it is positive and MUST transition
to `{ rain, rolls.rainDuration, rolls.thunderDuration }` when it reaches 0 (rain starts with a
pending thunder roll).

#### Scenario: clear to rain
- **GIVEN** `{ weather: 'clear', rainTime: 2, thunderTime: 0 }` and rolls with `rainDuration` 12000,
  `thunderDuration` 3600
- **THEN** one tick yields `{ clear, 1, 0 }`; the next tick yields `{ rain, 12000, 3600 }`

### Requirement: rain ends to clear
`tickWeather` on a rain state MUST decrement both timers while positive and MUST transition to
`{ clear, rolls.clearDuration, 0 }` when `rainTime` reaches 0.

#### Scenario: rain to clear
- **GIVEN** `{ weather: 'rain', rainTime: 1, thunderTime: 0 }` and rolls with `clearDuration` 15000
- **THEN** one tick yields `{ clear, 15000, 0 }`

### Requirement: thunder starts and ends within rain
`tickWeather` on a rain state with `thunderTime` at 0 or 1 MUST transition to `{ thunder,
rainTime - 1, rolls.thunderDuration }` (rain's own timer continues). On a thunder state,
`thunderTime` at 0 or 1 MUST return to `{ rain, rainTime - 1, rolls.thunderDuration }` (plain rain
resumes with a fresh pending thunder roll); `rainTime` reaching 0 MUST end to clear.

#### Scenario: thunder cycle
- **GIVEN** `{ weather: 'rain', rainTime: 10000, thunderTime: 0 }` and rolls with
  `thunderDuration` 3600, `clearDuration` 15000
- **THEN** one tick yields `{ thunder, 9999, 3600 }`; after 3600 ticks of thunder the state is
  `{ rain, 6399, 3600 }` (thunder ended, rain continued with a fresh thunder roll); ticking until
  `rainTime` 0 yields `{ clear, 15000, 0 }`

### Requirement: queries
`isRaining(state)` MUST be `weather !== 'clear'`; `isThundering(state)` MUST be
`weather === 'thunder'`.

#### Scenario: queries
- **GIVEN** `{ weather: 'clear' }`, `{ weather: 'rain' }`, `{ weather: 'thunder' }`
- **THEN** `isRaining` is false, true, true and `isThundering` is false, false, true

### Requirement: versioned persistence
`serializeWeatherState(state)` MUST produce `{ version: 1, weather, rainTime, thunderTime }`;
`deserializeWeatherState` MUST round-trip it and MUST throw a descriptive `Error` for a non-object
payload, an unsupported version, an unknown weather, a non-integer or negative timer, and unknown
extra keys — accepting nothing partially.

#### Scenario: persistence
- **GIVEN** a state, its serialization, `'rain'`, `{ version: 1, weather: 'sunny', rainTime: 0,
  thunderTime: 0 }`, `{ version: 0, weather: 'rain', rainTime: 0, thunderTime: 0 }`,
  `{ version: 1, weather: 'rain', rainTime: -1, thunderTime: 0 }`, `{ version: 1, weather: 'rain',
  rainTime: 1.5, thunderTime: 0 }`, and `{ version: 1, weather: 'rain', rainTime: 0,
  thunderTime: 0, extra: true }`
- **THEN** the round-trip equals the original; the other inputs each throw mentioning `expected an
  object`, `unknown weather`, `unsupported version`, `rainTime must be a non-negative integer`,
  `thunderTime must be a non-negative integer`, and `unknown key` respectively

## Error and failure behavior
- No throws in the state/advance API; invalid `setWeather` input identity-no-ops.
- Only `deserializeWeatherState` throws (invalid persisted data must never be silently accepted).

## Performance and resource bounds
- O(1) per tick; one state object per result.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure deterministic functions; injected rolls keep randomness out of the simulation core.

## Observability
- The state is a plain immutable object; a tick's result fully determines the next tick's input.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 default and set | `tests/unit/WeatherFramework.test.ts` › default and setWeather |
| REQ-2 doWeatherCycle gate | › tickWeather gate |
| REQ-3 clear to rain | › transitions |
| REQ-4 rain to clear | › transitions |
| REQ-5 thunder cycle | › transitions |
| REQ-6 queries | › queries |
| REQ-7 persistence | › persistence |
