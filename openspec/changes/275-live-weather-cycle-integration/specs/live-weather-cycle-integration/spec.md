# Spec: live-weather-cycle-integration

## Contract
Live Game owns a world-scoped WeatherState driven by WeatherFramework under doWeatherCycle, persisted via `__weather__`, presented through Environment, and controllable via setWeather / `/weather`.

## Invariants
- I-1: Absent/corrupt weather records degrade to clear defaults without breaking boot.
- I-2: When doWeatherCycle is false, tickWeather returns identical state.
- I-3: When doWeatherCycle is true, weather timers advance with injected rolls.
- I-4: Successful setWeather updates store, persists, updates HUD/presentation.
- I-5: Reload restores last persisted weather kind/timers (within degrade rules).

## Requirements

### Requirement: W-1 — persistence
GamePersistence MUST hydrate and save WeatherState via `__weather__` with versioned serialize/deserialize and degrade-to-default on corrupt/absent payloads.

#### Scenario: round-trip
- GIVEN a set rain weather state
- WHEN saved and reloaded
- THEN getWeatherState reports rain with timers restored (or degraded safely).

### Requirement: W-2 — tick gate
Fixed ticks MUST call tickWeather with doWeatherCycle from the live gamerule store.

#### Scenario: rule off freezes
- GIVEN doWeatherCycle false and rain weather
- WHEN many fixed ticks run
- THEN weather kind and timers are unchanged.

### Requirement: W-3 — command + HUD
setWeather MUST update store + HUD indicator + presentation path.

#### Scenario: set thunder shows indicator
- GIVEN clear weather
- WHEN setWeather(thunder)
- THEN HUD weather indicator reflects thunder and presentation inputs update.
