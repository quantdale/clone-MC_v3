/**
 * Hostile target-acquisition and chase baseline AI (140): the hostile
 * analog to 139's passive baseline. `TargetAcquisitionGoal` finds/tracks the
 * nearest valid target via an injected callback; `ChaseGoal` steers toward
 * that target and stops within attack range. No obstacle-aware pathfinding,
 * no line-of-sight checks, no actual attack/damage, and no `Game`/
 * mob-spawning wiring — see
 * `openspec/changes/140-hostile-target-ai/design.md`. Phase 8 adds
 * {@link PathCache}, a bounded navigation-path cache callers wrap around
 * `AStarPathfinding.findPath` with (this module deliberately does not import
 * it), invalidated on nearby block changes.
 */
import type { Goal } from './GoalSelector';
import { GoalFlag } from './GoalSelector';
import type { EntityManager } from './EntityManager';

/** A target's world position. */
export interface TargetPosition {
  x: number;
  y: number;
  z: number;
}

function distance(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Constructor options for {@link TargetAcquisitionGoal}. */
export interface TargetAcquisitionOptions {
  manager: EntityManager;
  entityId: number;
  findNearestTarget: (x: number, y: number, z: number) => TargetPosition | null;
  /** Max distance to newly acquire a target. Default 16. */
  detectionRadius?: number;
  /** Max distance to retain an already-acquired target (hysteresis; should exceed detectionRadius). Default 32. */
  forgetRadius?: number;
}

/**
 * Target-flagged goal: finds and tracks the nearest valid target via an
 * injected callback, within detection/forget radius hysteresis.
 */
export class TargetAcquisitionGoal implements Goal {
  readonly flags: readonly GoalFlag[] = [GoalFlag.Target];
  private readonly manager: EntityManager;
  private readonly entityId: number;
  private readonly findNearestTarget: (x: number, y: number, z: number) => TargetPosition | null;
  private readonly detectionRadius: number;
  private readonly forgetRadius: number;

  private pendingTarget: TargetPosition | null = null;
  private currentTarget: TargetPosition | null = null;

  constructor(opts: TargetAcquisitionOptions) {
    this.manager = opts.manager;
    this.entityId = opts.entityId;
    this.findNearestTarget = opts.findNearestTarget;
    this.detectionRadius = opts.detectionRadius ?? 16;
    this.forgetRadius = opts.forgetRadius ?? 32;
  }

  canUse(): boolean {
    const entity = this.manager.get(this.entityId);
    if (!entity || entity.state !== 'ACTIVE') return false;
    const { x, y, z } = entity.transform;
    const candidate = this.findNearestTarget(x, y, z);
    if (!candidate) return false;
    if (distance(x, y, z, candidate.x, candidate.y, candidate.z) > this.detectionRadius) return false;
    this.pendingTarget = candidate;
    return true;
  }

  canContinueToUse(): boolean {
    const entity = this.manager.get(this.entityId);
    if (!entity || entity.state !== 'ACTIVE') return false;
    const { x, y, z } = entity.transform;
    const fresh = this.findNearestTarget(x, y, z);
    if (!fresh) return false;
    this.currentTarget = fresh;
    return distance(x, y, z, fresh.x, fresh.y, fresh.z) <= this.forgetRadius;
  }

  start(): void {
    this.currentTarget = this.pendingTarget;
  }

  stop(): void {
    this.currentTarget = null;
  }

  /** The most recently accepted target, or `null` before acquisition / after `stop()`. */
  getTarget(): TargetPosition | null {
    return this.currentTarget;
  }
}

/** Constructor options for {@link ChaseGoal}. */
export interface ChaseGoalOptions {
  manager: EntityManager;
  entityId: number;
  targetSource: TargetAcquisitionGoal;
  /** Horizontal steering speed in blocks/second. Default 3.0. */
  speed?: number;
  /** Distance within which the chase stops (hands off to a future attack goal). Default 2. */
  attackRange?: number;
}

/**
 * Move-flagged goal: steers horizontal velocity toward
 * `targetSource.getTarget()` while farther than `attackRange`, stopping
 * (zeroing horizontal velocity) once within range.
 */
export class ChaseGoal implements Goal {
  readonly flags: readonly GoalFlag[] = [GoalFlag.Move];
  private readonly manager: EntityManager;
  private readonly entityId: number;
  private readonly targetSource: TargetAcquisitionGoal;
  private readonly speed: number;
  private readonly attackRange: number;

  constructor(opts: ChaseGoalOptions) {
    this.manager = opts.manager;
    this.entityId = opts.entityId;
    this.targetSource = opts.targetSource;
    this.speed = opts.speed ?? 3.0;
    this.attackRange = opts.attackRange ?? 2;
  }

  canUse(): boolean {
    const entity = this.manager.get(this.entityId);
    return !!entity && entity.state === 'ACTIVE' && this.targetSource.getTarget() !== null;
  }

  canContinueToUse(): boolean {
    return this.canUse();
  }

  tick(): void {
    const entity = this.manager.get(this.entityId);
    const target = this.targetSource.getTarget();
    if (!entity || !target) return;

    const dx = target.x - entity.transform.x;
    const dz = target.z - entity.transform.z;
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);

    if (horizontalDist <= this.attackRange) {
      this.manager.setVelocity(entity.id, { vx: 0, vy: entity.velocity.vy, vz: 0 });
      return;
    }
    const vx = (dx / horizontalDist) * this.speed;
    const vz = (dz / horizontalDist) * this.speed;
    this.manager.setVelocity(entity.id, { vx, vy: entity.velocity.vy, vz });
  }

  stop(): void {
    const entity = this.manager.get(this.entityId);
    if (!entity) return;
    this.manager.setVelocity(entity.id, { vx: 0, vy: entity.velocity.vy, vz: 0 });
  }
}

