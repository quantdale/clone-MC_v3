# Proposal: 135-a-star-pathfinding

## Problem
134 gave per-cell walkability/cost queries (`classifyNode`/`canStandAt`/`movementCost`) but nothing
searches a path between two points. There is no A* (or any) search in the codebase, and nothing
guards against a search running forever on an unreachable goal, being cancelled mid-search, or a
previously computed path becoming invalid after the world changes underneath it.

## Goals
- `findPath(world, start, goal, options)`: deterministic A* over a 6-directional (±x/±y/±z, no
  diagonals) voxel grid, using 134's `movementCost` as edge cost and Manhattan distance as an
  admissible, consistent heuristic. Bounded by `maxExpansions` (a hard node-expansion cap); when the
  goal isn't reached within budget (or the open set exhausts, or the caller cancels), returns the
  best-effort partial path toward the closest-to-goal node discovered, never a wrong/nonsensical one.
- Deterministic: identical inputs always produce an identical result, via fixed neighbor-exploration
  order and a strict, monotonic-insertion-order tiebreak for equal-cost open-set entries — never
  relying on incidental `Map`/object iteration order.
- Cancellation: an injectable `isCancelled(): boolean`, polled once per expansion, that aborts the
  search early and returns the best partial path found so far.
- `isPathStale(world, path, fromIndex, height)`: a stale guard — true when any remaining node (from
  `fromIndex` onward) in a previously computed path is no longer standable, so a caller knows to
  discard/recompute instead of walking a mob into a wall.

## Non-goals
- **No diagonal movement or automatic step-climbing beyond `movementCost`'s own single-cell
  semantics.** 134's `canStandAt` already governs whether a given `(x, y, z)` is occupiable; 135 does
  not add climbing/jumping heuristics on top of it. A future refinement may add 8-directional +
  step-up movement; documented as deliberately deferred.
- **No incremental/multi-tick search.** `findPath` runs to completion (bounded by `maxExpansions`) in
  one synchronous call; splitting a long search across ticks is a later concern if profiling ever
  shows it's needed.
- **No mob AI, goal selection, or `Game` wiring.** `findPath`/`isPathStale` are pure library
  functions; 136 (`mob-goal-selector`) is the first consumer.
- **No path smoothing/simplification.** The returned path is the raw sequence of grid cells;
  smoothing (removing redundant collinear nodes) is a future concern if a renderer/consumer needs it.

## Preconditions
- Change 134 (`navigation-grid-query`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/NavigationGridQuery.ts` (134) — `NavigationWorld`, `canStandAt`, `movementCost`.

## Proposed change
1. `src/simulation/AStarPathfinding.ts` (NEW):
   - `interface PathNode { x, y, z }`.
   - `interface PathfindOptions { height?, maxExpansions?, isCancelled?() }`.
   - `interface PathResult { nodes: PathNode[], reachedGoal: boolean, cancelled: boolean, expanded: number }`.
   - `findPath(world, start, goal, options?): PathResult | null` (`null` exactly when `start` itself
     is not standable — nothing to search from).
   - `isPathStale(world, path, fromIndex, height): boolean`.
2. No other file is edited.

## Compatibility and migration
- One new, additive file with no consumer yet. No schema/save-format change, no migration.

## Risks
- **Determinism regressing under a future refactor to a real binary heap.** Mitigation: 135 uses a
  simple linear-scan open set (acceptable for the bounded `maxExpansions` this change targets) with
  an explicit, tested insertion-order tiebreak; a future heap-based optimization would need to
  preserve the same tiebreak contract, documented in design.md.
- **Unbounded memory/time on a large or unreachable goal.** Mitigation: `maxExpansions` is a hard cap,
  defaulted conservatively and always honored; tests verify the bound actually triggers.
- **A stale-path false negative (declaring a path fresh when it's actually unwalkable).** Mitigation:
  `isPathStale` re-checks every remaining node via the same `movementCost` oracle `findPath` used, so
  it can never disagree with what `findPath` itself would compute for the same world state.

## Rollback strategy
One additive file with zero consumers; deleting it fully reverts the change with no other impact.

## Definition of Done
- `findPath`/`isPathStale` implemented per design.md/spec.md.
- Unit tests cover: a simple open-path success, an obstructed/unreachable-goal partial result, the
  `maxExpansions` bound actually triggering, cancellation mid-search, determinism (repeated identical
  calls produce identical results), the `start`-not-standable `null` case, and `isPathStale`'s
  fresh/stale determination.
- Full gate green: typecheck, lint, unit, build, e2e (21/21 — unaffected, no consumer wiring).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
