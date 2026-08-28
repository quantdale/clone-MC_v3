# Spec: animated-texture-metadata

## Contract

Animated atlas entries MUST be describable by validated `AnimatedTextureMetadata` (frame duration in
simulation ticks + explicit frame order) and selectable by a pure, deterministic function of
(metadata, tick): `animatedTextureFrameAt(metadata, tick)` MUST return `frames[0]` for negative
ticks and `frames[floor(tick / frametimeTicks) % frames.length]` otherwise. Validation MUST reject
malformed metadata with descriptive errors, and the registry MUST reject duplicates and invalid
entries. The selector MUST NOT depend on gameplay state.

## Definitions

- **frametimeTicks**: positive integer — ticks each frame is shown (engine ticks, 20/s, per 044).
- **frames**: non-empty array of non-negative integers — strip-local frame indices in animation
  order (not atlas coordinates).

## Invariants

- `frametimeTicks >= 1` and integer.
- `frames.length >= 1`; every `frames[i]` is an integer `>= 0`.
- `animatedTextureFrameAt(metadata, tick)` is pure and deterministic.
- The selector never throws for any finite tick.

## Requirements

### Requirement: metadata validation
`validateAnimatedTextureMetadata(input)` MUST accept exactly the valid shape and MUST throw a
descriptive `Error` for anything else.

#### Scenario: valid metadata accepted
- **GIVEN** `{ frametimeTicks: 5, frames: [0, 1, 2] }`
- **WHEN** validation runs
- **THEN** it returns the same value (narrowed).

#### Scenario: invalid frametime rejected
- **GIVEN** `frametimeTicks` of 0, -1, 2.5, NaN, or a non-number
- **WHEN** validation runs
- **THEN** it throws an error naming `frametimeTicks`.

#### Scenario: invalid frames rejected
- **GIVEN** empty `frames`, non-array frames, a negative index, or a non-integer index
- **WHEN** validation runs
- **THEN** it throws an error naming `frames`.

### Requirement: registry
`AnimatedTextureRegistry` MUST store validated metadata per string key with duplicate rejection and
059-style lookups.

#### Scenario: register, get, size, clear
- **GIVEN** a valid metadata object registered as `'minecraft:water'`
- **WHEN** lookup, size, and clear run
- **THEN** `get` returns the object, `has` is true, `size` is 1, and after `clear` size is 0 and
  `get` returns null.

#### Scenario: duplicates and invalid entries rejected
- **GIVEN** a key registered twice, or an invalid metadata object
- **WHEN** registration runs
- **THEN** it throws and the registry state is unchanged.

### Requirement: frame selection
`animatedTextureFrameAt` MUST select frames by the documented formula and wrap periodically.

#### Scenario: per-frame windows
- **GIVEN** `{ frametimeTicks: 5, frames: [0, 1, 2] }`
- **WHEN** ticks 0, 4, 5, 9, 10, 14 are queried
- **THEN** the results are 0, 0, 1, 1, 2, 2.

#### Scenario: wrap-around
- **GIVEN** `{ frametimeTicks: 5, frames: [0, 1, 2] }`
- **WHEN** tick 15 (one full cycle later) is queried
- **THEN** the result is 0 again.

#### Scenario: negative ticks clamp
- **GIVEN** any metadata and tick -1
- **WHEN** the selector runs
- **THEN** the result is `frames[0]`.

#### Scenario: single-frame entry
- **GIVEN** `{ frametimeTicks: 4, frames: [3] }`
- **WHEN** any non-negative tick is queried
- **THEN** the result is 3.

### Requirement: purity
Identical (metadata, tick) inputs MUST produce identical frame indices.

#### Scenario: repeated queries agree
- **GIVEN** fixed metadata and tick
- **WHEN** the selector runs twice
- **THEN** the results are equal.

## Error and failure behavior

- All invalid-input failures happen at validation/registration time with descriptive messages.
- The selector is total for finite ticks; non-finite ticks are not specified (callers use engine
  ticks).

## Performance and resource bounds

Selector: O(1). Validation: O(frames). Registry: O(1) lookups.

## Compatibility and migration

Additive: new data module, new selector module, new tests. No existing behavior or stored data
changes.

## Security and integrity

Not applicable: no I/O; strict validation of all inputs.

## Observability

Frame selection is a plain number; validation errors name the offending field.

## Verification mapping

- `tests/unit/AnimatedTexture.test.ts` — validation matrix, registry lifecycle, per-frame windows,
  wrap-around, negative clamping, single-frame entries, purity.
