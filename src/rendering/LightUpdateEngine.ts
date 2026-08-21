/**
 * Incremental light updates (069) plus the bounded, versioned update core shared by the sky/block
 * engines. `updateLightAfterEdit` remains the deterministic single-shot equivalent of a full
 * recompute; `ChannelUpdateQueue` implements queued invalidation with a per-drain work budget so
 * propagation can be spread across frames, and `LightUpdateEngine` is the facade that orchestrates
 * both channels for the World/Game edit path. All phases use fixed visit orders, so identical edits
 * produce identical results.
 */

import { WorldLightStorage } from './LightStorage';

/** The light world the single-shot update computes over. */
export interface LightUpdateWorld {
  isOpaque(x: number, y: number, z: number): boolean;
  /** 0 when the cell is not a light source. */
  getLuminance(x: number, y: number, z: number): number;
  getSkyLight(x: number, y: number, z: number): number;
  setSkyLight(x: number, y: number, z: number, value: number): void;
  getBlockLight(x: number, y: number, z: number): number;
  setBlockLight(x: number, y: number, z: number, value: number): void;
  minY: number;
  maxY: number;
}

type LightType = 'sky' | 'block';

/** Fixed neighbor expansion order (deterministic). */
const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

function inBounds(world: LightUpdateWorld, x: number, y: number, z: number): boolean {
  return x >= 0 && x < 16 && z >= 0 && z < 16 && y >= world.minY && y < world.maxY;
}

function getLight(world: LightUpdateWorld, type: LightType, x: number, y: number, z: number): number {
  return type === 'sky' ? world.getSkyLight(x, y, z) : world.getBlockLight(x, y, z);
}

function setLight(world: LightUpdateWorld, type: LightType, x: number, y: number, z: number, value: number): void {
  if (type === 'sky') world.setSkyLight(x, y, z, value);
  else world.setBlockLight(x, y, z, value);
}

/**
 * Removal phase: BFS from the edited cell zeroing cells whose light depended on the removed path
 * (value strictly below the path level). Opaque cells block the BFS.
 */
function removeLightType(world: LightUpdateWorld, type: LightType, sx: number, sy: number, sz: number): void {
  const start = getLight(world, type, sx, sy, sz);
  if (start <= 0) return;
  setLight(world, type, sx, sy, sz, 0);

  const queue: Array<[number, number, number, number]> = [[sx, sy, sz, start]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y, z, level] = queue[head]!;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBounds(world, nx, ny, nz) || world.isOpaque(nx, ny, nz)) continue;
      const value = getLight(world, type, nx, ny, nz);
      if (value > 0 && value < level) {
        setLight(world, type, nx, ny, nz, 0);
        queue.push([nx, ny, nz, value]);
      }
    }
  }
}

/**
 * Re-add phase: propagate light with −1 falloff from every surviving lit cell (values only increase,
 * so the BFS terminates). Block sources are seeded with their luminance first.
 */
function propagateType(world: LightUpdateWorld, type: LightType): void {
  const queue: Array<[number, number, number]> = [];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = world.minY; y < world.maxY; y++) {
        let value = getLight(world, type, x, y, z);
        if (type === 'block') {
          const luminance = world.getLuminance(x, y, z);
          if (luminance > 0) {
            value = Math.min(15, luminance);
            setLight(world, type, x, y, z, value);
          }
        }
        if (value > 0) queue.push([x, y, z]);
      }
    }
  }

  for (let head = 0; head < queue.length; head++) {
    const [x, y, z] = queue[head]!;
    const value = getLight(world, type, x, y, z);
    if (value <= 1) continue;
    for (const [dx, dy, dz] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBounds(world, nx, ny, nz) || world.isOpaque(nx, ny, nz)) continue;
      const target = value - 1;
      if (getLight(world, type, nx, ny, nz) < target) {
        setLight(world, type, nx, ny, nz, target);
        queue.push([nx, ny, nz]);
      }
    }
  }
}

/**
 * Update sky and block light after the block at `(x, y, z)` changed. Deterministic; equivalent to a
 * full recompute of the edited world.
 */
export function updateLightAfterEdit(world: LightUpdateWorld, x: number, y: number, z: number): void {
  removeLightType(world, 'sky', x, y, z);
  removeLightType(world, 'block', x, y, z);
  propagateType(world, 'block');
  propagateType(world, 'sky');
}

// ---------------------------------------------------------------------------
// Bounded incremental core (shared by SkyLightEngine / BlockLightEngine).
// ---------------------------------------------------------------------------

/** Monotonic token identifying a propagation batch; stale async applications compare against it. */
export type LightVersion = number;

