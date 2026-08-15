/**
 * Hostile target-acquisition and chase baseline AI (140): the hostile
 * analog to 139's passive baseline. `TargetAcquisitionGoal` finds/tracks the
 * nearest valid target via an injected callback; `ChaseGoal` steers toward
 * that target and stops within attack range. No obstacle-aware pathfinding,
 * no line-of-sight checks, no actual attack/damage, and no `Game`/
 * mob-spawning wiring — see
 * `openspec/changes/140-hostile-target-ai/design.md`.
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
