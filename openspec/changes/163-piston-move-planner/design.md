# Design: 163-piston-move-planner

## Context/current state
- 154-162 all operate on signal strengths or booleans read into a block. This change is the first
  to reason about *block movement* — a fundamentally different domain (which positions would a
  push touch, in what order, does it succeed at all) that only borrows 154's direction vocabulary
  (`Direction`/`offsetInDirection`), not its signal-strength model.
- 154 established the "signal model first, block second" ordering (154 added zero blocks; 155 added
  the wire block once the model existed). This change repeats that ordering for pistons: 163 is the
  push-chain *algorithm*, with no `Piston` block yet; 164 (`piston-execution`) is where a real block
  appears because something will finally need to move against it.
- Every prior redstone module injects its world surface (`RedstonePowerSource`, `WireWorld`,
  `WirePowerStore`) rather than importing `World`/`BlockRegistry` directly. This change continues
  that seam with `PistonWorld`.

## Target state
- `src/simulation/PistonMovePlanner.ts` holding `PistonWorld`, `classifyPistonBlock`,
  `PISTON_PUSH_LIMIT`, `PistonPushPlan`, and `planPistonPush` — a pure function from a starting
  position, a facing, and an injected world surface to a fully-resolved plan, with no side effects
  and no block registry footprint.

## Invariants
- `classifyPistonBlock` returns `'immovable'` whenever `world.isImmovable(x, y, z)` is `true`,
  **regardless** of what `isPushable`/`isDestroyedByPush` report for the same position — immovable
  always takes precedence, so a misbehaving world can never cause a chain to treat an immovable
  position as movable.
- Given `isImmovable(x, y, z) === false`: `classifyPistonBlock` returns `'movable'` when
  `isPushable(x, y, z)` is `true`; otherwise it returns `'terminates-destroy'` when
  `isDestroyedByPush(x, y, z)` is `true`, else `'terminates-clear'`.
- `planPistonPush` walks positions strictly in `offsetInDirection` order starting one block from
  `(x, y, z)` in `facing`; it never reads a position before establishing it via that walk.
- `blocksToMove` is ordered farthest-from-the-piston-first — the order 164 will need to apply moves
  without a not-yet-moved block overwriting a not-yet-vacated one.
- `blocksToDestroy` contains at most one entry: the single terminating position, only when it
  classified as `terminates-destroy`. It is never populated when the chain is blocked
  (`canPush === false`).
- Exceeding `PISTON_PUSH_LIMIT` movable positions in a row (no terminator or immovable block found
  within the limit) blocks the push with `blockedReason: 'exceeded-limit'`; an immovable position
  found at any point blocks the push with `blockedReason: 'immovable'`. Both leave `blocksToMove`
  and `blocksToDestroy` empty — a blocked push moves and destroys nothing at all.

## API and data model
```ts
// src/simulation/PistonMovePlanner.ts (new)
export interface PistonWorld {
  /** True if this position can never be pushed at all (obsidian, bedrock, a block entity, ...). */
  isImmovable(x: number, y: number, z: number): boolean;
  /** True if this position is an ordinary movable block that continues the chain. */
  isPushable(x: number, y: number, z: number): boolean;
  /** Only consulted when neither of the above is true: does this terminating block get destroyed? */
  isDestroyedByPush(x: number, y: number, z: number): boolean;
}

export type PistonBlockClassification =
  | 'movable'
  | 'terminates-clear'
  | 'terminates-destroy'
  | 'immovable';

export function classifyPistonBlock(
  world: PistonWorld, x: number, y: number, z: number,
): PistonBlockClassification;

export const PISTON_PUSH_LIMIT = 12;

export type PistonBlockedReason = 'immovable' | 'exceeded-limit';

export interface PistonPushPlan {
  readonly canPush: boolean;
  readonly blocksToMove: ReadonlyArray<readonly [number, number, number]>;
  readonly blocksToDestroy: ReadonlyArray<readonly [number, number, number]>;
  readonly blockedReason?: PistonBlockedReason;
  readonly blockedAt?: readonly [number, number, number];
}

export function planPistonPush(
  world: PistonWorld,
  x: number,
  y: number,
  z: number,
  facing: Direction, // 154's six-way Direction — pistons can point up/down
): PistonPushPlan;
```

