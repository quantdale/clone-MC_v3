/**
 * Deterministic skylight computation (067). `computeSkyLight` initializes every column from the world
 * top: sky light starts at 15 and falls off by 1 per air block downward, stopping at the first opaque
 * block (0 below). It then propagates via a FIFO BFS through non-opaque cells: a cell with light `v`
 * raises its six non-opaque neighbors to `v - 1` when darker. Neighbor order is fixed
 * (`-x, +x, -y, +y, -z, +z`), so identical worlds produce identical results.
 *
 * `SkyLightEngine` provides the incremental counterpart with Minecraft-like direct-sky columns:
 * skylight 15 propagates straight down undiminished, lateral propagation decrements by 1, and a
 * removal may consume an equal-value cell only when moving straight down a lit column. Invalidation
 * is queued and deduplicated, drains are work-budgeted, and each applied batch bumps a version token.
 */

import { ChannelUpdateQueue, type DrainResult, type DrainBudget, type LightChannelContext, type LightVersion } from './LightUpdateEngine';

/** The light world the engine computes over. */
export interface SkyLightWorld {
  isOpaque(x: number, y: number, z: number): boolean;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  /** Lowest world Y of the lit volume. */
  minY: number;
  /** Highest world Y + 1 (world top). */
  maxY: number;
}

/** Fixed neighbor expansion order (deterministic). */
const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

/** Compute skylight over the world volume; returns the number of cells set to a nonzero value. */
export function computeSkyLight(world: SkyLightWorld): number {
  let lit = 0;

  // 1. Per-column initialization from the world top downward.
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      let value = 15;
      for (let y = world.maxY - 1; y >= world.minY; y--) {
        if (world.isOpaque(x, y, z)) {
          world.setSkyLight(x, y, z, 0);
          break; // column stops at the first opaque block
        }
        const clamped = Math.max(0, value);
        world.setSkyLight(x, y, z, clamped);
        if (clamped > 0) lit++;
        value--;
      }
    }
  }

  // 2. BFS propagation through non-opaque cells.
  const queue: Array<[number, number, number]> = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        if (world.getSkyLight(x, y, z) > 0) {
          queue.push([x, y, z]);
        }
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head]!;
    const value = world.getSkyLight(x, y, z);
    if (value <= 1) continue;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (nx < 0 || nx >= 16 || nz < 0 || nz >= 16 || ny < world.minY || ny >= world.maxY) continue;
      if (world.isOpaque(nx, ny, nz)) continue;
      const target = value - 1;
      if (world.getSkyLight(nx, ny, nz) < target) {
        world.setSkyLight(nx, ny, nz, target);
        queue.push([nx, ny, nz]);
      }
    }
  }

  return lit;
}

/** Predicates and storage the incremental skylight engine reads and writes. */
export interface SkyLightFieldAccess {
  /** Lowest world Y of the lit volume. */
  minY: number;
  /** Highest world Y + 1 (world top). */
  maxY: number;
  isOpaque(x: number, y: number, z: number): boolean;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
}

/**
 * Incremental skylight channel: `invalidate` records edits (deduplicated; directly lit columns
 * below an edit are included), `drain` applies removal-then-re-propagation within a work budget,
 * and `version` advances per batch so stale async applications can be rejected.
 */
export class SkyLightEngine {
  private readonly queue = new ChannelUpdateQueue();
  private readonly context: LightChannelContext;
  constructor(access: SkyLightFieldAccess) {
    this.context = {
      minY: access.minY,
      maxY: access.maxY,
      isOpaque: (x, y, z) => access.isOpaque(x, y, z),
      get: (x, y, z) => access.getSkyLight(x, y, z),
      set: (x, y, z, v) => access.setSkyLight(x, y, z, v),
      attenuate: (value, _dx, dy) => (value === 15 && dy === -1 ? 15 : value - 1),
      consumesEqualDown: true,
    };
  }

  /** Queue a cell (and its directly lit column below) for re-evaluation. */
  invalidate(x: number, y: number, z: number): void {
    this.queue.invalidate(this.context, x, y, z);
  }

  /** Process queued work; unfinished work remains queued across calls. */
  drain(budget: DrainBudget): DrainResult {
    return this.queue.drain(this.context, budget);
  }

  /** Queued work units. */
  get pendingCount(): number {
    return this.queue.pendingCount;
  }

  /** True when nothing is queued. */
  get idle(): boolean {
    return this.queue.idle;
  }

  /** Version token of the latest applied propagation batch. */
  get version(): LightVersion {
    return this.queue.version;
  }

  /** Drop queued work without touching stored light. */
  clearPending(): void {
    this.queue.clear();
  }
}
