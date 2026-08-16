# Spec: accessibility-options

## Contract
This capability adds the typed accessibility options: a fixed 7-option table (UI scale,
subtitles, reduced motion, screen effects, text background opacity, chat visibility, flash
lighting), an immutable validated store, and versioned standalone persistence — pure and
headless-safe.

## Definitions
- **Kind**: `boolean`, `float` (inclusive range), or `choice` (ordered options list).
- **Accessibility store**: `Record<AccessibilityKey, boolean | number | string>` of validated
  values.

## Invariants
- Pure and headless-safe: no DOM access, no mutation of inputs.
- `setOption` MUST return the IDENTICAL store for invalid values (wrong kind, out of range,
  unknown choice, non-finite) and same-value sets.
- `isValidAccessibilityValue` MUST be false for unknown keys and unknown choices.
- `deserializeAccessibility` MUST throw for non-objects, bad versions, unknown options, and
  invalid values, and MUST default MISSING known options — nothing else is accepted partially.

## Requirements

### Requirement: option table and defaults
`ACCESSIBILITY_OPTIONS` MUST contain exactly the 7 documented options with kinds, ranges/choices,
and defaults; `accessibilityOption(key)` MUST return the definition for known keys and
`undefined` otherwise; `createDefaultAccessibility()` MUST return every default.

#### Scenario: table
- **GIVEN** `ACCESSIBILITY_OPTIONS`, lookups for `uiScale`, `screenEffects`, `nope`, and
  `createDefaultAccessibility()`
- **THEN** the table has 7 entries; `uiScale` is a choice [auto, small, normal, large] default
  auto; `screenEffects` is a choice [fade, flash, none] default fade; `subtitles` is boolean
  default false; `textBackgroundOpacity` is float [0, 1] default 0.5; `chatVisibility` is a
  choice [full, commands, hidden] default full; `flashLighting` is boolean default true; `nope`
  is `undefined`; the default store holds every default

### Requirement: validation
`isValidAccessibilityValue(key, value)` MUST be true exactly for values of the right kind within
the inclusive range (booleans exact; floats finite and in range; choices exact list membership)
and false otherwise.

#### Scenario: validation
- **GIVEN** `uiScale` with 'auto', 'large', 'huge'; `textBackgroundOpacity` with 0, 1, 0.5, -0.1;
  `subtitles` with true, 1; and `nope` with true
- **THEN** the valid ones are 'auto', 'large' (uiScale), 0, 1, 0.5 (textBackgroundOpacity), true
  (subtitles); everything else is false

### Requirement: set with identity no-ops
`setOption(store, key, value)` MUST return a NEW store for a valid changed value and the
IDENTICAL store for invalid values and same-value sets.

#### Scenario: set
- **GIVEN** a default store and `setOption(store, 'uiScale', 'large')`
- **THEN** the result has 'large' and is not the same object; `setOption(result, 'uiScale',
  'large')` returns the identical object; `setOption(result, 'uiScale', 'huge')` (unknown
  choice) and `setOption(result, 'subtitles', 1)` (wrong kind) return the identical object

### Requirement: versioned persistence
`serializeAccessibility(store)` MUST produce `{ version: 1, options }`; `deserializeAccessibility`
MUST round-trip it, MUST throw a descriptive `Error` for a non-object payload, an unsupported
version, a non-object `options`, an unknown option, and an invalid value, and MUST default
MISSING known options.

#### Scenario: persistence
- **GIVEN** a store, its serialization, `null`, `{ version: 0, options: {} }`,
  `{ version: 1, options: 'x' }`, `{ version: 1, options: { nope: true } }`,
  `{ version: 1, options: { uiScale: 'huge' } }`,
  `{ version: 1, options: { textBackgroundOpacity: 1.5 } }`, and
  `{ version: 1, options: { uiScale: 'large' } }`
- **THEN** the round-trip equals the original; the invalid inputs each throw mentioning
  `expected an object`, `unsupported version`, `options must be an object`, `unknown option`,
  and `must be` respectively; the last input deserializes with `uiScale` 'large' and every other
  option at its default

## Error and failure behavior
- No throws in the store API; only `deserializeAccessibility` throws.

## Performance and resource bounds
- O(1) get/set; O(options) deserialize.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.
- Missing-option defaults make old payloads loadable after options are added.

## Security and integrity
- Pure functions; invalid persisted data is rejected wholesale.

## Observability
- The store is a plain immutable object; option lookup is introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 table/defaults | `tests/unit/AccessibilityFramework.test.ts` › table |
| REQ-2 validation | › validation |
| REQ-3 set identity | › set |
| REQ-4 persistence | › persistence |
