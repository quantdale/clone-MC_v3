# Proposal: 196-weather-state

## Problem
191 can emit `set_weather` effects and 189 defines `doWeatherCycle`, but there is no weather state:
nothing holds the current weather, nothing advances rain/thunder timers, and nothing decides when
clear turns to rain or rain turns to thunder. 197's rendering needs a simulation truth to draw.

## Goals
- `src/simulation/WeatherFramework.ts` (NEW), pure and headless-safe (no world access, no
  mutation):
  - **State**: `WeatherState { weather, rainTime, thunderTime }` — `weather` is one of
    `clear|rain|thunder` (191's `WeatherKind`); `rainTime` is ticks until the next weather
    transition; `thunderTime` is ticks until thunder ends (meaningful only during thunder, but it
    also counts down during plain rain so thunder can start mid-rain, vanilla-style).
  - **Defaults**: `createDefaultWeatherState()` — clear, both timers 0 (no pending transition
    until a duration is set or rolled).
  - **Command entry**: `setWeather(state, weather, duration)` — sets the weather for `duration`
    ticks (vanilla `/weather <w> <duration>`): clear -> `{ clear, duration, 0 }`, rain ->
    `{ rain, duration, 0 }`, thunder -> `{ thunder, duration, duration }`. Invalid weather or a
    non-integer/negative duration returns the IDENTICAL state (identity no-op).
  - **Per-tick advance**: `tickWeather(state, doWeatherCycle, rolls)` — with `doWeatherCycle`
    (189's gamerule) false the IDENTICAL state is returned (timers frozen, no natural transition);
    otherwise timers decrement and, on expiry, the weather transitions deterministically using the
    caller-supplied `rolls` (clear/rain/thunder durations — the wiring injects RNG, keeping the
    module deterministic): clear -> rain, rain -> clear, and thunder starts/ends within rain.
  - **Queries**: `isRaining(state)` / `isThundering(state)`.
  - **Persistence**: `serializeWeatherState` / `deserializeWeatherState` — version 1,
    validate-before-accept (weather in the set, integer non-negative timers, exact key set;
    descriptive throws, nothing partially accepted).

## Non-goals
- **No visual/audio rendering** (197), **no rain/water/ice block simulation wiring** (later
  changes), **no random number generation inside the module** (rolls are injected), **no
  `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 195 (`spectator-mode`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 191's `WeatherKind` (imported type/const set) and the `doWeatherCycle` gamerule name (189) —
  the gamerule value itself is passed in per tick.

## Proposed change
1. `src/simulation/WeatherFramework.ts` (NEW): state + get/set, per-tick advance with injected
   rolls, queries, and versioned persistence.

## Compatibility and migration
- One new simulation file; zero registry changes, zero characterization updates, no `Game.ts` edit,
  no schema/save-format change.

## Risks
- **Transition-order drift from vanilla**. Mitigation: the tick state machine is pinned tick-by-
  tick in tests (decrement first, one transition per tick, thunder only within rain).
- **RNG coupling**. Mitigation: durations are injected as `WeatherRolls`; the module stays fully
  deterministic and the injected-roll path is tested with fixed values.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: defaults; `setWeather` for all three weathers and identity no-ops on invalid
  input; the full tick state machine (frozen with `doWeatherCycle` false; clear->rain; rain->clear;
  thunder start within rain; thunder->rain; rain end during thunder); queries; persistence
  round-trip and every rejection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
