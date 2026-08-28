# Spec: random-tick-system

## Contract

The game MUST select random-tick cells per ticking sub-chunk deterministically: a seeded, pure
function of `(seed, section coordinates, tick, attempt)` producing a fixed number of local indices per
sub-chunk per tick, with an eligibility-filtered world-coordinate variant and bounded attempts.

## Definitions

- **randomTicksPerSubChunk**: the number of random cells sampled per sub-chunk per tick (default 3).
- **Local index**: a cell index in `[0, 4096)` within a 16×16×16 sub-chunk.

## Invariants

- `selectForSection` returns exactly `count` indices, each in `[0, 4096)`.
- Identical inputs produce identical output arrays (pure function).
- `selectEligible` returns only positions passing the predicate and terminates within
  `maxEligibleAttempts` per requested position.
- Sampling is with replacement (Java parity).

## Requirements

### Requirement: deterministic selection
`selectForSection` MUST return exactly `count` indices in `[0, 4096)` that are a pure function of the
inputs.

#### Scenario: repeatability and bounds
- **GIVEN** fixed `(sectionX, sectionY, sectionZ, tick, seed)`
- **WHEN** `selectForSection` runs twice and with `count: 0`
- **THEN** both runs return identical arrays, every index is in `[0, 4096)`, and `count: 0` returns `[]`.

### Requirement: input variation
Different `tick`, `seed`, or section coordinates MUST (with overwhelming probability) yield different
selections.

#### Scenario: distinct inputs
- **GIVEN** the same section and seed at ticks `10` and `11`, and the same tick with seeds `1` and `2`
- **WHEN** `selectForSection` runs for each
- **THEN** the tick-10 and tick-11 arrays differ, and the seed-1 and seed-2 arrays differ.

### Requirement: eligibility filtering
`selectEligible` MUST return only positions whose world coordinates pass `isEligible`, with bounded
attempts.

#### Scenario: filtered selection
- **GIVEN** a predicate that accepts only even world `x`
- **WHEN** `selectEligible` runs
- **THEN** every returned position has even `x`, the count is at most the requested count, and a
  never-true predicate returns `[]` (no hang).

## Error and failure behavior

- `count <= 0` → `[]`.
- A throwing predicate propagates (caller bug).

## Performance and resource bounds

O(count) selection; eligibility sampling bounded by `maxEligibleAttempts` (default 256) per requested
position.

## Compatibility and migration

Additive; no consumers yet; no existing behavior changes.

## Security and integrity

Pure, seeded selection keeps random-tick behavior replayable and independent of frame timing.

## Observability

Selections are pure and loggable for replay debugging.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Deterministic selection | repeatability, bounds, count 0 |
| Input variation | tick/seed/section variation |
| Eligibility filtering | predicate filtering, never-true terminates |
