/**
 * Piston execution (164): applies an already-validated `PistonPushPlan` (163) against an injected,
 * generic `PistonExecutionWorld<TState>` — the first module in the piston sub-arc to actually
 * mutate anything. Closes 163's plan into an effect.
 *
 * Generic over `TState` (the block-state representation itself) rather than importing
 * `BlockStateRegistry`/`BlockStateId`, so this module never needs to know what a block state
 * actually looks like in the caller's real `World` — it only ever copies opaque values between
 * positions, the same "move the value, don't interpret it" discipline that keeps 022's
 * `PalettedContainer<T>` generic.
 *
 * `executePistonPush` reuses 163's `blocksToMove` ordering (farthest-from-the-piston-first)
 * unchanged: every destination is guaranteed already vacated by the time it is written, because the
 * farthest block's destination is the plan's own (already-cleared) terminator slot and every other
 * block's destination is the position the previous move just vacated. `pistonAffectedPositions` is
 * a pure derivation over the same plan for a future wiring change to feed into 156's
 * `RedstonePropagator` — this module never calls 156 itself.
 *
 * No `sticky_piston`/pull-on-retract behavior (165's separate titled scope), no loot generation for
 * destroyed blocks (011/148's pipeline, not duplicated here), no `Game`/`World` wiring — see
 * `openspec/changes/164-piston-execution/design.md`.
 */
import { offsetInDirection, type Direction } from './RedstoneSignal';
import type { PistonPushPlan } from './PistonMovePlanner';

/** The caller-supplied, state-agnostic world surface this module needs (injected, 154's seam). */
export interface PistonExecutionWorld<TState> {
  getBlockState(x: number, y: number, z: number): TState;
  setBlockState(x: number, y: number, z: number, state: TState): void;
  clearBlockState(x: number, y: number, z: number): void;
}

/**
 * Apply `plan` to `world`. A no-op — no `PistonExecutionWorld` method is called at all — when
 * `plan.canPush` is `false`. Otherwise: every source state is read before any write (a
 * snapshot-then-apply discipline, independent of whatever caching or lazy behavior the caller's
 * real `World` might have), any destroyed terminator is cleared first, then each snapshot is
 * written to its destination and its source is cleared, in the plan's existing farthest-first
 * order.
 */
export function executePistonPush<TState>(
  world: PistonExecutionWorld<TState>,
  plan: PistonPushPlan,
  facing: Direction,
): void {
  if (!plan.canPush) return;

  const snapshot = plan.blocksToMove.map(([sx, sy, sz]) => {
    const [dx, dy, dz] = offsetInDirection(sx, sy, sz, facing);
    return {
      from: [sx, sy, sz] as const,
      to: [dx, dy, dz] as const,
      state: world.getBlockState(sx, sy, sz),
    };
  });

  for (const [dx, dy, dz] of plan.blocksToDestroy) {
    world.clearBlockState(dx, dy, dz);
  }

  for (const entry of snapshot) {
    world.setBlockState(entry.to[0], entry.to[1], entry.to[2], entry.state);
    world.clearBlockState(entry.from[0], entry.from[1], entry.from[2]);
  }
}

/**
 * Every position whose block identity changed as a result of applying `plan`: the piston's own
 * position, each moved block's source and computed destination, and every destroyed position.
 * Returns `[]` for a blocked plan, since nothing changed. Performs no `PistonExecutionWorld` calls
 * itself — purely a derivation over `plan`, for a future wiring change to mark dirty on 156's
 * `RedstonePropagator`.
 */
export function pistonAffectedPositions(
  plan: PistonPushPlan,
  x: number,
  y: number,
  z: number,
  facing: Direction,
): Array<readonly [number, number, number]> {
  if (!plan.canPush) return [];

  const positions: Array<readonly [number, number, number]> = [[x, y, z]];
  for (const [sx, sy, sz] of plan.blocksToMove) {
    positions.push([sx, sy, sz]);
    positions.push(offsetInDirection(sx, sy, sz, facing));
  }
  for (const pos of plan.blocksToDestroy) {
    positions.push(pos);
  }
  return positions;
}

/** Whether a piston should be extended: the same "active exactly when powered" rule 162's consumers use. */
export function pistonShouldBeExtended(powered: boolean): boolean {
  return powered;
}

/** Project a piston's full state into the property record `PISTON_SCHEMA` enumerates. */
export function pistonStateProperties(
  facing: Direction,
  extended: boolean,
): Record<string, boolean | string> {
  return { facing, extended };
}
