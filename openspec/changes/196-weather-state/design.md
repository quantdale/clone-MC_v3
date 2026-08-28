# Design: 196-weather-state

## Context/current state
- 191 can emit `set_weather`; 189 defines `doWeatherCycle`. No state holds the current weather or
  advances timers. 196 adds the deterministic weather state machine; 197 renders from it.

## Target state
- `src/simulation/WeatherFramework.ts` holding `WeatherState`, `setWeather`, `tickWeather`,
  `isRaining`/`isThundering`, and versioned persistence.

## Invariants
- Pure and headless-safe: no world access, no mutation, no randomness inside the module.
- `rainTime`/`thunderTime` are non-negative integer tick counts.
- `setWeather` identity-no-ops on invalid weather or a non-integer/negative duration.
- `tickWeather` returns the IDENTICAL state when `doWeatherCycle` is false; otherwise exactly one
  decrement (and at most one transition) per tick.
- Transitions: clear -> rain (rainTime expiry; rain starts with a pending thunder roll), rain ->
  clear (rainTime expiry, taking precedence over a same-tick thunder start), thunder starts within
  rain (thunderTime expiry; the rain timer continues), thunder -> plain rain (thunderTime expiry;
  with a fresh pending thunder roll); rain ends during thunder the same as rain (rainTime expiry).
  Timers never go negative.
- Deserialization validates the whole payload before accepting anything; violations throw
  descriptive errors.

## API and data model
```ts
// src/simulation/WeatherFramework.ts (new)
export interface WeatherState {
  weather: WeatherKind;   // 'clear' | 'rain' | 'thunder'
  rainTime: number;       // ticks until the next weather transition
  thunderTime: number;    // ticks until thunder ends (counts during rain and thunder)
}

export interface WeatherRolls {
  readonly clearDuration: number;    // ticks of clear before rain starts
  readonly rainDuration: number;     // ticks of rain before it ends
  readonly thunderDuration: number;  // ticks of thunder before plain rain resumes
}

export function createDefaultWeatherState(): WeatherState;             // { clear, 0, 0 }
export function setWeather(state: WeatherState, weather: WeatherKind, duration: number): WeatherState;
export function tickWeather(state: WeatherState, doWeatherCycle: boolean, rolls: WeatherRolls): WeatherState;
export function isRaining(state: WeatherState): boolean;               // weather !== 'clear'
export function isThundering(state: WeatherState): boolean;            // weather === 'thunder'

export interface SerializedWeatherState { version: 1; weather: WeatherKind; rainTime: number; thunderTime: number; }
export function serializeWeatherState(state: WeatherState): SerializedWeatherState;
export function deserializeWeatherState(input: unknown): WeatherState;
```

## Control/data flow
1. A `/weather` command (191) routes through `setWeather(state, weather, duration)`.
2. Each game tick, the wiring calls `tickWeather(state, doWeatherCycleValue, rolledDurations)` and
   stores the result; 189's `doWeatherCycle` gates natural transitions.
3. Rendering (197) and block effects read `state.weather` via `isRaining`/`isThundering`.

## Detailed behavior
- `setWeather`: `clear` -> `{ clear, duration, 0 }`; `rain` -> `{ rain, duration, 0 }`; `thunder`
  -> `{ thunder, duration, duration }`. `duration` must be a non-negative safe integer; otherwise
  (or an unknown weather from an untyped caller) the IDENTICAL state is returned.
- `tickWeather(state, false, _)`: IDENTICAL state (timers frozen — vanilla `doWeatherCycle` false).
- `tickWeather(state, true, rolls)` — `rainTime` counts down; when it reaches 0 the period ends and
  the next weather starts (rolled) on that SAME tick (a period of `d` ticks transitions on the
  d-th tick); during rain `thunderTime` counts down and starting thunder preserves the rain timer:
  - expired period (`rainTime` already 0): clear -> `{ rain, rolls.rainDuration,
    rolls.thunderDuration }` (rain starts with a pending thunder roll); rain or thunder ->
    `{ clear, rolls.clearDuration, 0 }`.
  - clear: `rainTime` reaching 0 -> `{ rain, rolls.rainDuration, rolls.thunderDuration }`;
    otherwise `{ clear, rainTime - 1, 0 }`.
  - rain: `rainTime` reaching 0 -> `{ clear, rolls.clearDuration, 0 }` (precedence over a same-tick
    thunder start); `thunderTime` at 0 or 1 -> `{ thunder, rainTime - 1, rolls.thunderDuration }`
    (thunder starts within rain, preserving the rain timer); otherwise
    `{ rain, rainTime - 1, thunderTime - 1 }`.
  - thunder: `rainTime` reaching 0 -> `{ clear, rolls.clearDuration, 0 }` (rain ends during
    thunder); `thunderTime` at 0 or 1 -> `{ rain, rainTime - 1, rolls.thunderDuration }` (plain
    rain resumes with a fresh pending thunder roll); otherwise
    `{ thunder, rainTime - 1, thunderTime - 1 }`.
  - Timers never go negative.

## Failure modes
- No throws in the state/advance API; `setWeather` identity-no-ops on invalid input.
- Only `deserializeWeatherState` throws (invalid persisted data must not be silently accepted).

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- O(1) per tick; no allocations beyond one state object.

## Testing seams
- Tests drive the state machine with fixed `WeatherRolls` values and assert exact states after
  each tick; persistence tests cover every rejection.

## Observability/debugging
- The state is a plain immutable object; a tick's result fully determines the next tick's input.

## Affected files/symbols
- `src/simulation/WeatherFramework.ts` (new).
- Tests: `tests/unit/WeatherFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Embedding an RNG**: rejected — injected `WeatherRolls` keep the module deterministic and
  headless-safe; the wiring owns randomness.
- **Rolling durations on transition inside the module**: rejected — same reason.

## Downstream dependencies
- 197 (`weather-rendering`) reads this state for visuals/audio; block/fluid weather effects consume
  `isRaining`/`isThundering`; 242's e2e drives `/weather` through this framework.
