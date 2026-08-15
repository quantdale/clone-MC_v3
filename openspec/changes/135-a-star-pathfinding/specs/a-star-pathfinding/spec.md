# Spec: a-star-pathfinding

## Contract
This capability adds a bounded, deterministic, cancellable A* path search over a 6-directional voxel
grid built on 134's `NavigationGridQuery`, plus `isPathStale`, a guard that detects when a
previously computed path has been invalidated by a world change. No diagonal/step-climb movement, no
incremental/multi-tick search, and no mob AI/`Game` wiring — see the proposal's Non-goals.

## Definitions
- **Path node**: an integer grid cell `{x, y, z}`.
- **Path result**: `{ nodes, reachedGoal, cancelled, expanded }` — `nodes[0]` is always `start`;
  `nodes[nodes.length-1]` is `goal` when `reachedGoal` is `true`, or the best-effort closest-to-goal
  node otherwise.
- **Expansion**: popping one node from the open set and generating its neighbors; `expanded` counts
  these.
- **Bounded**: `findPath` performs at most `maxExpansions` expansions before giving up and returning
  a best-effort result.
- **Stale**: a previously computed path is stale (from a given index onward) when at least one of
  its remaining nodes is no longer standable (`movementCost` is now `Infinity`), meaning the world
  changed since the path was computed.

## Invariants
- `findPath` returns `null` if and only if `start` is not standable at call time.
- `findPath` never performs more than `maxExpansions` expansions.
- For identical inputs (and an unchanging `world`), `findPath` always returns an identical
  `PathResult` (same `nodes`, same `expanded` count).
- `nodes[0]` always equals `start` whenever a non-`null` result is returned.
- `isPathStale` returns `true` as soon as it finds one remaining node whose `movementCost` is
  `Infinity`, and `false` only when every remaining node is still finite-cost.

## Requirements

### Requirement: findPath returns null exactly when start is unstandable
`findPath(world, start, goal, options)` MUST return `null` when `start` fails `canStandAt` (134),
and MUST NOT return `null` for a standable `start`, regardless of whether `goal` is reachable.

#### Scenario: an unstandable start returns null
- **GIVEN** a fixture world where `start` has no ground and is not water
- **WHEN** `findPath(world, start, goal)` is called
- **THEN** it returns `null`

#### Scenario: a standable start with an unreachable goal still returns a result, not null
- **GIVEN** a standable `start` fully walled off from `goal`
- **WHEN** `findPath(world, start, goal)` is called
- **THEN** it returns a non-`null` `PathResult` with `reachedGoal: false`

### Requirement: a reachable goal within budget is found via the shortest-cost path
`findPath` MUST return `reachedGoal: true` with `nodes[nodes.length-1]` equal to `goal` when an open,
passable route exists from `start` to `goal` within `maxExpansions`.

#### Scenario: a simple open corridor reaches the goal
- **GIVEN** a flat, fully open, solid-floored corridor from `start` to a `goal` a few cells away
- **WHEN** `findPath(world, start, goal)` is called
- **THEN** it returns `reachedGoal: true` and `nodes[0]`/`nodes[last]` equal `start`/`goal`

### Requirement: an unreachable goal yields a best-effort partial path, not an error
When `goal` cannot be reached (walled off, or budget exhausted first), `findPath` MUST NOT throw; it
MUST return `reachedGoal: false` and a `nodes` path ending at the expanded node with the lowest
Manhattan distance to `goal` found during the search.

#### Scenario: a walled-off goal returns the closest-approach path
- **GIVEN** `start` in a small open room fully enclosed by solid walls, with `goal` outside the room
- **WHEN** `findPath(world, start, goal)` is called
- **THEN** it returns `reachedGoal: false` with a non-empty `nodes` path starting at `start` and
  ending at some cell inside the room (the closest reachable approach to `goal`)

### Requirement: maxExpansions bounds the search
`findPath` MUST NOT perform more than `options.maxExpansions` node expansions; when a small
`maxExpansions` prevents reaching an otherwise-reachable goal, it MUST return `reachedGoal: false`
with `expanded <= maxExpansions`.