/** Result of one bounded `drain` call. */
export interface DrainResult {
  /** Work units actually consumed this call. */
  readonly opsUsed: number;
  /** Queue entries still waiting (removal + re-add). */
  readonly remainingOps: number;
  /** True when both queues are empty after this call. */
  readonly completed: boolean;
  /** Version token valid as of the end of this drain. */
  readonly version: LightVersion;
}

/** Work budget for one drain: either an operation cap, a time cap in ms, or both. */
export interface DrainBudget {
  /** Maximum operations (one queue pop ≈ up to six neighbor visits). */
  maxOps?: number;
  /** Maximum wall-clock milliseconds; requires the engine's clock. */
  budgetMs?: number;
}

/**
 * Per-channel view the core reads and writes through. Implemented by each engine over
 * `WorldLightStorage` or any other light field.
 */
export interface LightChannelContext {
  /** Lowest world Y of the lit volume. */
  readonly minY: number;
  /** Highest world Y + 1 (world top). */
  readonly maxY: number;
  /** True when the cell blocks propagation. */
  isOpaque(x: number, y: number, z: number): boolean;
  /** Current channel value at the cell. */
  get(x: number, y: number, z: number): number;
  /** Write the channel value at the cell. */
  set(x: number, y: number, z: number, value: number): void;
  /**
   * Value propagated from a cell of `value` into its neighbor `(dx, dy, dz)` away. Skylight keeps
   * full strength straight down through transparent cells (`15 → 15`); everything else decrements.
   */
  attenuate(value: number, dx: number, dy: number, dz: number): number;
  /** Whether removal may consume a neighbor whose value equals the removed level (skylight columns). */
  readonly consumesEqualDown: boolean;
  /**
   * Emitted light at a cell, if the channel has sources (block light luminance). Called for newly
   * invalidated cells so fresh emitters are seeded into the re-add phase.
   */
  emit?(x: number, y: number, z: number): number;
}

const NEIGHBOR_DELTAS: ReadonlyArray<readonly [number, number, number]> = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

function inBoundsY(ctx: LightChannelContext, y: number): boolean {
  return y >= ctx.minY && y < ctx.maxY;
}

/**
 * Queued incremental invalidation/propagation state for one channel. Removal always completes
 * before any re-add starts (the removal region must be final), but both phases are resumable across
 * drains, so a partially drained update simply leaves the channel dark until work resumes — the
 * version token tells consumers which snapshot they sampled.
 *
 * Flat numeric queues avoid per-entry object allocation; pending invalidations dedupe through a
 * string-keyed set that stays small (only not-yet-processed edits). Visit order is a deterministic
 * stack discipline with a fixed neighbor order, so identical edits produce identical results.
 */
export class ChannelUpdateQueue {
  private removalQueue: number[] = []; // x, y, z, level, ...
  private addQueue: number[] = []; // x, y, z, ...
  private pendingInvalidations = new Set<string>();
  private versionValue: LightVersion = 0;

  /** Version token advanced once per drain that performed work. */
  get version(): LightVersion {
    return this.versionValue;
  }

  /** Queued work units (pending invalidations + removals + re-adds). */
  get pendingCount(): number {
    return this.pendingInvalidations.size + this.removalQueue.length / 4 + this.addQueue.length / 3;
  }

  /** True when nothing is queued. */
  get idle(): boolean {
    return this.pendingInvalidations.size === 0 && this.removalQueue.length === 0 && this.addQueue.length === 0;
  }

  private enqueueRemoval(x: number, y: number, z: number, level: number): void {
    this.removalQueue.push(x, y, z, level);
  }

  private enqueueAdd(x: number, y: number, z: number): void {
    this.addQueue.push(x, y, z);
  }

  /**
   * Record an edit at `(x, y, z)`. Deduplicated while still pending. For skylight, every directly
   * lit column cell below is invalidated too: their value equals the removed level, so plain BFS
   * would keep them lit even though the column above collapsed.
   */
  invalidate(ctx: LightChannelContext, x: number, y: number, z: number): void {
    if (!inBoundsY(ctx, y)) return;
    const key = `${x},${y},${z}`;
    if (this.pendingInvalidations.has(key)) return;
    this.pendingInvalidations.add(key);
    if (ctx.consumesEqualDown) {
      for (let cy = y - 1; cy >= ctx.minY && !ctx.isOpaque(x, cy, z) && ctx.get(x, cy, z) === 15; cy--) {
        const belowKey = `${x},${cy},${z}`;
        if (!this.pendingInvalidations.has(belowKey)) this.pendingInvalidations.add(belowKey);
      }
    }
  }

