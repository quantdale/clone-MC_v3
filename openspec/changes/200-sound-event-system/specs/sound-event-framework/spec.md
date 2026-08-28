# Spec: sound-event-framework

## Contract
This capability adds the pure sound-event model: fixed categories, an 18-entry data-driven event
table, positional emissions with volume/pitch handling, distance attenuation, an immutable
per-category mix, and versioned validate-before-accept persistence — headless-safe (no audio
output).

## Definitions
- **Category**: one of `master`, `music`, `weather`, `blocks`, `hostile`, `neutral`, `players`,
  `ambient`.
- **Emission**: `{ event, category, x, y, z, volume, pitch, range }` produced by `emitSound`.
- **Attenuation**: audible volume `volume * max(0, 1 - dist/range)`, 0 at/over the range.

## Invariants
- Pure and headless-safe: no audio context, no mutation, no randomness.
- `emitSound` MUST return `null` for unknown events; option volume MUST be >= 0; option pitch MUST
  clamp to [0.5, 2].
- `setCategoryVolume` MUST return the IDENTICAL state for values outside [0, 1], unknown
  categories, and same-value sets.
- `effectiveVolume(mix, emission, listener)` MUST be the audible volume scaled by the emission category's
  mix volume.
- Deserialization MUST validate the entire payload before accepting anything and MUST throw
  descriptive errors on any violation.

## Requirements

### Requirement: categories and event table
`SOUND_CATEGORIES` MUST be exactly `['master', 'music', 'weather', 'blocks', 'hostile',
'neutral', 'players', 'ambient']`. `SOUND_EVENTS` MUST contain exactly the 18 documented events,
each with a category from the set, `volume > 0`, `pitch > 0`, and `range > 0`; `soundEvent(id)`
MUST return the definition for known ids and `undefined` otherwise.

#### Scenario: table
- **GIVEN** `SOUND_CATEGORIES`, `SOUND_EVENTS`, and lookups for `block_break`, `thunder`,
  `explosion`, `nope`
- **THEN** the categories match the exact list; the table has 18 entries each satisfying the
  constraints; the three known lookups return definitions with the documented defaults
  (block_break volume 1.0/range 16, thunder volume 10.0/range 64, explosion volume 4.0/range 24)
  and `nope` is `undefined`

### Requirement: emission
`emitSound(event, position, options?)` MUST return an emission carrying the event's category,
default volume and pitch (or the option overrides: volume >= 0, pitch clamped to [0.5, 2]) and the
event's range, and MUST return `null` for unknown events.

#### Scenario: emitting
- **GIVEN** `emitSound('block_break', [1, 2, 3])`, `emitSound('block_break', [1, 2, 3], {
  volume: 0.5, pitch: 3 })`, and `emitSound('nope', [0, 0, 0])`
- **THEN** the first is `{ event: 'block_break', category: 'blocks', x: 1, y: 2, z: 3, volume: 1,
  pitch: 1, range: 16 }`; the second has volume 0.5 and pitch 2 (clamped); the third is `null`

### Requirement: attenuation
`audibleVolume(emission, listener)` MUST be `volume * (1 - dist/range)` for `dist < range`, 0 for
`dist >= range`.

#### Scenario: distances
- **GIVEN** an emission at `[0, 0, 0]` with volume 1 and range 16
- **THEN** at the listener position the volume is 1; at `[8, 0, 0]` it is 0.5; at `[16, 0, 0]`
  it is 0; at `[64, 0, 0]` it is 0

### Requirement: mix
`createDefaultSoundMix()` MUST set every category volume to 1. `setCategoryVolume(mix, category,
value)` MUST set the volume for values in [0, 1] and MUST return the IDENTICAL state for values
outside [0, 1] or the same value. `categoryVolume` MUST read the stored value.
`effectiveVolume(mix, emission, listener)` MUST scale the audible volume by the emission category's mix
volume.

#### Scenario: mixing
- **GIVEN** a default mix and `setCategoryVolume(mix, 'blocks', 0.5)`
- **THEN** `categoryVolume` for 'blocks' is 0.5 and for 'master' is 1; the result is not the same
  object; `setCategoryVolume(result, 'blocks', 0.5)` returns the identical object;
  `setCategoryVolume(result, 'blocks', 1.5)` returns the identical object; an emission of
  `block_break` at distance 8 (audible 0.5) has `effectiveVolume` 0.25

### Requirement: versioned persistence
`serializeSoundMix(mix)` MUST produce `{ version: 1, volumes }`; `deserializeSoundMix` MUST
round-trip it and MUST throw a descriptive `Error` for a non-object payload, an unsupported
version, an unknown category, a volume outside [0, 1], and unknown extra keys — accepting nothing
partially; missing categories default to full volume (1).

#### Scenario: persistence
- **GIVEN** a mix, its serialization, `'x'`, `{ version: 0, volumes: {} }`,
  `{ version: 1, volumes: { nope: 1 } }`, `{ version: 1, volumes: { blocks: 1.5 } }`, and
  `{ version: 1, volumes: { master: 1 }, extra: true }`
- **THEN** the round-trip equals the original; the invalid inputs each throw mentioning
  `expected an object`, `unsupported version`, `unknown category`, `volume must be in [0, 1]`,
  and `unknown key` respectively

## Error and failure behavior
- No throws in the event/emission/mix APIs; unknown events yield `null`.
- Only `deserializeSoundMix` throws (invalid persisted data must never be silently accepted).

## Performance and resource bounds
- All operations O(1); linear scans over the 18-entry table and 8-category set.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions; emissions are descriptors only — no audio side effects.

## Observability
- Emissions and the mix are plain immutable objects; the table is introspectable.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 table | `tests/unit/SoundEventFramework.test.ts` › categories and event table |
| REQ-2 emission | › emission |
| REQ-3 attenuation | › attenuation |
| REQ-4 mix | › mix |
| REQ-5 persistence | › persistence |
