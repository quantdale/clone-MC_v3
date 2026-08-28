# Design: 165-slime-honey-move-groups

## Context/current state
- 163's `planPistonPush` is a strict linear walk; it has no concept of a block dragging a
  *different* position into motion. Sticky adjacency is a genuinely different shape — a connected
  component in a graph over 6-directional block adjacency, not a line — so this change adds a
  bounded breadth-first expansion (`expandStickyGroup`) rather than trying to squeeze it into 163's
  walk.
- 163's farthest-first `blocksToMove` ordering is correct *because* every block moves by the same
  one-block offset along a single axis. That fact generalizes directly to any set of positions that
  all move by the same offset (a sticky group always does — the whole cluster shifts by one block
  in the same direction, push or pull): sort by decreasing projection onto the movement direction,
  and a member's destination can only be occupied by another member whose projection is strictly
  greater (i.e., placed earlier by the sort), which is guaranteed to have already vacated it.
  `orderGroupForMove` is exactly this generalization, and it collapses to 163's own ordering when
  the group happens to be a straight line.
- Because the ordering generalizes, 164's `executePistonPush`/`pistonAffectedPositions` need *no
  changes at all* — they operate purely on a `PistonPushPlan`'s already-correct `blocksToMove`
  order, regardless of whether that plan came from a straight line (163) or an expanded group
  (165).
- Vanilla's real slime/honey rule: two *sticky* blocks drag each other only when they are the
  *same* kind (slime-slime or honey-honey); a sticky block dragging a *non-sticky* neighbor always
  succeeds (that neighbor becomes a passive passenger with no further reach of its own).
  `wouldDrag` encodes exactly this: `neighbor === null || neighbor === current`.
- 164 established that regular and sticky pistons share the exact same `facing`/`extended` state
  shape — `sticky_piston` reuses `PISTON_SCHEMA` unchanged (the third reuse of the
  one-schema-many-blocks pattern, after `POWERED_SCHEMA` and `OPEN_SCHEMA`). The only real
  difference between the two blocks is behavioral (does retracting pull anything back), which lives
  entirely in which function a future wiring change calls — not in the block's own state.

## Target state
- `src/simulation/PistonStickyGroups.ts` holding the sticky adjacency model
  (`StickyKind`/`StickyWorld`/`wouldDrag`), the bounded group-expansion algorithm
  (`expandStickyGroup`), the shared execution-order generalization (`orderGroupForMove`), and the
  two composition points (`extendPushPlanWithStickyGroup` for push, `planStickyRetract` for
  sticky-only pull) — each producing an ordinary 163 `PistonPushPlan`.
- A `sticky_piston` block/item reusing `PISTON_SCHEMA`.

## Invariants
- `wouldDrag(current, neighbor)` is `true` iff `neighbor === null || neighbor === current`.
- `expandStickyGroup` only expands a BFS frontier from positions whose own `stickyKind` is
  non-null; a dragged non-sticky passenger never itself pulls in further neighbors.