  /** Fold deduped pending invalidations into the removal queue (called at drain start). */
  private flushPending(ctx: LightChannelContext): void {
    if (this.pendingInvalidations.size === 0) return;
    for (const key of this.pendingInvalidations) {
      const parts = key.split(',');
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const z = Number(parts[2]);
      const current = ctx.get(x, y, z);
      if (ctx.emit) {
        const emission = Math.min(15, ctx.emit(x, y, z));
        if (emission > current) {
          ctx.set(x, y, z, emission);
          this.enqueueAdd(x, y, z);
          continue;
        }
      }
      if (current > 0) this.enqueueRemoval(x, y, z, current);
    }
    this.pendingInvalidations.clear();
  }

  /**
   * Process up to the budget's worth of queue pops. One op = one removal or one re-add step.
   * Returns whether work remains.
   */
  drain(ctx: LightChannelContext, budget: DrainBudget, now?: () => number): DrainResult {
    this.flushPending(ctx);
    const maxOps = Math.max(0, Math.floor(budget.maxOps ?? Number.POSITIVE_INFINITY));
    const deadline = budget.budgetMs !== undefined && now ? now() + budget.budgetMs : Number.POSITIVE_INFINITY;
    let ops = 0;
    while (ops < maxOps && (this.removalQueue.length > 0 || this.addQueue.length > 0)) {
      if (this.removalQueue.length > 0) {
        this.stepRemoval(ctx);
      } else {
        this.stepAdd(ctx);
      }
      ops++;
      if (now && (ops & 0x0f) === 0 && now() >= deadline) break;
    }
    if (ops > 0) this.versionValue++;
    const remaining = this.pendingInvalidations.size + this.removalQueue.length / 4 + this.addQueue.length / 3;
    return { opsUsed: ops, remainingOps: remaining, completed: remaining === 0, version: this.versionValue };
  }

  /** Drop all queued work without touching stored light. */
  clear(): void {
    this.removalQueue = [];
    this.addQueue = [];
    this.pendingInvalidations.clear();
  }