## Control/data flow
1. A future wiring change detects a piston should push (a `powered` transition, out of this
   change's scope) and calls `planPistonPush(world, pistonX, pistonY, pistonZ, facing)`.
2. If `plan.canPush` is `false`, the caller does nothing further — no blocks move or are destroyed.
3. If `plan.canPush` is `true`, a future 164 applies `plan.blocksToMove` in order (farthest first)
   and removes/drops-loot for `plan.blocksToDestroy` — both are this change's output, not its
   responsibility to apply.

## Detailed behavior
- The walk is a bounded loop of at most `PISTON_PUSH_LIMIT + 1` iterations: enough to either find a
  terminator/immovable block within the limit, or to prove the `(PISTON_PUSH_LIMIT + 1)`th position
  is also movable (which is exactly the exceeded-limit condition) — never unbounded, matching 049's
  "budgeted, not recursive" discipline.
- `classifyPistonBlock`'s immovable-precedence rule exists specifically so a `PistonWorld`
  implementation that (incorrectly) reports a position as both immovable and pushable can never
  produce a chain that treats it as movable — the safer of the two readings always wins, mirroring
  154's `clampSignal`'s "the safe interpretation wins over a misbehaving caller" discipline.
- `blocksToDestroy` holds at most one position because only the single block that terminates the
  chain is ever destroyed by a push — every vanilla push destroys at most the one block it
  encounters past the last movable block, never more.

## Failure modes
- `planPistonPush` never throws for well-formed coordinate/facing inputs; a blocked chain is
  represented in the returned plan (`canPush: false`), not an exception.
- `classifyPistonBlock` never throws; it is a total function on any boolean triple its `PistonWorld`
  returns.

## Compatibility/migration
- One new file; zero registry changes; zero characterization-test updates (the first redstone-arc
  change with no `BlockRegistry.ts`/`ItemRegistry.ts` touch). No `Game.ts` edit; no schema/
  save-format change.

## Performance/resource constraints
- `planPistonPush` is O(`PISTON_PUSH_LIMIT`) — at most 13 `PistonWorld` calls per invocation,
  independent of world size.

## Testing seams
- The whole module is tested with plain coordinates and a `PistonWorld` object literal — no `World`
  of any kind, matching every prior redstone module's injected-seam pattern.

## Observability/debugging
- `PistonPushPlan` is itself the full observable result — `blockedReason`/`blockedAt` make a
  rejected push's cause explicit rather than only reporting a boolean.

## Affected files/symbols
- `src/simulation/PistonMovePlanner.ts` (new).
- Tests: `tests/unit/PistonMovePlanner.test.ts` (new). No characterization-test updates.

## Rejected alternatives
- **A single `isBlocking` predicate instead of three (`isImmovable`/`isPushable`/
  `isDestroyedByPush`)**: rejected — vanilla genuinely distinguishes three outcomes (keep pushing,
  stop cleanly, stop and destroy), and collapsing them would force the caller to pre-compute which
  case applies outside this module, defeating the point of the injected seam.
- **Letting `isPushable` take precedence over `isImmovable`**: rejected — see Invariants; the safer
  reading must win for a defensively-correct planner, exactly as 154's `clampSignal` always prefers
  the safe interpretation over a misbehaving caller's raw input.
- **Adding a `Piston` `BlockId` now**: rejected — no titled change before 164 needs a real piston
  block to exist; adding one here would be scope creep with no present consumer, breaking the same
  "algorithm first, block second" ordering 154 established.
- **Ordering `blocksToMove` nearest-to-farthest**: rejected — applying moves in that order would
  have 164 overwrite a block before its own occupant vacated, the opposite of vanilla's actual
  application order.

## Downstream dependencies
- 164 (`piston-execution`) consumes `PistonPushPlan` to actually mutate `World` state and adds the
  real `Piston` `BlockId`/`ItemId`.
- 165 (`slime-honey-move-groups`) extends this section's chain-planning ideas to sticky
  adjacency/pull behavior, a distinct titled scope this change does not touch.