- `expandStickyGroup` classifies every newly-discovered neighbor with 163's `classifyPistonBlock`
  before considering it: an `'immovable'` neighbor fails the *entire* group (`canMove: false`,
  mirroring 163's whole-chain-blocked semantics); a `'terminates-clear'`/`'terminates-destroy'`
  neighbor is simply not dragged (it is not a failure, just not a passenger); only a `'movable'`
  neighbor that also satisfies `wouldDrag` joins the group.
- The group (including all seeds) never exceeds `maxGroupSize` positions; exceeding it fails the
  whole group with `blockedReason: 'exceeded-limit'`.
- `orderGroupForMove(positions, movementDirection)` sorts by strictly decreasing projection onto
  `movementDirection`'s unit offset, with ties broken by original (discovery) order for
  determinism — a stable sort.
- `extendPushPlanWithStickyGroup` returns `basePlan` completely unchanged when `basePlan.canPush` is
  `false`, or when no position in `basePlan.blocksToMove` has a non-null `stickyKind` (nothing to
  expand). Otherwise it returns a new plan with the same `blocksToDestroy` and a `blocksToMove`
  equal to `orderGroupForMove` applied to the expanded group.
- `planStickyRetract` reports `canPush: true` with empty `blocksToMove` (a genuine, successful
  no-op — not a failure) when the position directly in front of the piston is a
  `'terminates-clear'`/`'terminates-destroy'` neighbor (nothing to pull).

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
// BlockId.StickyPiston = 49; ItemId.StickyPiston = 49 — reuses PISTON_SCHEMA unchanged.

// src/simulation/PistonStickyGroups.ts (new)
export type StickyKind = 'slime' | 'honey';

export interface StickyWorld {
  stickyKind(x: number, y: number, z: number): StickyKind | null;
}

export function wouldDrag(current: StickyKind, neighbor: StickyKind | null): boolean;

export interface StickyGroupResult {
  readonly canMove: boolean;
  readonly positions: ReadonlyArray<readonly [number, number, number]>;
  readonly blockedReason?: 'immovable' | 'exceeded-limit';
  readonly blockedAt?: readonly [number, number, number];
}

export function expandStickyGroup(
  pistonWorld: PistonWorld,
  stickyWorld: StickyWorld,
  seeds: ReadonlyArray<readonly [number, number, number]>,
  maxGroupSize: number,
): StickyGroupResult;

export function orderGroupForMove(
  positions: ReadonlyArray<readonly [number, number, number]>,
  movementDirection: Direction,
): Array<readonly [number, number, number]>;

export function extendPushPlanWithStickyGroup(
  basePlan: PistonPushPlan,
  pistonWorld: PistonWorld,
  stickyWorld: StickyWorld,
  facing: Direction,
): PistonPushPlan;

export function planStickyRetract(
  pistonWorld: PistonWorld,
  stickyWorld: StickyWorld,
  x: number, y: number, z: number,
  facing: Direction,
): PistonPushPlan;
```

## Control/data flow
1. **Push (any piston)**: a future wiring change computes `basePlan = planPistonPush(...)` (163),
   then `finalPlan = extendPushPlanWithStickyGroup(basePlan, pistonWorld, stickyWorld, facing)`
   (165) before executing with 164's `executePistonPush(world, finalPlan, facing)`.
2. **Retract (sticky piston only)**: a future wiring change calls `plan =
   planStickyRetract(pistonWorld, stickyWorld, x, y, z, facing)`, then executes with
   `executePistonPush(world, plan, OPPOSITE_DIRECTION[facing])` — the pull moves everything one
   step *toward* the piston, the opposite of `facing`.
3. **Retract (regular piston)**: unchanged from 164 — no pull, the piston head simply retracts.

## Detailed behavior
- `expandStickyGroup`'s BFS starts from `seeds` (already included, not reclassified — 163 already
  validated them) and, for each queued position whose `stickyKind` is non-null, examines its six
  neighbors via 154's `DIRECTIONS`. A neighbor already in the group is skipped. Otherwise it is
  classified with 163's `classifyPistonBlock`: `'immovable'` fails the whole group immediately;
  `'terminates-clear'`/`'terminates-destroy'` is skipped (not a passenger, not a failure); `'movable'`
  is added only if `wouldDrag(current position's kind, neighbor's kind)` holds. Every addition
  checks the running total against `maxGroupSize`.
- `orderGroupForMove` computes each position's dot product with `movementDirection`'s
  `DIRECTION_OFFSETS` unit vector and sorts descending. Proof of safety: for any two group members
  `A` and `B` where `B = A + movementDirection` (i.e., `B` is exactly `A`'s destination), `B`'s
  projection is strictly greater than `A`'s (one more unit along the movement axis), so the sort
  always places `B` before `A` — `B` moves away before `A`'s write ever targets `B`'s original
  position. Positions with no such direct relationship don't conflict regardless of order.
- `extendPushPlanWithStickyGroup` seeds `expandStickyGroup` with `basePlan.blocksToMove` (163's
  linear chain) plus `maxGroupSize = PISTON_PUSH_LIMIT` (the *whole* group's limit, not the line's
  — vanilla's total-block cap applies to the combined structure). It reuses `basePlan.blocksToDestroy`
  unchanged (sticky expansion never discovers a new destroy terminator — a `'terminates-destroy'`
  neighbor is only ever produced by the original linear walk's own end, never by group expansion).
- `planStickyRetract` treats the single position directly in front of the piston as the sole seed:
  if it's `'immovable'`, the whole retract fails; if it's a terminator (nothing there to grab), the
  retract is a genuine success with an empty `blocksToMove` (the piston head still retracts, it
  just isn't holding anything); if it's `'movable'`, `expandStickyGroup` runs from that single seed
  and the result (if successful) is ordered by `OPPOSITE_DIRECTION[facing]` — the pull direction.
- `sticky_piston` reuses `PISTON_SCHEMA` exactly: same `facing`/`extended` shape as `piston`,
  because the distinguishing behavior (pull-on-retract) lives entirely in which function a caller
  invokes, not in any additional block state.

## Failure modes
- None of this module's functions throw for well-formed inputs; a blocked group or plan is
  represented in the returned result, not an exception.
- 007 throws at construction if the default state is missing — a test confirms `sticky_piston`
  shares `PISTON_SCHEMA` and its default with `piston`.

## Compatibility/migration
- One additive block id and one additive item id (reusing an existing schema instance); one new
  simulation file; the four documented characterization-test updates. No `Game.ts` edit; no
  schema/save-format change.

## Performance/resource constraints
- `expandStickyGroup` is bounded: at most `maxGroupSize + 1` positions ever enter the queue (the
  same "prove the bound, then stop" discipline 163 uses), each contributing at most 6 neighbor
  checks — O(`maxGroupSize`) `PistonWorld`/`StickyWorld` calls total, independent of world size.

## Testing seams
- The whole module is tested with plain coordinates and `PistonWorld`/`StickyWorld` object
  literals — no `World` of any kind, matching 163/164's identical seam.

## Observability/debugging
- `StickyGroupResult`'s `blockedReason`/`blockedAt` mirror 163's `PistonPushPlan` shape exactly, so
  a rejected group's cause is just as explicit as a rejected linear push's.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/PistonStickyGroups.ts` (new).
- Tests: `tests/unit/PistonStickyGroups.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Folding sticky expansion into 163's `planPistonPush` directly**: rejected — that would couple a
  linear-walk algorithm to a graph-expansion one, and would apply group semantics even to plain
  pistons pushing non-sticky lines, where it is always a no-op anyway; keeping them separate lets
  163 stay exactly as simple as it already is, with 165 composing on top only when needed.
- **A per-pair compatibility table instead of `current === neighbor`**: rejected — with only two
  kinds (`'slime' | 'honey'`), equality already expresses vanilla's real rule exactly; a table would
  be strictly more general than the domain requires.
- **Re-deriving execution order from scratch for groups instead of generalizing 163's rule**:
  rejected — see Detailed behavior's proof; the projection sort is a strict generalization that
  collapses to 163's own rule for a line, so 164's `executePistonPush` needed zero changes.
- **Adding `slime_block`/`honey_block` `BlockId`s now**: rejected — see the proposal's Non-goals;
  `StickyWorld` is injected, so no real block is needed to test or use this module.

## Downstream dependencies
- A future wiring change composes `planPistonPush` (163) → `extendPushPlanWithStickyGroup`/
  `planStickyRetract` (165) → `executePistonPush`/`pistonAffectedPositions` (164) →
  156's `RedstonePropagator`, and decides per-piston-type whether retract calls `planStickyRetract`
  or does nothing.
- This closes the piston sub-arc (163-165); 166 (`hopper-transfer`) moves into a different
  redstone-adjacent mechanic (timed item transfer) entirely.