  /** One removal BFS pop: darken the cell and classify its neighbors. */
  private stepRemoval(ctx: LightChannelContext): void {
    const base = this.removalQueue.length - 4;
    const x = this.removalQueue[base]!;
    const y = this.removalQueue[base + 1]!;
    const z = this.removalQueue[base + 2]!;
    const level = this.removalQueue[base + 3]!;
    this.removalQueue.length = base;

    // The cell may have been relit by an earlier re-add before this stale entry ran; only proceed
    // when it still carries the removed level (or has since gone dark on its own path).
    const own = ctx.get(x, y, z);
    if (own !== 0 && own !== level) return;

    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBoundsY(ctx, ny) || ctx.isOpaque(nx, ny, nz)) continue;
      const value = ctx.get(nx, ny, nz);
      if (value <= 0) continue;
      const consumed =
        value < level || (ctx.consumesEqualDown && dy === -1 && value === 15 && level === 15);
      if (consumed) {
        ctx.set(nx, ny, nz, 0);
        this.enqueueRemoval(nx, ny, nz, value);
      } else {
        // Surviving brighter (or equal, non-column) neighbor reseeds the region.
        this.enqueueAdd(nx, ny, nz);
      }
    }
  }

  /** One re-add BFS pop: raise darker neighbors to the attenuated source value. */
  private stepAdd(ctx: LightChannelContext): void {
    const base = this.addQueue.length - 3;
    const x = this.addQueue[base]!;
    const y = this.addQueue[base + 1]!;
    const z = this.addQueue[base + 2]!;
    this.addQueue.length = base;
    const value = ctx.get(x, y, z);
    if (value <= 1) return;
    for (const [dx, dy, dz] of NEIGHBOR_DELTAS) {
      const nx = x + dx;
      const ny = y + dy;
      const nz = z + dz;
      if (!inBoundsY(ctx, ny) || ctx.isOpaque(nx, ny, nz)) continue;
      const target = ctx.attenuate(value, dx, dy, dz);
      if (target <= 0) continue;
      if (ctx.get(nx, ny, nz) < target) {
        ctx.set(nx, ny, nz, target);
        this.enqueueAdd(nx, ny, nz);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Facade over both channels for the World/Game edit path.
// ---------------------------------------------------------------------------

/** Block-world predicates the facade needs beyond stored light. */
export interface VoxelLightAccess {
  /** True when the block at the cell blocks light propagation. */
  isOpaque(x: number, y: number, z: number): boolean;
  /** Emitted block-light level (0 for non-sources). */
  getLuminance(x: number, y: number, z: number): number;
}

/** Vertical extent of the lit volume. */
export interface VoxelLightBounds {
  minY: number;
  maxY: number;
}

/** Observability counters for the facade. */
export interface PendingLightCounts {
  sky: number;
  block: number;
  total: number;
}

/** Default per-drain operation cap when no explicit budget is given. */
const DEFAULT_DRAIN_OPS = 4096;

/**
 * Single entry point for voxel lighting updates: minimal invalidation on block edits plus
 * frame-budgeted draining of both channels. Owns no block data — opacity and luminance come from
 * `access`, light values live in `storage`.
 */
export class LightUpdateEngine {
  private readonly skyQueue = new ChannelUpdateQueue();
  private readonly blockQueue = new ChannelUpdateQueue();
  private readonly skyContext: LightChannelContext;
  private readonly blockContext: LightChannelContext;
  private readonly access: VoxelLightAccess;
  private readonly now: () => number;

  constructor(
    private readonly storage: WorldLightStorage,
    access: VoxelLightAccess,
    bounds: VoxelLightBounds,
    now: () => number = () => performance.now(),
  ) {
    this.access = access;
    this.now = now;
    this.skyContext = {
      minY: bounds.minY,
      maxY: bounds.maxY,
      isOpaque: (x, y, z) => access.isOpaque(x, y, z),
      get: (x, y, z) => storage.getSkyLight(x, y, z),
      set: (x, y, z, v) => storage.setSkyLight(x, y, z, v),
      attenuate: (value, _dx, dy) => (value === 15 && dy === -1 ? 15 : value - 1),
      consumesEqualDown: true,
    };
    this.blockContext = {
      minY: bounds.minY,
      maxY: bounds.maxY,
      isOpaque: (x, y, z) => access.isOpaque(x, y, z),
      get: (x, y, z) => storage.getBlockLight(x, y, z),
      set: (x, y, z, v) => storage.setBlockLight(x, y, z, v),
      attenuate: (value) => value - 1,
      consumesEqualDown: false,
      emit: (x, y, z) => access.getLuminance(x, y, z),
    };
  }

  /**
   * Queue the minimal invalidation for a block change at `(x, y, z)`: the cell itself for both
   * channels (plus the directly lit sky column beneath it). Repeated calls before draining are
   * deduplicated. Callers should invoke this after the block state (opacity/luminance) is updated.
   */
  onBlockChanged(x: number, y: number, z: number): void {
    this.skyQueue.invalidate(this.skyContext, x, y, z);
    this.blockQueue.invalidate(this.blockContext, x, y, z);
  }

  /** Directly queue one cell for both channels (e.g. section load seeding). */
  invalidateCell(x: number, y: number, z: number): void {
    this.onBlockChanged(x, y, z);
  }

  /**
   * Process queued work within the budget. Block channel drains first so emissive results land
   * before skylight reshapes ambient levels. Unfinished work simply remains queued.
   */
  drain(budget: DrainBudget = { maxOps: DEFAULT_DRAIN_OPS }): DrainResult {
    const maxOps = budget.maxOps ?? (budget.budgetMs !== undefined ? Number.POSITIVE_INFINITY : DEFAULT_DRAIN_OPS);
    const start = this.now();
    const blockResult = this.blockQueue.drain(this.blockContext, { ...budget, maxOps }, this.now);
    const elapsed = this.now() - start;
    const skyBudgetMs = budget.budgetMs !== undefined ? Math.max(0, budget.budgetMs - elapsed) : undefined;
    const skyResult = this.skyQueue.drain(this.skyContext, { maxOps: budget.maxOps ?? Infinity, budgetMs: skyBudgetMs }, this.now);
    return {
      opsUsed: blockResult.opsUsed + skyResult.opsUsed,
      remainingOps: blockResult.remainingOps + skyResult.remainingOps,
      completed: blockResult.completed && skyResult.completed,
      version: Math.max(blockResult.version, skyResult.version),
    };
  }

  /** Combined version token; consumers compare it to reject stale async mesh applications. */
  get version(): number {
    return Math.max(this.skyQueue.version, this.blockQueue.version);
  }

  /** Queued-work observability. */
  pendingCounts(): PendingLightCounts {
    const sky = this.skyQueue.pendingCount;
    const block = this.blockQueue.pendingCount;
    return { sky, block, total: sky + block };
  }

  /** True when both channels have nothing queued. */
  get idle(): boolean {
    return this.skyQueue.idle && this.blockQueue.idle;
  }

  /** Drop all queued work without touching stored light. */
  clearPending(): void {
    this.skyQueue.clear();
    this.blockQueue.clear();
  }

  /** The shared storage this engine reads and writes. */
  get lightStorage(): WorldLightStorage {
    return this.storage;
  }

  /** Luminance accessor passthrough (for callers seeding emitters manually). */
  luminanceAt(x: number, y: number, z: number): number {
    return this.access.getLuminance(x, y, z);
  }
}