/** Max entries {@link PathCache} retains; the oldest entry is evicted beyond this. */
export const PATH_CACHE_CAPACITY = 64;

/** One cached path plus the exact cells it was computed for. */
interface PathCacheEntry<T> {
  startCell: { x: number; y: number; z: number };
  goalCell: { x: number; y: number; z: number };
  path: T;
}

/**
 * Bounded LRU-style cache for navigation paths (Phase 8 "navigation budget
 * and path cache"). Generic over the path representation so callers can wrap
 * `AStarPathfinding.findPath` without this module importing it — compute on
 * miss, `put` the result, `get` on subsequent ticks. Keys are compact numeric
 * cell hashes bucketing exact `(x, y, z)` start/goal pairs; a hash hit is
 * verified against the stored cells, so collisions degrade to a miss, never
 * to a wrong path. `invalidateNear` drops entries whose start or goal cell is
 * within `radiusCells` of a changed block column, keeping stale geometry out
 * of the cache after edits.
 */
export class PathCache<T> {
  private readonly capacity: number;
  private readonly buckets = new Map<number, PathCacheEntry<T>[]>();

  constructor(capacity: number = PATH_CACHE_CAPACITY) {
    if (!(capacity > 0)) throw new Error('PathCache: capacity must be positive');
    this.capacity = capacity;
  }

  private static cellHash(x: number, y: number, z: number): number {
    // Compact numeric hash over integer cells; verified on lookup.
    return Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca6b) ^ Math.imul(z | 0, 0xc2b2ae35);
  }

  private static key(start: { x: number; y: number; z: number }, goal: { x: number; y: number; z: number }): number {
    return (
      PathCache.cellHash(start.x, start.y, start.z) ^
      Math.imul(PathCache.cellHash(goal.x, goal.y, goal.z), 0x27d4eb2f)
    );
  }

  private static sameCell(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }

  /** The cached path for exactly these start/goal cells, or `undefined`. Refreshes recency. */
  get(
    startCell: { x: number; y: number; z: number },
    goalCell: { x: number; y: number; z: number },
  ): T | undefined {
    const key = PathCache.key(startCell, goalCell);
    const bucket = this.buckets.get(key);
    if (!bucket) return undefined;
    for (let i = 0; i < bucket.length; i++) {
      const entry = bucket[i];
      if (!entry) continue;
      if (
        PathCache.sameCell(entry.startCell, startCell) &&
        PathCache.sameCell(entry.goalCell, goalCell)
      ) {
        // LRU refresh: move to the back of the bucket.
        bucket.splice(i, 1);
        bucket.push(entry);
        return entry.path;
      }
    }
    return undefined;
  }

  /** Cache `path` for these start/goal cells, evicting the oldest entry when full. */
  put(
    startCell: { x: number; y: number; z: number },
    goalCell: { x: number; y: number; z: number },
    path: T,
  ): void {
    const key = PathCache.key(startCell, goalCell);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = [];
      this.buckets.set(key, bucket);
    }
    for (const entry of bucket) {
      if (
        PathCache.sameCell(entry.startCell, startCell) &&
        PathCache.sameCell(entry.goalCell, goalCell)
      ) {
        entry.path = path;
        return;
      }
    }
    if (this.size >= this.capacity) {
      this.evictOldest();
    }
    bucket.push({ startCell: { ...startCell }, goalCell: { ...goalCell }, path });
  }

  /** Drop every entry whose start or goal cell lies within `radiusCells` of `(x, z)`. */
  invalidateNear(x: number, z: number, radiusCells: number): void {
    if (!(radiusCells >= 0)) return;
    for (const [key, bucket] of [...this.buckets]) {
      const kept = bucket.filter(
        (entry) =>
          !this.cellNear(entry.startCell, x, z, radiusCells) &&
          !this.cellNear(entry.goalCell, x, z, radiusCells),
      );
      if (kept.length === 0) this.buckets.delete(key);
      else bucket.splice(0, bucket.length, ...kept);
    }
  }

  /** Drop every cached path. */
  clear(): void {
    this.buckets.clear();
  }

  /** Number of cached paths. */
  get size(): number {
    let n = 0;
    for (const bucket of this.buckets.values()) n += bucket.length;
    return n;
  }

  private cellNear(cell: { x: number; y: number; z: number }, x: number, z: number, radiusCells: number): boolean {
    const dx = cell.x - x;
    const dz = cell.z - z;
    return dx * dx + dz * dz <= radiusCells * radiusCells;
  }

  private evictOldest(): void {
    for (const [key, bucket] of this.buckets) {
      bucket.shift();
      if (bucket.length === 0) this.buckets.delete(key);
      return;
    }
  }
}
