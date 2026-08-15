# Proposal: 164-piston-execution

## Problem
163 computes a fully-validated `PistonPushPlan` but never mutates anything. Nothing in this
codebase can yet actually apply one: move each block in the plan, destroy the terminator if the
plan calls for it, and report which positions need a neighbor update afterward. This change closes
that gap with a pure execution engine, plus the plain (non-sticky) `piston` block the engine now
has something real to execute against.

## Goals
- `PistonExecutionWorld<TState>` (injected, 154's seam, generic over an opaque block-state
  representation so this module needs no dependency on `BlockRegistry`/`BlockStateRegistry`):
  `getBlockState`/`setBlockState`/`clearBlockState`.
- `executePistonPush(world, plan, facing)`: applies an already-validated `PistonPushPlan` (163) —
  a no-op when `plan.canPush` is `false`; otherwise snapshots every `blocksToMove` source state
  *before* any write (defensive against a read ever observing a partial write), clears
  `blocksToDestroy` first, then writes each snapshot to its destination and clears its source, in
  the plan's existing farthest-first order — the order that guarantees every destination is already
  vacated by the time it's written.
- `pistonAffectedPositions(plan, x, y, z, facing)`: every position whose block identity changed —
  the piston's own position, each moved block's source and destination, and the destroyed
  terminator (if any) — for a future wiring change to feed into 156's `RedstonePropagator`. Empty
  for a blocked plan, since nothing changed.
- `pistonShouldBeExtended(powered)`/`pistonStateProperties(facing, extended)`: the piston's own
  extend/retract state, mirroring 162's consumer shape (`lampShouldBeLit` etc.) exactly, since the
  piston head's own state is just as directly power-driven as a lamp's.
- A `piston` block with `facing` (6-way, behavioral — determines push direction, observer's 161
  precedent) and `extended` (boolean) state (12 states), and a placing item. **Non-sticky only** —
  see Non-goals.

## Non-goals
- **No `sticky_piston` block or pull-on-retract behavior.** That is 165's
  (`slime-honey-move-groups`) separate titled scope, which owns sticky adjacency/pull rules
  specifically; adding it here would duplicate scope 165 is meant to own.
- **No loot generation for destroyed blocks.** `executePistonPush` clears a destroyed position; it
  does not consult 011's `LootTableRegistry` or 148's drop pipeline — that composition is a future
  wiring change's job, not duplicated here.
- **No actual `RedstonePropagator` composition** — `pistonAffectedPositions` returns the position
  list a caller needs; this change does not import or call 156 directly, keeping the dependency
  graph minimal (matches 162's precedent of avoiding an unneeded 154 dependency).
- **No `Game`/`World` wiring, no interaction, no extend/retract triggering wired to a real player
  action** — the same integration surface 154-163 deferred; the whole redstone arc remains
  additive/unconsumed.

## Preconditions
- Change 163 (`piston-move-planner`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/PistonMovePlanner.ts` (163, `PistonPushPlan`), `src/simulation/RedstoneSignal.ts`
  (154, `Direction`/`offsetInDirection`), `src/world/BlockRegistry.ts` +
  `src/inventory/ItemRegistry.ts`, `src/world/BlockPropertySchema.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `PISTON_SCHEMA` (`facing` 6-way, `extended` boolean);
   `BlockId.Piston = 48`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Piston = 48` placing it.
3. `src/simulation/PistonExecution.ts` (NEW): `PistonExecutionWorld`, `executePistonPush`,
   `pistonAffectedPositions`, `pistonShouldBeExtended`, `pistonStateProperties`.

## Compatibility and migration
- One additive block id and one additive item id plus one new simulation file. Requires the
  documented four block/item characterization-test updates (155/157-162's precedent, resuming after
  163's registry-free change). No `Game.ts` edit; no schema/save-format change.

## Risks
- **Applying moves in the wrong order would overwrite a not-yet-vacated block.** Mitigation:
  `executePistonPush` reuses 163's farthest-first `blocksToMove` ordering unchanged and snapshots
  every source state before any write; a dedicated test moves a multi-block chain and asserts the
  final world state is exactly as expected (no block lost or duplicated).
- **Marking the wrong positions dirty would leave a stale redstone state after a push.**
  Mitigation: `pistonAffectedPositions` is tested to return exactly the piston, every source, every
  destination, and the destroyed terminator (if any) — no more, no fewer.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: block/item registration + exact 12-state enumeration; `executePistonPush` as a
  no-op on a blocked plan, on an immediate-clear plan, on an immediate-destroy plan, and on a
  multi-block chain (asserting final per-position state, not just call counts);
  `pistonAffectedPositions` for a blocked plan (empty) and for each plan shape;
  `pistonShouldBeExtended` powered/unpowered; `pistonStateProperties` projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
