# Design: 164-piston-execution

## Context/current state
- 163 produces a fully-validated `PistonPushPlan` (which positions move, in what order, which one
  is destroyed) but performs no mutation at all. This change is the first to actually write world
  state in the piston sub-arc, closing 163's plan into an effect.
- 163's `blocksToMove` is already ordered farthest-from-the-piston-first specifically so that order
  is safe to apply directly: the farthest block's destination is the (now-cleared) terminator slot,
  and every other block's destination is the position the previous move just vacated. This change
  does not re-derive that invariant; it reuses it exactly as 163 produced it.
- Every prior redstone module injects its world surface. This module's surface
  (`PistonExecutionWorld<TState>`) is generic over the state representation itself — unlike
  `RedstonePowerSource`/`WireWorld` (which query specific typed facts), this module actually **moves
  opaque state**, so it must stay parametric over whatever a block state actually is in the caller's
  real `World`, without importing `BlockStateRegistry` or coupling to its `BlockStateId` type.
- 161 established that `facing` is 6-way when a block's direction is genuinely behavioral in more
  than the horizontal plane. A piston's push direction is exactly that (pistons can point up/down in
  vanilla), so `PISTON_SCHEMA` reuses the same 6-way pattern.

## Target state
- `src/simulation/PistonExecution.ts` holding `PistonExecutionWorld<TState>`, `executePistonPush`,
  `pistonAffectedPositions`, `pistonShouldBeExtended`, and `pistonStateProperties`; a `piston` block
  (12 states) and its placing item.

## Invariants
- `executePistonPush` is a no-op — no `PistonExecutionWorld` method is called at all — when
  `plan.canPush` is `false`.
- Every source state is read via `getBlockState` *before* any `setBlockState`/`clearBlockState` call
  for this same invocation — a snapshot-then-apply discipline, not an interleaved read-write, so no
  write can ever be observed by a subsequent read within the same execution.
- Writes apply in `plan.blocksToMove`'s existing order (farthest-first); `blocksToDestroy` clears
  happen before any move-write, since a destroyed terminator's position is always some later move's
  destination.
- `pistonAffectedPositions` returns `[]` when `plan.canPush` is `false` (nothing changed); otherwise
  it returns the piston's own position, then for each moved block its source *and* its computed
  destination (`offsetInDirection(source, facing)`), then every destroyed position — with no
  position omitted and no extras.
- `pistonShouldBeExtended(powered)` is exactly the identity function on `powered` (162's consumer
  rule, applied here to the piston's own extend/retract state).

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const PISTON_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west', 'up', 'down'] },
  { kind: 'boolean', name: 'extended' },
]);
// BlockId.Piston = 48; ItemId.Piston = 48

// src/simulation/PistonExecution.ts (new)
export interface PistonExecutionWorld<TState> {
  getBlockState(x: number, y: number, z: number): TState;
  setBlockState(x: number, y: number, z: number, state: TState): void;
  clearBlockState(x: number, y: number, z: number): void;
}

export function executePistonPush<TState>(
  world: PistonExecutionWorld<TState>,
  plan: PistonPushPlan,
  facing: Direction,
): void;

export function pistonAffectedPositions(
  plan: PistonPushPlan,
  x: number, y: number, z: number,
  facing: Direction,
): Array<readonly [number, number, number]>;

