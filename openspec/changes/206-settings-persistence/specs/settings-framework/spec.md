# Spec: settings-framework

## Contract
This capability adds the typed settings framework: a fixed definitions table across graphics/
audio/controls/gameplay, an immutable validated store, and versioned persistence independent of
world saves — pure and headless-safe.

## Definitions
- **Kind**: `boolean`, `integer` (inclusive range), or `float` (inclusive range).
- **Settings store**: `Record<SettingKey, boolean | number>` of validated values.
- **Persistence payload**: `{ version: 1, settings }` — the standalone, world-independent form.

## Invariants
- Pure and headless-safe: no storage access, no mutation of inputs.
- `setSetting` MUST return the IDENTICAL store for invalid values (wrong kind, out of range,
  non-finite) and same-value sets.
- `isValidSettingValue` MUST be false for unknown keys.
- `deserializeSettings` MUST throw for non-objects, bad versions, unknown keys, and invalid
  values, and MUST default MISSING known keys (forward compatibility) — nothing else is accepted
  partially.

## Requirements

### Requirement: definition table and defaults
`SETTING_DEFINITIONS` MUST contain exactly the 10 documented settings with their kinds, ranges,
and defaults; `settingDefinition(key)` MUST return the definition for known keys and `undefined`
otherwise; `createDefaultSettings()` MUST return every default.

#### Scenario: table
- **GIVEN** `settingDefinitions()`, lookups for `renderDistance`, `sfxVolume`, `invertY`, `nope`,
  and `createDefaultSettings()`
- **THEN** the table has 10 entries (graphics 3, audio 3, controls 2, gameplay 2); `renderDistance`
  is integer [2, 32] default 12; `sfxVolume` is float [0, 1] default 1; `invertY` is boolean
  default false; `nope` is `undefined`; the default store holds every default

### Requirement: validation
`isValidSettingValue(key, value)` MUST be true exactly for values of the right kind within the
inclusive range (booleans exact; integers safe and in range; floats finite and in range), and
false for unknown keys and NaN.

#### Scenario: validation
- **GIVEN** `renderDistance` with 2, 32, 33, 12.5, NaN; `brightness` with 0, 1, 0.5, -0.1;
  `invertY` with true, 1; and `nope` with 1
- **THEN** the valid ones are 2, 32, 12 (renderDistance), 0, 1, 0.5 (brightness), true (invertY);
  everything else is false

### Requirement: set with identity no-ops
`setSetting(store, key, value)` MUST return a NEW store for a valid changed value and the
IDENTICAL store for invalid values and same-value sets.

#### Scenario: set
- **GIVEN** a default store and `setSetting(store, 'renderDistance', 20)`
- **THEN** the result has 20 and is not the same object; `setSetting(result, 'renderDistance', 20)`
  returns the identical object; `setSetting(result, 'renderDistance', 40)` (out of range) and
  `setSetting(result, 'renderDistance', 12.5)` (wrong kind) return the identical object

### Requirement: versioned persistence
`serializeSettings(store)` MUST produce `{ version: 1, settings }`; `deserializeSettings` MUST
round-trip it, MUST throw a descriptive `Error` for a non-object payload, an unsupported version,
a non-object `settings`, an unknown setting key, and an invalid value, and MUST default MISSING
known keys.

#### Scenario: persistence
- **GIVEN** a store, its serialization, `null`, `{ version: 0, settings: {} }`,
  `{ version: 1, settings: 'x' }`, `{ version: 1, settings: { nope: 1 } }`,
  `{ version: 1, settings: { renderDistance: 12.5 } }`,
  `{ version: 1, settings: { renderDistance: 40 } }`, and
  `{ version: 1, settings: { renderDistance: 20 } }`
- **THEN** the round-trip equals the original; the invalid inputs each throw mentioning
  `expected an object`, `unsupported version`, `settings must be an object`, `unknown setting`,
  `must be an integer`, and `must be within` respectively; the last input deserializes with
  `renderDistance` 20 and every other setting at its default

## Error and failure behavior
- No throws in the store API; only `deserializeSettings` throws (invalid persisted data must not
  be silently accepted).

## Performance and resource bounds
- O(1) get/set; O(keys) deserialize.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no world-save-format change.
- Missing-key defaults make old payloads loadable after settings are added.

## Security and integrity
- Pure functions; invalid persisted data is rejected wholesale.

## Observability
- The store is a plain immutable object; definition lookup is introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 table/defaults | `tests/unit/SettingsFramework.test.ts` › definitions |
| REQ-2 validation | › validation |
| REQ-3 set identity | › set |
| REQ-4 persistence | › persistence |
