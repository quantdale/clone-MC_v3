/**
 * Piston move planner (163): a pure push-chain planner — given a starting position, a facing, and
 * an injected `PistonWorld`, computes whether a push succeeds, which positions would move (and in
 * what order), and which single position (if any) would be destroyed instead of moved.
 *
 * This is the first module in the "Redstone and automation" section to reason about *block
 * movement* rather than signal strength; it borrows only 154's direction vocabulary
 * (`Direction`/`offsetInDirection`), not its signal-strength model. It also repeats 154's own
 * "signal model first, block second" ordering: no `Piston` `BlockId`/`ItemId` exists yet, because
 * nothing needs one to execute against until a future piston-execution change.
 *
 * No actual block movement/placement/destruction (this module never mutates anything), no sticky
 * pull-on-retract behavior (a distinct titled scope), no piston extend/retract triggering, no
 * `Game`/`World` wiring — see `openspec/changes/163-piston-move-planner/design.md`.
 */
import { offsetInDirection, type Direction } from './RedstoneSignal';

/** The caller-supplied world surface this module needs (injected, 154's seam). */
export interface PistonWorld {
  /** True if this position can never be pushed at all (obsidian, bedrock, a block entity, ...). */
  isImmovable(x: number, y: number, z: number): boolean;
  /** True if this position is an ordinary movable block that continues the chain. */
  isPushable(x: number, y: number, z: number): boolean;
  /** Only consulted when neither of the above is true: does this terminating block get destroyed? */
  isDestroyedByPush(x: number, y: number, z: number): boolean;
}

/** How a single position in a push chain resolves. */
export type PistonBlockClassification =
  | 'movable'
  | 'terminates-clear'
  | 'terminates-destroy'
  | 'immovable';

/**
 * Classify one position for a push chain. `isImmovable` always takes precedence — even for a
 * misbehaving `PistonWorld` that also reports `isPushable` true for the same position — so a chain
 * can never treat an immovable position as movable.
 */
export function classifyPistonBlock(
  world: PistonWorld,
  x: number,
  y: number,
  z: number,
): PistonBlockClassification {
  if (world.isImmovable(x, y, z)) return 'immovable';
  if (world.isPushable(x, y, z)) return 'movable';
  return world.isDestroyedByPush(x, y, z) ? 'terminates-destroy' : 'terminates-clear';
}

/** The maximum number of movable positions a single push may include (vanilla's push limit). */
export const PISTON_PUSH_LIMIT = 12;

/** Why a push was blocked entirely. */
export type PistonBlockedReason = 'immovable' | 'exceeded-limit';

/** The fully-resolved outcome of a single push attempt. */
export interface PistonPushPlan {
  readonly canPush: boolean;
  /** Ordered farthest-from-the-start-position-first — the order moves must be applied. */
  readonly blocksToMove: ReadonlyArray<readonly [number, number, number]>;
  /** At most one entry: the single terminating position, only when it terminated by destruction. */
  readonly blocksToDestroy: ReadonlyArray<readonly [number, number, number]>;
  readonly blockedReason?: PistonBlockedReason;
  readonly blockedAt?: readonly [number, number, number];
}

/**
 * Walk outward from `(x, y, z)` in `facing`, classifying each position in turn, and resolve the
 * full push plan. Bounded to at most `PISTON_PUSH_LIMIT + 1` iterations — enough to either find a
 * terminator/immovable block within the limit, or to prove the position just past the limit is
 * also movable (the exceeded-limit condition) — never unbounded.
 */
export function planPistonPush(
  world: PistonWorld,
  x: number,
  y: number,
  z: number,
  facing: Direction,
): PistonPushPlan {
  const movable: Array<readonly [number, number, number]> = [];
  let cursor = offsetInDirection(x, y, z, facing);

  for (let i = 0; i < PISTON_PUSH_LIMIT + 1; i++) {
    const [cx, cy, cz] = cursor;
    const classification = classifyPistonBlock(world, cx, cy, cz);

    if (classification === 'immovable') {
      return {
        canPush: false,
        blocksToMove: [],
        blocksToDestroy: [],
        blockedReason: 'immovable',
        blockedAt: [cx, cy, cz],
      };
    }
    if (classification === 'terminates-clear') {
      return { canPush: true, blocksToMove: movable.slice().reverse(), blocksToDestroy: [] };
    }
    if (classification === 'terminates-destroy') {
      return {
        canPush: true,
        blocksToMove: movable.slice().reverse(),
        blocksToDestroy: [[cx, cy, cz]],
      };
    }

    movable.push([cx, cy, cz]);
    if (movable.length > PISTON_PUSH_LIMIT) {
      return {
        canPush: false,
        blocksToMove: [],
        blocksToDestroy: [],
        blockedReason: 'exceeded-limit',
        blockedAt: [cx, cy, cz],
      };
    }
    cursor = offsetInDirection(cx, cy, cz, facing);
  }

  // Unreachable: the loop above always returns by its (PISTON_PUSH_LIMIT + 1)th iteration, since a
  // run of that many movable positions trips the exceeded-limit return. Kept only as a type-safe
  // fallback matching this module's "never throws" contract.
  return { canPush: false, blocksToMove: [], blocksToDestroy: [], blockedReason: 'exceeded-limit' };
}