#### Scenario: a tiny expansion budget cuts off an otherwise-reachable goal
- **GIVEN** a long open corridor to `goal` and `options.maxExpansions` set too small to reach it
- **WHEN** `findPath(world, start, goal, options)` is called
- **THEN** it returns `reachedGoal: false`, `cancelled: false`, and `expanded <= maxExpansions`

### Requirement: cancellation aborts the search and reports it
`findPath` MUST stop searching and return `cancelled: true, reachedGoal: false` as soon as
`options.isCancelled()` returns `true`, checked once per expansion iteration.

#### Scenario: a predicate returning true immediately cancels the search
- **GIVEN** a reachable `goal` and `options.isCancelled: () => true`
- **WHEN** `findPath(world, start, goal, options)` is called
- **THEN** it returns `cancelled: true` and `reachedGoal: false`

### Requirement: findPath is deterministic across repeated identical calls
Calling `findPath` twice with identical `(world, start, goal, options)` (and an unchanging `world`)
MUST produce `PathResult`s with identical `nodes` arrays and identical `expanded` counts.

#### Scenario: repeated calls on the same inputs produce identical results
- **GIVEN** the same fixture world, `start`, `goal`, and options
- **WHEN** `findPath` is called twice
- **THEN** both calls' `nodes` arrays are deeply equal and both `expanded` counts are equal

### Requirement: isPathStale detects a world change that blocks a remaining path node
`isPathStale(world, path, fromIndex, height)` MUST return `true` when any node in
`path.nodes.slice(fromIndex)` is no longer standable in `world`, and `false` when every remaining
node is still standable.

#### Scenario: a path is fresh when nothing has changed
- **GIVEN** a `PathResult` computed over an unchanged world
- **WHEN** `isPathStale(world, path, 0, height)` is called
- **THEN** it returns `false`

#### Scenario: blocking a remaining node makes the path stale
- **GIVEN** the same `PathResult`, with a solid block newly placed at one of its remaining nodes
- **WHEN** `isPathStale(world, path, 0, height)` is called
- **THEN** it returns `true`

#### Scenario: a change before fromIndex does not count
- **GIVEN** the same `PathResult`, with a solid block placed at a node *before* `fromIndex` (already
  passed) and every node from `fromIndex` onward still standable
- **WHEN** `isPathStale(world, path, fromIndex, height)` is called
- **THEN** it returns `false`

## Error and failure behavior
- `findPath` never throws for a well-formed `NavigationWorld`; a throwing `isCancelled` propagates
  unmodified.
- `isPathStale` never throws for a well-formed `NavigationWorld` and a valid `fromIndex` (including
  `fromIndex >= path.nodes.length`, which trivially returns `false` — no remaining nodes to check).

## Performance and resource bounds
- `findPath` performs at most `maxExpansions` expansions, each generating exactly 6 neighbor
  candidates; the open-set pop-min scan is `O(openSet.length)` per expansion.
- `isPathStale` is `O(path.nodes.length - fromIndex)`.

## Compatibility and migration
- One new, additive file (`src/simulation/AStarPathfinding.ts`); no edits to any existing module. No
  schema/save-format change; no migration.

## Security and integrity
- All search state (`cameFrom`, `bestG`, the open set) is local to one `findPath` call; no shared
  mutable state persists between calls, so concurrent/repeated calls cannot interfere with each
  other's determinism.

## Observability
- `PathResult.expanded`/`reachedGoal`/`cancelled` fully explain the search's outcome without
  additional instrumentation.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 null exactly for unstandable start | `tests/unit/AStarPathfinding.test.ts` start cases |
| REQ-2 reachable goal found within budget | `tests/unit/AStarPathfinding.test.ts` open-corridor case |
| REQ-3 unreachable goal yields best-effort partial | `tests/unit/AStarPathfinding.test.ts` walled-off case |
| REQ-4 maxExpansions bounds the search | `tests/unit/AStarPathfinding.test.ts` tiny-budget case |
| REQ-5 cancellation aborts and reports | `tests/unit/AStarPathfinding.test.ts` cancellation case |
| REQ-6 determinism across repeated calls | `tests/unit/AStarPathfinding.test.ts` determinism case |
| REQ-7 isPathStale detects a blocking change | `tests/unit/AStarPathfinding.test.ts` isPathStale cases |
