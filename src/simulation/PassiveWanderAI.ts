/**
 * Passive wander/look baseline AI (139): the first two concrete 136 `Goal`
 * implementations. `WanderGoal` picks a nearby walkable, non-water target
 * (134) and steers horizontal velocity toward it via 129's `EntityManager`;
 * `LookGoal` periodically applies a new random yaw. Both are deterministic
 * given an injected `SeedRng` (054) — no `Math.random`, no wall-clock. No
 * pathfinding-through-obstacles, no terrain-following target search, and no
 * `Game`/mob-spawning wiring — see
 * `openspec/changes/139-passive-wander-ai/design.md`.
 */
import type { Goal } from './GoalSelector';
import { GoalFlag } from './GoalSelector';
import type { EntityManager } from './EntityManager';
import type { SeedRng } from './SeedRng';
import { canStandAt, classifyNode, PathNodeType, type NavigationWorld } from './NavigationGridQuery';

const MAX_TARGET_ATTEMPTS = 10;

/** Constructor options for {@link WanderGoal}. */
export interface WanderGoalOptions {
  manager: EntityManager;
  entityId: number;
  world: NavigationWorld;
  rng: SeedRng;
  /** Horizontal steering speed in blocks/second. Default 2.5. */
  speed?: number;
  /** Max wander-target radius in blocks. Default 10. */
  radius?: number;
  /** Per-tick probability of starting when idle. Default 1/120. */
  startChance?: number;
  /** Max ticks a wander may run before giving up. Default 200 (10s at 20 TPS). */
  maxDurationTicks?: number;
  /** Horizontal distance within which the target counts as reached. Default 0.5. */
  arrivalRadius?: number;
  /** Body height forwarded to `canStandAt`. Default 2. */
  height?: number;
}

type ResolvedWanderOptions = Required<WanderGoalOptions>;

function resolveWanderOptions(opts: WanderGoalOptions): ResolvedWanderOptions {
  return {
    manager: opts.manager,
    entityId: opts.entityId,
    world: opts.world,
    rng: opts.rng,
    speed: opts.speed ?? 2.5,
    radius: opts.radius ?? 10,
    startChance: opts.startChance ?? 1 / 120,
    maxDurationTicks: opts.maxDurationTicks ?? 200,
    arrivalRadius: opts.arrivalRadius ?? 0.5,
    height: opts.height ?? 2,
  };
}

/**
 * Move-flagged goal: picks a nearby walkable, non-water target column around
 * the entity's current position, then steers horizontal velocity toward it
 * each tick until arrival or a duration timeout.
 */
export class WanderGoal implements Goal {
  readonly flags: readonly GoalFlag[] = [GoalFlag.Move];
  private readonly opts: ResolvedWanderOptions;
  private pendingTarget: { x: number; z: number } | null = null;
  private target: { x: number; z: number } | null = null;
  private ticksRunning = 0;

  constructor(opts: WanderGoalOptions) {
    this.opts = resolveWanderOptions(opts);
  }

  canUse(): boolean {
    if (this.opts.rng.nextFloat() >= this.opts.startChance) return false;
    const entity = this.opts.manager.get(this.opts.entityId);
    if (!entity || entity.state !== 'ACTIVE') return false;

    const candidate = this.pickWanderTarget(entity.transform.x, Math.round(entity.transform.y), entity.transform.z);
    if (!candidate) return false;
    this.pendingTarget = candidate;
    return true;
  }

  canContinueToUse(): boolean {
    if (!this.target) return false;
    if (this.ticksRunning >= this.opts.maxDurationTicks) return false;
    const entity = this.opts.manager.get(this.opts.entityId);
    if (!entity || entity.state !== 'ACTIVE') return false;
    const dx = this.target.x - entity.transform.x;
    const dz = this.target.z - entity.transform.z;
    return Math.sqrt(dx * dx + dz * dz) > this.opts.arrivalRadius;
  }

  start(): void {
    this.target = this.pendingTarget;
    this.ticksRunning = 0;
  }

  tick(): void {
    this.ticksRunning++;
    const entity = this.opts.manager.get(this.opts.entityId);
    if (!entity || !this.target) return;

    const dx = this.target.x - entity.transform.x;
    const dz = this.target.z - entity.transform.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-6) {
      this.opts.manager.setVelocity(entity.id, { ...entity.velocity, vx: 0, vz: 0 });
      return;
    }
    const vx = (dx / dist) * this.opts.speed;
    const vz = (dz / dist) * this.opts.speed;
    this.opts.manager.setVelocity(entity.id, { vx, vy: entity.velocity.vy, vz });
  }

  stop(): void {
    const entity = this.opts.manager.get(this.opts.entityId);
    if (!entity) return;
    this.opts.manager.setVelocity(entity.id, { vx: 0, vy: entity.velocity.vy, vz: 0 });
  }

  private pickWanderTarget(cx: number, cy: number, cz: number): { x: number; z: number } | null {
    for (let attempt = 0; attempt < MAX_TARGET_ATTEMPTS; attempt++) {
      const angle = this.opts.rng.nextFloat() * Math.PI * 2;
      const dist = this.opts.rng.nextFloat() * this.opts.radius;
      const x = Math.floor(cx + Math.cos(angle) * dist);
      const z = Math.floor(cz + Math.sin(angle) * dist);

      if (classifyNode(this.opts.world, x, cy, z) === PathNodeType.Water) continue;
      if (canStandAt(this.opts.world, x, cy, z, this.opts.height)) {
        return { x: x + 0.5, z: z + 0.5 };
      }
    }
    return null;
  }
}

/** Constructor options for {@link LookGoal}. */
export interface LookGoalOptions {
  manager: EntityManager;
  entityId: number;
  rng: SeedRng;
  /** Per-tick probability of picking a new look direction. Default 1/40. */
  changeChance?: number;
}

/** Look-flagged filler goal: periodically applies a new random yaw. Always eligible. */
export class LookGoal implements Goal {
  readonly flags: readonly GoalFlag[] = [GoalFlag.Look];
  private readonly manager: EntityManager;
  private readonly entityId: number;
  private readonly rng: SeedRng;
  private readonly changeChance: number;

  constructor(opts: LookGoalOptions) {
    this.manager = opts.manager;
    this.entityId = opts.entityId;
    this.rng = opts.rng;
    this.changeChance = opts.changeChance ?? 1 / 40;
  }

  canUse(): boolean {
    const entity = this.manager.get(this.entityId);
    return !!entity && entity.state === 'ACTIVE';
  }

  tick(): void {
    const entity = this.manager.get(this.entityId);
    if (!entity) return;
    if (this.rng.nextFloat() >= this.changeChance) return;
    const yaw = this.rng.nextFloat() * 360;
    this.manager.setTransform(entity.id, { ...entity.transform, yaw });
  }
}
