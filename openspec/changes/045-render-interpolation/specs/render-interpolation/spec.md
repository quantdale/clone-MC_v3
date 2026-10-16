# Spec: render-interpolation

## Contract

Rendered state MUST be interpolated between fixed simulation tick snapshots, never extrapolated ahead
of the simulation. A `RenderInterpolator` MUST hold previous/current numeric state snapshots, MUST
produce per-component linear interpolation for an alpha in `[0, 1]`, MUST derive that alpha from the
044 clock accumulator (`alphaFromAccumulator`), MUST clamp it to `[0, 1]` (bounded catch-up), MUST
render the current state when no previous state exists, and MUST NOT mutate the snapshots it is given.

## Definitions

- **State**: a numeric vector (e.g. `[x, y, z]`).
- **alpha**: the fraction into the current tick at which to render (`accumulatorMs / TICK_MS`).

## Invariants

- `setState` copies the snapshot and moves the previous one down.
- `interpolate(alpha) = previous + (current - previous) * clamp(alpha, 0, 1)` per component.
- With no previous state, `interpolate` returns `current` (no lerp).
- `alphaFromAccumulator` returns `clamp(accumulatorMs / TICK_MS, 0, 1)`.
- `reset()` clears history; `hasState` is false until the first `setState`.

## Requirements

### Requirement: endpoint and midpoint interpolation
`interpolate(alpha)` MUST return `previous` at alpha 0, `current` at alpha 1, and component-wise
linear blends in between.

#### Scenario: midpoint blend
- **GIVEN** `setState([0, 0, 0])` then `setState([10, 20, 30])`
- **WHEN** `interpolate(0.5)` runs
- **THEN** the result is `[5, 10, 15]`.

### Requirement: bounded alpha
`alphaFromAccumulator` MUST clamp to `[0, 1]`.

#### Scenario: clamping
- **GIVEN** `accumulatorMs` values `-25`, `0`, `25`, `50`, `100`
- **WHEN** `alphaFromAccumulator` runs
- **THEN** the results are `0`, `0`, `0.5`, `1`, `1` (never beyond 1).

### Requirement: no previous state
The first `setState` MUST render as the current state at any alpha.

#### Scenario: first snapshot
- **GIVEN** a fresh interpolator and `setState([1, 2, 3])`
- **WHEN** `interpolate(0.7)` runs
- **THEN** the result is `[1, 2, 3]`.

### Requirement: reset clears history
`reset()` MUST clear both snapshots; the next `setState` behaves like the first.

#### Scenario: reset
- **GIVEN** an interpolator with history
- **WHEN** `reset()` then `setState([9, 9, 9])` then `interpolate(0.5)` run
- **THEN** `hasState` is true and the result is `[9, 9, 9]` (no previous to blend with).

### Requirement: snapshot immutability and mismatch fallback
`setState` MUST NOT mutate the caller's array; a component-count mismatch between previous and current
MUST fall back to `current`.

#### Scenario: mismatch and immutability
- **GIVEN** `setState([0, 0])` then `setState([1, 2, 3])` and an input array `[4, 5, 6]`
- **WHEN** `interpolate(0.5)` runs and `setState` is called with the input
- **THEN** `interpolate` returns `[1, 2, 3]` and the input array is unchanged.

## Error and failure behavior

- Non-finite alpha → `interpolate` returns `current`.
- Component-count mismatch → `interpolate` returns `current`.

## Performance and resource bounds

`interpolate` is O(n) in state size (typically 3), per render frame per interpolated object.

## Compatibility and migration

Additive; read-only over simulation snapshots; simulation truth untouched.

## Security and integrity

Clamped alpha prevents rendering ahead of simulation truth; copy-on-set prevents aliasing bugs.

## Observability

`hasState` exposes readiness.

## Verification mapping

| Requirement | Test |
| --- | --- |
| Endpoint and midpoint interpolation | alpha 0/0.5/1 results |
| Bounded alpha | alphaFromAccumulator clamping matrix |
| No previous state | first snapshot renders current |
| Reset clears history | reset + fresh setState renders current |
| Snapshot immutability and mismatch fallback | mismatch returns current; input unmutated |
