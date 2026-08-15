# Design: 135-a-star-pathfinding

## Context/current state
- 134 `NavigationGridQuery` provides `canStandAt`/`movementCost` — pure, per-cell occupancy/cost
  oracles over a `NavigationWorld` (`getCollisionShape`/`getBlockId`).
- Nothing searches a path. No search/priority-queue code exists anywhere in the codebase.

## Target state
- `src/simulation/AStarPathfinding.ts` provides a bounded, deterministic, cancellable A* over a
  6-directional voxel grid, plus a stale-path guard, both built only on 134's public API.

## Invariants
- **Determinism**: for identical `(world, start, goal, options)` (and a `world` whose query answers
  don't change during the call), `findPath` always returns bit-identical `PathResult.nodes`. This
  holds because: (a) neighbors are always explored in a fixed order (`+x, -x, +z, -z, +y, -y`), and
  (b) the open set's "pop lowest cost" step breaks ties by strictly increasing insertion sequence
  number, never by incidental `Map`/array iteration order.
- **Boundedness**: `findPath` performs at most `maxExpansions` node expansions; it always terminates.
- **Admissible/consistent heuristic**: `h(n) = |n.x-goal.x| + |n.y-goal.y| + |n.z-goal.z|` (Manhattan
  distance). Since every edge cost is `>= 1` (a step always costs `1 + nodeCost(destination)`, and
  `nodeCost(Open) = 0`) and a single grid step changes Manhattan distance by exactly `1`, `h` never
  overestimates the true remaining cost and never violates `h(n) <= edgeCost(n, n') + h(n')` —
  standard A* optimality/termination guarantees hold.
- **Best-effort partial result**: whenever the goal is not reached (budget exhausted, open set
  emptied, or cancelled), `findPath` returns the path to the expanded node with the lowest `h` seen
  so far (a documented approximation of vanilla's own partial-path behavior), with `reachedGoal:
  false`.
- **`null` only for an unstandable start**: `findPath` returns `null` exactly when
  `!canStandAt(world, start.x, start.y, start.z, height)` — there is nothing to search from.
- **Stale-guard soundness**: `isPathStale` uses the exact same `movementCost` oracle `findPath` used
  to build the path, so it can never falsely call a still-walkable path "fresh" or vice versa for
  the given world snapshot.

## API and data model
```ts
export interface PathNode { x: number; y: number; z: number; }

export interface PathfindOptions {
  height?: number;          // default 2
  maxExpansions?: number;   // default 2048
  isCancelled?: () => boolean;
}

export interface PathResult {
  nodes: PathNode[];        // start..(goal or best-effort closest node), inclusive
  reachedGoal: boolean;
  cancelled: boolean;
  expanded: number;         // number of nodes popped from the open set
}

export function findPath(
  world: NavigationWorld,
  start: PathNode,
  goal: PathNode,
  options?: PathfindOptions,
): PathResult | null;

export function isPathStale(
  world: NavigationWorld,
  path: PathResult,
  fromIndex: number,
  height: number,
): boolean;
```

## Control/data flow
1. `findPath`:
   a. If `!canStandAt(world, start.x, start.y, start.z, height)`, return `null`.
   b. Initialize an open set with `start` (`g=0`, `h=manhattan(start, goal)`, `f=g+h`,
      `seq=0`), a `cameFrom` map, a `bestG` map (best known `g` per cell key), and
      `bestByH` tracking the lowest-`h` node seen (initially `start`).
   c. Loop until the open set is empty:
      i. If `expanded >= maxExpansions`: stop (budget exhausted case).
      ii. If `options.isCancelled?.()` is `true`: stop (cancelled case).
      iii. Pop the open-set entry with the lowest `f`, ties broken by lowest `seq`
           (insertion order); increment `expanded`.
      iv. If this node equals `goal` (`x`/`y`/`z` all equal): reconstruct via `cameFrom` and return
          `{ nodes, reachedGoal: true, cancelled: false, expanded }`.
      v. Update `bestByH` if this node's `h` is lower than the tracked best.
      vi. For each of the 6 fixed neighbor offsets (in the fixed order above): compute
          `movementCost(world, nx, ny, nz, height)`; skip if `Infinity`; else `tentativeG = g + 1 +
          cost`; if better than any previously recorded `g` for that cell, record it, set
          `cameFrom`, and push `{node, g: tentativeG, h, f, seq: nextSeq++}` onto the open set.
   d. On loop exit without reaching the goal (budget, cancellation, or exhaustion): reconstruct the
      path to `bestByH`'s node via `cameFrom` and return `{ nodes, reachedGoal: false, cancelled:
      <true iff stopped by (ii)>, expanded }`.
2. `isPathStale(world, path, fromIndex, height)`: for each node in `path.nodes.slice(fromIndex)`,
   compute `movementCost(world, node.x, node.y, node.z, height)`; return `true` as soon as one is
   `Infinity`, else `false`.

## Detailed behavior
- The 6 fixed neighbor offsets, in exploration order: `(+1,0,0)`, `(-1,0,0)`, `(0,0,+1)`,
  `(0,0,-1)`, `(0,+1,0)`, `(0,-1,0)`. This order is part of the determinism contract (design
  Invariants) and must not be reordered without documenting the behavior change.
- The open set is a plain array; "pop lowest `f`, tie by `seq`" is a linear scan
  (`O(openSet.length)` per pop) — acceptable given `maxExpansions` bounds total work, and simpler to
  keep provably deterministic than a heap (see Rejected Alternatives).
- `bestG` (best known `g` per cell) prevents re-expanding a cell via a worse path; a neighbor is only
  pushed when its `tentativeG` improves on any previously recorded `g` for that cell (or no entry
  exists yet).
- Path reconstruction walks `cameFrom` backward from the target node to `start`, then reverses, so
  `nodes[0] === start` and `nodes[nodes.length - 1]` is either `goal` (`reachedGoal: true`) or the
  best-effort closest node reached.

## Failure modes
- `findPath` returns `null` only for an unstandable `start`; it never throws for a well-formed
  `NavigationWorld`.
- An unreachable `goal` (e.g. fully walled off) exhausts the open set before `maxExpansions`;
  `findPath` returns the best-effort partial path (`reachedGoal: false, cancelled: false`), not an
  error.
- `isCancelled` throwing propagates unmodified (no error handling added around it).

## Compatibility/migration
- One new, additive file; no edits to `NavigationGridQuery`/`VoxelShape`/`BlockRegistry`/`Game`. No
  schema/save-format change; no migration.

## Performance/resource constraints
- Bounded by `maxExpansions` node expansions; each expansion does O(1) neighbor generation (6 fixed
  offsets) plus an O(openSet.length) pop-min scan, so total work is `O(maxExpansions^2)` in the
  worst case — acceptable for the small, bounded default and documented as the reason a heap wasn't
  used (simplicity/determinism over asymptotic optimality at this scale).

## Testing seams
- Both functions depend only on a hand-built `NavigationWorld` fixture (reused from 134's test
  style) — no `Game`/`World`/entity manager needed.

## Observability/debugging
- `PathResult.expanded`/`reachedGoal`/`cancelled` directly expose why a search ended the way it did,
  without needing to add logging.

## Affected files/symbols
- `src/simulation/AStarPathfinding.ts` (new).
- Tests: `tests/unit/AStarPathfinding.test.ts` (new).

## Rejected alternatives
- **A binary-heap open set**: rejected — asymptotically better, but a hand-rolled heap's tie-breaking
  under equal keys is easy to get subtly non-deterministic (insertion-dependent internal reshuffling);
  the linear-scan array with an explicit `seq` tiebreak is simpler to prove and test deterministic,
  and `maxExpansions` already bounds worst-case cost to an acceptable constant for this program's
  current scope (no large open-world pathing yet).
- **8-directional (diagonal) movement**: rejected for this change (see proposal Non-goals) — would
  require a different (non-Manhattan) heuristic and diagonal-corner-cutting rules against
  `canStandAt`; deferred to a future refinement.
- **Incremental/multi-tick search**: rejected — no profiling evidence yet that a single bounded
  synchronous call is too slow for this program's scope; can be added later without changing
  `findPath`'s external contract (a caller could wrap it in its own tick budget).

## Downstream dependencies
- 136 (`mob-goal-selector`) will be the first real consumer, calling `findPath` from a goal's
  execution step and `isPathStale` to decide whether to recompute.
