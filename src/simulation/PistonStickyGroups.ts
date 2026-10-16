/**
 * Slime/honey sticky move groups (165): closes the piston sub-arc (163-165). Adds the graph-shaped
 * expansion straight-line pushing can't express — any block touching a slime/honey block on any of
 * its six faces gets dragged along too, potentially cascading through a whole connected cluster —
 * plus the sticky-piston-only retract-pull.
 *
 * `orderGroupForMove` generalizes 163's farthest-first ordering to an arbitrary set of positions
 * that all move by the same one-block offset: sort by decreasing projection onto the movement
 * direction. For any two group members `A` and `B = A + movementDirection`, `B`'s projection is
 * strictly greater, so the sort always moves `B` out of the way before `A` is written there — the
 * exact same guarantee 163/164 already rely on for a line, just proven for any shape. Because of
 * this, 164's `executePistonPush`/`pistonAffectedPositions` need no changes at all to apply a
 * sticky group.
 *
 * `wouldDrag` encodes vanilla's real slime/honey rule: two *sticky* blocks drag each other only
 * when they share the same kind (slime-slime or honey-honey); a sticky block dragging a
 * *non-sticky* neighbor always succeeds, but that neighbor becomes a passive passenger with no
 * further reach of its own — only a sticky position ever expands the group's frontier.
 *
 * No `slime_block`/`honey_block` `BlockId` (`StickyWorld` is injected, 154's seam — the same
 * reasoning 163 used to test `PistonWorld` without needing real obsidian/bedrock blocks), no
 * `Game`/`World` wiring — see `openspec/changes/165-slime-honey-move-groups/design.md`.
 */
import {
  DIRECTIONS,
  DIRECTION_OFFSETS,
  OPPOSITE_DIRECTION,
  offsetInDirection,
  type Direction,
} from './RedstoneSignal';
import {
  classifyPistonBlock,
  PISTON_PUSH_LIMIT,
  type PistonWorld,
  type PistonPushPlan,
} from './PistonMovePlanner';

/** A block's sticky affiliation, or `null` for a non-sticky block. */
export type StickyKind = 'slime' | 'honey';

/** The caller-supplied world surface this module needs (injected, 154's seam). */
export interface StickyWorld {
  stickyKind(x: number, y: number, z: number): StickyKind | null;
}

/**
 * Whether a sticky position (`current`) would drag `neighbor` along: `true` when `neighbor` is
 * non-sticky (a passive passenger) or shares `current`'s exact kind; `false` when `neighbor` is a
 * *different* sticky kind (vanilla's slime-does-not-stick-to-honey rule).
 */
export function wouldDrag(current: StickyKind, neighbor: StickyKind | null): boolean {
  return neighbor === null || neighbor === current;
}

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** The resolved outcome of expanding a sticky group from one or more seeds. */
export interface StickyGroupResult {
  readonly canMove: boolean;
  readonly positions: ReadonlyArray<readonly [number, number, number]>;
  readonly blockedReason?: 'immovable' | 'exceeded-limit';
  readonly blockedAt?: readonly [number, number, number];
}

/**
 * Bounded breadth-first expansion from `seeds` (already validated by the caller, never
 * reclassified here): a queued position whose `stickyKind` is non-null examines its six neighbors;
 * an `'immovable'` neighbor fails the whole group immediately; a `'terminates-clear'`/
 * `'terminates-destroy'` neighbor is simply not dragged (not a failure); a `'movable'` neighbor
 * joins the group only when `wouldDrag` holds against the current position's kind. Fails the whole
 * group if it would exceed `maxGroupSize` positions.
 */
export function expandStickyGroup(
  pistonWorld: PistonWorld,
  stickyWorld: StickyWorld,
  seeds: ReadonlyArray<readonly [number, number, number]>,
  maxGroupSize: number,
): StickyGroupResult {
  const included = new Set<string>();
  const order: Array<readonly [number, number, number]> = [];
  const queue: Array<readonly [number, number, number]> = [];

  for (const seed of seeds) {
    const k = key(seed[0], seed[1], seed[2]);
    if (!included.has(k)) {
      included.add(k);
      order.push(seed);
      queue.push(seed);
    }
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const [cx, cy, cz] = queue[cursor]!;
    cursor++;
    const currentKind = stickyWorld.stickyKind(cx, cy, cz);
    if (currentKind === null) continue;

    for (const direction of DIRECTIONS) {
      const [nx, ny, nz] = offsetInDirection(cx, cy, cz, direction);
      const nk = key(nx, ny, nz);
      if (included.has(nk)) continue;

      const classification = classifyPistonBlock(pistonWorld, nx, ny, nz);
      if (classification === 'immovable') {
        return { canMove: false, positions: [], blockedReason: 'immovable', blockedAt: [nx, ny, nz] };
      }
      if (classification !== 'movable') continue;

      const neighborKind = stickyWorld.stickyKind(nx, ny, nz);
      if (!wouldDrag(currentKind, neighborKind)) continue;

      included.add(nk);
      order.push([nx, ny, nz]);
      queue.push([nx, ny, nz]);
      if (order.length > maxGroupSize) {
        return {
          canMove: false,
          positions: [],
          blockedReason: 'exceeded-limit',
          blockedAt: [nx, ny, nz],
        };
      }
    }
  }

  return { canMove: true, positions: order };
}

