# Spec: pathfinding-saturation

## Contract

Saturation drives bounded A* pathfinding (135 `findPath` over `NavigationGridQuery` 134) at worst-case
volume and MUST hold a measurable per-search latency budget, MUST never pop more than `maxExpansions`
nodes, MUST abort promptly when `isCancelled` returns true, MUST return a best-effort partial path on
budget exhaustion, and MUST report a path invalidated by a world change via `isPathStale`. Functional
suites are deterministic with an injectable clock and a fixed fixture world.

## Definitions

- **Search**: one `findPath(world, start, goal, options)` call.
- **Expansion**: one node popped from the open set; bounded by `options.maxExpansions` (default 2048).
- **Search budget**: `maxMeanSearchMillis` measured as a mean over `iterations` searches on a fixed
  field.
- **Stale path**: a path whose remaining nodes are no longer standable after a world change.

## Invariants

- `maxExpansions`, `maxMeanSearchMillis`, and `iterations` are positive finite numbers (validated).
- A search pops at most `maxExpansions` nodes; `PathResult.expanded <= maxExpansions` always.
- When `isCancelled` returns true, the search MUST stop at the next expansion boundary and set
  `PathResult.cancelled = true`.
- A search that exhausts the budget or empties the open set returns a best-effort partial path toward
  the closest-to-goal node with `reachedGoal: false`.
- `findPath` returns `null` exactly when the start cell is not standable.
- Identical world/options and identical scripted clocks produce identical paths and `expanded` counts.

## Requirements

### Requirement: expansion budget
`findPath` MUST NOT pop more than `maxExpansions` nodes; on exhaustion it MUST return a partial path
with `reachedGoal: false` and `expanded` equal to the number popped (≤ max).

#### Scenario: budget exhausted
- **GIVEN** a large open field where the direct path is blocked and `maxExpansions=128`
- **WHEN** `findPath` runs with the goal unreachable within the budget
- **THEN** `expanded <= 128`, `reachedGoal` is false, and `nodes` is a non-empty best-effort partial
  path.

#### Scenario: goal reached within budget
- **GIVEN** a short reachable path and a generous `maxExpansions`
- **WHEN** `findPath` runs
- **THEN** `reachedGoal` is true and `expanded <= maxExpansions`.

#### Scenario: non-standable start returns null
- **GIVEN** a start cell that `canStandAt` rejects
- **WHEN** `findPath` runs
- **THEN** it returns `null`.

### Requirement: prompt cancellation
When `isCancelled` returns true, the search MUST abort at the next expansion boundary and MUST set
`cancelled: true`; it MUST NOT continue exploring after the flag is observed.

#### Scenario: flag raised mid-search
- **GIVEN** a field where the search would take many expansions and an `isCancelled` that returns
  true after the 5th expansion
- **WHEN** `findPath` runs
- **THEN** the search stops at the boundary, `cancelled` is true, and `expanded` reflects no more than
  the expansions until the flag was observed.

#### Scenario: never cancelled
- **GIVEN** an `isCancelled` that always returns false
- **WHEN** `findPath` runs
- **THEN** `cancelled` is false and the search proceeds until the goal, budget, or empty open set.

### Requirement: search latency budget
`runPathfindSaturation` MUST run `iterations` searches on a fixed field, time each with the injectable
clock, and evaluate the mean against `maxMeanSearchMillis`.

#### Scenario: searches within budget
- **GIVEN** a fixed field and a config whose `maxMeanSearchMillis` is above the measured mean
- **WHEN** `runPathfindSaturation` runs
- **THEN** the report's `withinBudget` is true and the latency entry is at or below the budget.

#### Scenario: search budget violation
- **GIVEN** a field whose measured mean search latency exceeds `maxMeanSearchMillis`
- **WHEN** `runPathfindSaturation` runs
- **THEN** the latency entry has `withinBudget: false` and the report's `withinBudget` is false.

### Requirement: stale-path detection
`isPathStale(world, path, fromIndex, height)` MUST return `true` as soon as any remaining node (from
`fromIndex` onward) is no longer standable after a world change.

#### Scenario: path invalidated
- **GIVEN** a valid path and then a world change that blocks a node on the path
- **WHEN** `isPathStale` is called from the node just before the blocked node
- **THEN** it returns `true`.

#### Scenario: path still valid
- **GIVEN** a valid path and a world change that does not affect any remaining node
- **WHEN** `isPathStale` is called
- **THEN** it returns `false`.

### Requirement: determinism
Identical world, start, goal, options, and scripted clocks MUST produce identical paths, `expanded`
counts, and latency measurements.

#### Scenario: scripted clocks agree
- **GIVEN** two identical fixtures and scripted clocks
- **WHEN** each runs the same search
- **THEN** the returned paths and `expanded` counts are equal.

## Error and failure behavior

- `validatePathfindSaturationConfig` throws a descriptive error for non-finite, non-positive, or
  non-numeric fields, and for non-object input.
- A non-standable start yields `null` (not an exception).
- An out-of-budget or cancelled search yields a partial result, never an infinite loop and never a
  thrown error from the harness.

## Performance and resource bounds

Each search is O(maxExpansions) node pops with O(open) per-pop selection; the harness adds no
unbounded allocation. Wall-clock latency suites use the documented protocol: discard one warmup run,
then measure the median of at least 3 runs via `performance.now()`. Starting budgets are validated
constants; actual medians and any tuning are recorded in `verification.md`.

## Compatibility and migration

Additive and read-only over `AStarPathfinding`/`NavigationGridQuery`; no change to pathfinding
semantics, neighbor order, or result shape. No migration.

## Security and integrity

The expansion cap and cancellation flag guarantee a search cannot consume unbounded CPU under
saturation, protecting the frame/tick budget of the system that drives pathfinding.

## Observability

`PathResult` exposes `expanded`, `reachedGoal`, and `cancelled`; the report names the latency
dimension with budget vs actual mean.

## Verification mapping

- `tests/unit/PathfindSaturation.test.ts` — expansion cap (budget exhaustion, goal-reached,
  non-standable start), prompt cancellation, search latency budget and verdict, `isPathStale`,
  scripted-clock determinism, config validation.
