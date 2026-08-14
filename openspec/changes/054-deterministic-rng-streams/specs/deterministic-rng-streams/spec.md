# Spec: deterministic-rng-streams

## Contract

Simulation subsystems MUST be able to draw from deterministic, named, seed-derived RNG streams that
replay identically and never interfere. A `SeedRng` MUST produce a pinned (mulberry32) sequence from a
seed, MUST offer typed draws with documented ranges, MUST derive deterministic child streams via
`fork(name)`, and MUST expose `state`. `createNamedRng(worldSeed, streamName)` MUST derive an isolated,
reproducible stream per name.

## Definitions

- **Draw**: one `next()` call advancing the 32-bit state.
- **Named stream**: the RNG derived from `(worldSeed, streamName)`.

## Invariants

- Same seed → identical sequence; different seeds/names → different sequences.
- `nextInt(max)` ∈ `[0, max)`; `nextIntInclusive(min, max)` ∈ `[min, max]`; `nextFloat()` ∈ `[0, 1)`.
- `fork(name)` from the same parent state yields the same child sequence; forking consumes one parent
  draw.
- `state` is the current 32-bit state.

## Requirements

### Requirement: determinism
Two streams created with the same seed MUST produce identical sequences.

#### Scenario: reproducibility
- **GIVEN** `a = new SeedRng(42)` and `b = new SeedRng(42)`
- **WHEN** both draw 100 values
- **THEN** the sequences are identical.

### Requirement: named stream isolation
`createNamedRng(worldSeed, name)` MUST yield reproducible, name-isolated streams.

#### Scenario: named streams
- **GIVEN** `createNamedRng(7, 'a')`, `createNamedRng(7, 'a')`, and `createNamedRng(7, 'b')`
- **WHEN** each draws 100 values
- **THEN** the two `'a'` streams match and differ from the `'b'` stream.

### Requirement: typed draw ranges
`nextInt`/`nextIntInclusive`/`nextFloat` MUST respect their documented ranges.

#### Scenario: ranges
- **GIVEN** a stream
- **WHEN** 1000 draws of each kind run
- **THEN** `nextInt(5)` values are in `[0, 5)`, `nextIntInclusive(-3, 3)` values are in `[-3, 3]`,
  and `nextFloat()` values are in `[0, 1)`.

### Requirement: deterministic forks
`fork(name)` MUST derive the same child sequence from the same parent state and MUST advance the
parent.

#### Scenario: forking
- **GIVEN** two parents at the same state
- **WHEN** each forks `'child'` and the children draw 50 values
- **THEN** the child sequences are identical, and the parents' subsequent draws are equal (both
  advanced by one).

### Requirement: state exposure
Two streams with equal `state` MUST produce equal next draws; `state` MUST be a uint32.

#### Scenario: state equality
- **GIVEN** two streams with equal `state`
- **WHEN** each draws once
- **THEN** the draws are equal.

## Error and failure behavior

- `maxExclusive <= 0` → `RangeError`.
- `max < min` → `RangeError`.

## Performance and resource bounds

O(1) per draw.

## Compatibility and migration

The algorithm is pinned (mulberry32); future changes require a versioned stream scheme.

## Security and integrity

Deterministic streams keep simulation reproducible and subsystems independent.

## Observability

`state` exposes the stream position for replay debugging.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Determinism | same seed → identical 100-draw sequences |
| Named stream isolation | same name reproducible; different name differs |
| Typed draw ranges | 1000-draw range checks |
| Deterministic forks | same state+name → same child; parent advances |
| State exposure | equal states → equal draws; uint32 |
