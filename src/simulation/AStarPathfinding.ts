/**
 * Bounded, deterministic A* pathfinding (135) over a 6-directional voxel grid,
 * built on 134's `NavigationGridQuery` (`canStandAt`/`movementCost`) as the
 * per-cell occupancy/cost oracle. No diagonal/step-climb movement beyond
 * `movementCost`'s own semantics, no incremental/multi-tick search, and no
 * mob AI/`Game` wiring — see
 * `openspec/changes/135-a-star-pathfinding/design.md`.
 */
import { canStandAt, movementCost, type NavigationWorld } from './NavigationGridQuery';

/** An integer grid cell. */
export interface PathNode {
  x: number;
  y: number;
  z: number;
}

/** Optional search parameters. */
export interface PathfindOptions {
  /** Body height forwarded to 134's occupancy queries. Default 2. */
  height?: number;
  /** Hard cap on node expansions. Default 2048. */
  maxExpansions?: number;
  /** Polled once per expansion; returning `true` aborts the search early. */
  isCancelled?: () => boolean;
}

/** Result of one `findPath` call. */
export interface PathResult {
  /** `start`..(`goal` or the best-effort closest node), inclusive. */
  nodes: PathNode[];
  reachedGoal: boolean;
  cancelled: boolean;
  /** Number of nodes popped from the open set. */
  expanded: number;
}

const DEFAULT_HEIGHT = 2;
const DEFAULT_MAX_EXPANSIONS = 2048;

/** Fixed neighbor exploration order; part of the determinism contract (do not reorder). */
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, 1, 0],
  [0, -1, 0],
];

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function manhattan(a: PathNode, b: PathNode): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}

interface OpenEntry {
  node: PathNode;
  g: number;
  h: number;
  f: number;
  seq: number;
}

function reconstruct(cameFrom: Map<string, PathNode>, start: PathNode, target: PathNode): PathNode[] {
  const nodes: PathNode[] = [target];
  let currentKey = key(target.x, target.y, target.z);
  const startKey = key(start.x, start.y, start.z);
  while (currentKey !== startKey) {
    const prev = cameFrom.get(currentKey);
    if (!prev) break;
    nodes.push(prev);
    currentKey = key(prev.x, prev.y, prev.z);
  }
  nodes.reverse();
  return nodes;
}

class OpenHeap {
  private readonly data: OpenEntry[] = [];

  get length(): number {
    return this.data.length;
  }

  push(entry: OpenEntry): void {
    this.data.push(entry);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): OpenEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0]!;
    const bottom = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private isBetter(a: OpenEntry, b: OpenEntry): boolean {
    return a.f < b.f || (a.f === b.f && a.seq < b.seq);
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const current = this.data[index]!;
      const parent = this.data[parentIndex]!;
      if (this.isBetter(current, parent)) {
        this.data[index] = parent;
        this.data[parentIndex] = current;
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    const length = this.data.length;
    while (true) {
      const left = (index << 1) + 1;
      const right = left + 1;
      let best = index;

      if (left < length && this.isBetter(this.data[left]!, this.data[best]!)) {
        best = left;
      }
      if (right < length && this.isBetter(this.data[right]!, this.data[best]!)) {
        best = right;
      }
      if (best !== index) {
        const temp = this.data[index]!;
        this.data[index] = this.data[best]!;
        this.data[best] = temp;
        index = best;
      } else {
        break;
      }
    }
  }
}

/**
 * Search for a path from `start` to `goal`. Returns `null` exactly when
 * `start` itself is not standable. Otherwise returns a `PathResult`: the goal
 * path when reached within budget, or a best-effort partial path toward the
 * closest-to-goal node discovered when the budget is exhausted, the open set
 * empties, or the search is cancelled.
 */
export function findPath(
  world: NavigationWorld,
  start: PathNode,
  goal: PathNode,
  options: PathfindOptions = {},
): PathResult | null {
  const height = options.height ?? DEFAULT_HEIGHT;
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;

  if (!canStandAt(world, start.x, start.y, start.z, height)) {
    return null;
  }

  let seq = 0;
  const startH = manhattan(start, goal);
  const open = new OpenHeap();
  open.push({ node: start, g: 0, h: startH, f: startH, seq: seq++ });
  const bestG = new Map<string, number>([[key(start.x, start.y, start.z), 0]]);
  const cameFrom = new Map<string, PathNode>();

  let bestNode = start;
  let bestH = startH;

  let expanded = 0;
  let cancelled = false;

  while (open.length > 0) {
    if (expanded >= maxExpansions) {
      break;
    }
    if (options.isCancelled?.()) {
      cancelled = true;
      break;
    }

    const current = open.pop()!;
    expanded++;

    if (current.node.x === goal.x && current.node.y === goal.y && current.node.z === goal.z) {
      return {
        nodes: reconstruct(cameFrom, start, current.node),
        reachedGoal: true,
        cancelled: false,
        expanded,
      };
    }

    if (current.h < bestH) {
      bestH = current.h;
      bestNode = current.node;
    }

    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nx = current.node.x + dx;
      const ny = current.node.y + dy;
      const nz = current.node.z + dz;
      const cost = movementCost(world, nx, ny, nz, height);
      if (!Number.isFinite(cost)) continue;

      const tentativeG = current.g + 1 + cost;
      const nKey = key(nx, ny, nz);
      const known = bestG.get(nKey);
      if (known !== undefined && tentativeG >= known) continue;

      bestG.set(nKey, tentativeG);
      cameFrom.set(nKey, current.node);
      const neighborNode: PathNode = { x: nx, y: ny, z: nz };
      const h = manhattan(neighborNode, goal);
      open.push({ node: neighborNode, g: tentativeG, h, f: tentativeG + h, seq: seq++ });
    }
  }

  return {
    nodes: reconstruct(cameFrom, start, bestNode),
    reachedGoal: false,
    cancelled,
    expanded,
  };
}

/**
 * Whether `path` (from `fromIndex` onward) has been invalidated by a world
 * change: `true` as soon as one remaining node is no longer standable.
 */
export function isPathStale(
  world: NavigationWorld,
  path: PathResult,
  fromIndex: number,
  height: number,
): boolean {
  for (let i = fromIndex; i < path.nodes.length; i++) {
    const node = path.nodes[i]!;
    if (!Number.isFinite(movementCost(world, node.x, node.y, node.z, height))) {
      return true;
    }
  }
  return false;
}