/**
 * Sort `positions` by strictly decreasing projection onto `movementDirection`'s unit offset — the
 * order in which every position can move without a not-yet-relocated member ever overwriting
 * another. A stable sort: positions with equal projection (never in direct conflict with each
 * other) keep their original relative order.
 */
export function orderGroupForMove(
  positions: ReadonlyArray<readonly [number, number, number]>,
  movementDirection: Direction,
): Array<readonly [number, number, number]> {
  const [dx, dy, dz] = DIRECTION_OFFSETS[movementDirection];
  return positions
    .map((p, index) => ({ p, index, projection: p[0] * dx + p[1] * dy + p[2] * dz }))
    .sort((a, b) => b.projection - a.projection || a.index - b.index)
    .map((entry) => entry.p);
}

/**
 * Expand `basePlan` (163) to include anything stuck to a sticky block already in its
 * `blocksToMove`. Returns `basePlan` unchanged when it is blocked, or when none of its
 * `blocksToMove` positions are sticky (nothing to expand). Applies to any piston, sticky or not —
 * slime/honey stickiness is a property of the block being pushed, not of the pushing piston.
 */
export function extendPushPlanWithStickyGroup(
  basePlan: PistonPushPlan,
  pistonWorld: PistonWorld,
  stickyWorld: StickyWorld,
  facing: Direction,
): PistonPushPlan {
  if (!basePlan.canPush) return basePlan;
  const hasSticky = basePlan.blocksToMove.some(
    ([x, y, z]) => stickyWorld.stickyKind(x, y, z) !== null,
  );
  if (!hasSticky) return basePlan;

  const group = expandStickyGroup(pistonWorld, stickyWorld, basePlan.blocksToMove, PISTON_PUSH_LIMIT);
  if (!group.canMove) {
    return {
      canPush: false,
      blocksToMove: [],
      blocksToDestroy: [],
      blockedReason: group.blockedReason,
      blockedAt: group.blockedAt,
    };
  }

  return {
    canPush: true,
    blocksToMove: orderGroupForMove(group.positions, facing),
    blocksToDestroy: basePlan.blocksToDestroy,
  };
}

/**
 * The sticky-piston-only retract behavior: pulls the single block directly in front of the piston
 * back toward it (and, if that block is itself sticky, cascades to whatever's stuck to it via
 * `expandStickyGroup`, moving in the pull direction). Fails if that position is `'immovable'`;
 * succeeds with an empty `blocksToMove` if it is a terminator (nothing to grab, not a failure).
 */
export function planStickyRetract(
  pistonWorld: PistonWorld,
  stickyWorld: StickyWorld,
  x: number,
  y: number,
  z: number,
  facing: Direction,
): PistonPushPlan {
  const [fx, fy, fz] = offsetInDirection(x, y, z, facing);
  const classification = classifyPistonBlock(pistonWorld, fx, fy, fz);

  if (classification === 'immovable') {
    return {
      canPush: false,
      blocksToMove: [],
      blocksToDestroy: [],
      blockedReason: 'immovable',
      blockedAt: [fx, fy, fz],
    };
  }
  if (classification !== 'movable') {
    return { canPush: true, blocksToMove: [], blocksToDestroy: [] };
  }

  const pullDirection = OPPOSITE_DIRECTION[facing];
  const group = expandStickyGroup(pistonWorld, stickyWorld, [[fx, fy, fz]], PISTON_PUSH_LIMIT);
  if (!group.canMove) {
    return {
      canPush: false,
      blocksToMove: [],
      blocksToDestroy: [],
      blockedReason: group.blockedReason,
      blockedAt: group.blockedAt,
    };
  }

  return {
    canPush: true,
    blocksToMove: orderGroupForMove(group.positions, pullDirection),
    blocksToDestroy: [],
  };
}
