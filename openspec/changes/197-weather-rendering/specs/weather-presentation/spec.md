# Spec: weather-presentation

## Contract
This capability adds the pure presentation mapping from 196's weather simulation truth to
rendering/audio parameters: rain intensity, thunder intensity, sky darkness, and sound levels —
a read-only derivation that never changes the simulation.

## Definitions
- **Presentation descriptor**: the immutable `{ rainIntensity, thunderIntensity, skyDarkness,
  rainSoundLevel, thunderSoundLevel }` bundle.
- **Sky darkness**: the relative darkening of the sky during weather (0 = clear).

## Invariants
- Pure and headless-safe: no scene access, no mutation, no randomness.
- The descriptor MUST depend ONLY on `state.weather`; timers MUST have no influence.
- The input `WeatherState` MUST never be mutated by `presentWeather`.
- The mapping MUST follow the fixed table: clear -> (0, 0, 0, 0, 0); rain -> (1, 0, 0.25, 1, 0);
  thunder -> (1, 1, 0.5, 1, 1).

## Requirements

### Requirement: presentation table
`presentWeather(state)` MUST return the fixed descriptor per weather kind, using the exported
`RAIN_SKY_DARKNESS` (0.25) and `THUNDER_SKY_DARKNESS` (0.5) constants for sky darkness.

#### Scenario: the three weathers
- **GIVEN** states with weather `clear`, `rain`, and `thunder`
- **THEN** the descriptors are exactly
  `{ rainIntensity: 0, thunderIntensity: 0, skyDarkness: 0, rainSoundLevel: 0,
  thunderSoundLevel: 0 }`,
  `{ rainIntensity: 1, thunderIntensity: 0, skyDarkness: 0.25, rainSoundLevel: 1,
  thunderSoundLevel: 0 }`, and
  `{ rainIntensity: 1, thunderIntensity: 1, skyDarkness: 0.5, rainSoundLevel: 1,
  thunderSoundLevel: 1 }`

### Requirement: timers are irrelevant
Two states with the same weather but different timers MUST produce identical descriptors.

#### Scenario: timer independence
- **GIVEN** `{ weather: 'rain', rainTime: 0, thunderTime: 0 }` and
  `{ weather: 'rain', rainTime: 43210, thunderTime: 12345 }`
- **THEN** both `presentWeather` results are deep-equal

### Requirement: simulation truth is never mutated
`presentWeather(state)` MUST NOT modify the input state in any way.

#### Scenario: read-only
- **GIVEN** a `WeatherState` object
- **THEN** after `presentWeather(state)`, the state deep-equals its original value

## Error and failure behavior
- None — a total function over the three weather kinds; unknown kinds are impossible by typing.

## Performance and resource bounds
- O(1); a single descriptor object per call.

## Compatibility and migration
- One new rendering file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Read-only derivation; the simulation truth is never altered.

## Observability
- The descriptor is a plain immutable object; every field is inspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 presentation table | `tests/unit/WeatherPresentation.test.ts` › presentation table |
| REQ-2 timer independence | › timer independence |
| REQ-3 read-only | › simulation truth is never mutated |