export function pistonShouldBeExtended(powered: boolean): boolean;
export function pistonStateProperties(
  facing: Direction, extended: boolean,
): Record<string, boolean | string>;
```

## Control/data flow
1. A future wiring change computes `plan = planPistonPush(world, pistonX, pistonY, pistonZ,
   facing)` (163).
2. If `plan.canPush`, it calls `executePistonPush(world, plan, facing)` to apply the move, then
   `pistonAffectedPositions(plan, pistonX, pistonY, pistonZ, facing)` to learn which positions to
   mark dirty on 156's `RedstonePropagator` (composition left to that future change).
3. The caller separately updates the piston's own stored state via `pistonStateProperties(facing,
   pistonShouldBeExtended(powered))` — the piston's own position is never itself a member of
   `plan.blocksToMove`/`blocksToDestroy` (163's walk starts one block away from the piston), so this
   is always a distinct, small write the caller performs directly rather than something
   `executePistonPush` does on the caller's behalf.

## Detailed behavior
- Snapshot-then-apply: `executePistonPush` first builds an array of `{ from, to, state }` by calling
  `getBlockState` once per `blocksToMove` entry, computing each `to` via `offsetInDirection(from,
  facing)`. Only after every source is read does it perform any write. This is stricter than
  strictly necessary given 163's ordering guarantee (a strictly source-then-immediate-write loop
  would also be correct, since farthest-first ordering already prevents self-overwrite), but the
  snapshot makes that correctness independent of the injected `getBlockState` implementation ever
  observing an in-progress write — a caller's real `World` may have caching or lazy-section
  behavior this module has no way to audit, so the defensive read-everything-first order costs one
  array allocation and removes an entire class of implementation-dependent bugs.
- `blocksToDestroy` is cleared before any move-write specifically because — when present — it is
  always exactly the position the farthest moved block's destination equals (163's contract: the
  chain terminates at the position immediately past the last movable block). Clearing it first is
  therefore always safe and is never later read by this same execution (nothing in `blocksToMove`
  reads a `blocksToDestroy` position; a moved block's *source* is always a distinct, already-movable
  position 163 already classified separately).
- `pistonAffectedPositions` is a pure derivation over the same plan and facing already available to
  `executePistonPush` — it performs no `PistonExecutionWorld` calls itself, so it can be computed
  before, after, or independently of actually executing the push.
- The piston block is **non-sticky only**: `extended` is a plain boolean with no adhesion behavior.
  A `sticky_piston` block and its pull-on-retract rule are 165's separate titled scope.

## Failure modes
- `executePistonPush` never throws for a well-formed plan; a blocked plan (`canPush: false`) is
  handled as a documented no-op, not an exception.
- `pistonAffectedPositions` never throws; it returns `[]` for a blocked plan.
- 007 throws at construction if the default state is missing — a test asserts the exact 12-state
  enumeration and the `{facing: north, extended: false}` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; the four documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- `executePistonPush` is O(`plan.blocksToMove.length`), bounded by 163's `PISTON_PUSH_LIMIT` (at
  most 12 moves plus one destroy per invocation). `pistonAffectedPositions` is the same bound times
  two (source and destination per moved block) plus a small constant.

## Testing seams
- `executePistonPush`/`pistonAffectedPositions` are tested with a plain in-memory
  `Map<string, TState>`-backed `PistonExecutionWorld` — no `World`/`BlockRegistry` of any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `pistonStateProperties` is the standard stateful-block record.
- `pistonAffectedPositions`'s explicit position list makes "what changed" auditable without needing
  to diff the whole world.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/PistonExecution.ts` (new).
- Tests: `tests/unit/PistonExecution.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Reading and writing each block in one interleaved loop (no snapshot)**: rejected — see Detailed
  behavior; while 163's ordering makes this technically safe today, the snapshot removes the
  dependency on that ordering ever being audited by this module again, at negligible cost.
- **Having `executePistonPush` also move/toggle the piston's own `extended` state**: rejected — the
  piston's own position is never part of the plan (163's walk starts one block away), so folding it
  in would require this function to take extra piston-specific parameters for a single-line write
  the caller can already perform directly with `pistonStateProperties`.
- **Adding `sticky_piston` alongside `piston` now**: rejected — 165 is titled specifically for
  sticky adjacency/pull rules; adding the block here without its behavior would be a half-finished
  feature, and duplicating it later would be wasted work.
- **Composing 156's `RedstonePropagator` directly inside this module**: rejected — keeps the
  dependency graph minimal (matches 162's identical reasoning for not importing 154 unnecessarily);
  `pistonAffectedPositions` gives a future wiring change everything it needs to do that composition
  itself.

## Downstream dependencies
- A future wiring change composes `planPistonPush` (163) → `executePistonPush`/
  `pistonAffectedPositions` (164) → 156's `RedstonePropagator.markNeighborsDirty` for each affected
  position, and updates the piston's own stored state.
- 165 (`slime-honey-move-groups`) extends this sub-arc with sticky adjacency and pull-on-retract,
  reusing this change's `PistonExecutionWorld`/`executePistonPush` shape where it can.
