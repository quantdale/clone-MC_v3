/**
 * Projectile motion/collision core (142): one pure per-tick step over 057's
 * `CollisionResolver` — vanilla-style gravity+drag motion, entity-hit
 * detection with owner immunity, block-hit detection, and age-based
 * expiration. No damage computation, no entity/item representation, and no
 * `Game`/spawning wiring — see
 * `openspec/changes/142-projectile-core/design.md`.
 *
 * Physics tiering (audit 02 §8): projectiles are the swept-collision tier.
 * Block hits go through 057 `CollisionResolver.move`, which scans every voxel
 * cell along each axis's full swept path (start -> final) and clamps to the
 * first shape face — so a fast projectile cannot tunnel through partial shapes
 * (slabs, fences, carpets) at any legal tick velocity, unlike a point sample.
 * Items/XP use the cheaper ground-snap policy; mobs use `EntityPhysics`.
 */
import type { CollisionResolver, ShapeWorld } from '../world/CollisionResolver';

/** A projectile's motion/lifecycle state. */
export interface ProjectileState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ownerId: number | null;
  ageTicks: number;
}

/** Optional per-step parameters. */
export interface ProjectileOptions {
  /** Downward acceleration per tick (blocks/tick^2). Default 0.05 (vanilla arrow gravity). */
  gravity?: number;
  /** Velocity-retained factor applied per clear-flight tick. Default 0.99 (vanilla arrow drag). */
  drag?: number;
  /** Ticks after which the projectile expires. Default 1200 (60s at 20 TPS). */
  maxAgeTicks?: number;
  /** Ticks (from the post-increment age) during which the owner cannot be hit. Default 5. */
  ownerImmunityTicks?: number;
  /** Edge length of the cube used for block collision. Default 0.25. */
  hitboxSize?: number;
}

/** One candidate entity a projectile may hit this tick. */
export interface ProjectileTarget {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Result of one `stepProjectile` call. */
export interface ProjectileStepResult {
  state: ProjectileState;
  hitBlock: { x: number; y: number; z: number } | null;
  hitEntityId: number | null;
  expired: boolean;
}

const DEFAULT_GRAVITY = 0.05;
const DEFAULT_DRAG = 0.99;
const DEFAULT_MAX_AGE_TICKS = 1200;
const DEFAULT_OWNER_IMMUNITY_TICKS = 5;
const DEFAULT_HITBOX_SIZE = 0.25;

/**
 * Advance `state` by one tick: gravity is subtracted from `vy`, position is
 * integrated, then (only on a clear-flight tick) drag is applied to the
 * velocity stored for the next tick. Entity-hit detection (against the tick's
 * destination point, excluding the immune owner) is checked before block
 * collision (via `resolver`, treating the projectile as a small cube); the
 * first one to fire wins and zeroes velocity. Past `maxAgeTicks`, returns
 * `expired: true` with the input position/velocity unchanged.
 */
export function stepProjectile(
  world: ShapeWorld,
  resolver: CollisionResolver,
  state: ProjectileState,
  targets: readonly ProjectileTarget[],
  options: ProjectileOptions = {},
): ProjectileStepResult {
  const gravity = options.gravity ?? DEFAULT_GRAVITY;
  const drag = options.drag ?? DEFAULT_DRAG;
  const maxAgeTicks = options.maxAgeTicks ?? DEFAULT_MAX_AGE_TICKS;
  const ownerImmunityTicks = options.ownerImmunityTicks ?? DEFAULT_OWNER_IMMUNITY_TICKS;
  const hitboxSize = options.hitboxSize ?? DEFAULT_HITBOX_SIZE;

  const ageTicks = state.ageTicks + 1;
  if (ageTicks > maxAgeTicks) {
    return { state: { ...state, ageTicks }, hitBlock: null, hitEntityId: null, expired: true };
  }

  const vy = state.vy - gravity;
  const dx = state.vx;
  const dy = vy;
  const dz = state.vz;
  const newX = state.x + dx;
  const newY = state.y + dy;
  const newZ = state.z + dz;

  let hitEntityId: number | null = null;
  for (const target of targets) {
    if (target.id === state.ownerId && ageTicks <= ownerImmunityTicks) continue;
    const ddx = newX - target.x;
    const ddy = newY - target.y;
    const ddz = newZ - target.z;
    const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
    if (distSq <= target.radius * target.radius) {
      hitEntityId = target.id;
      break;
    }
  }

  if (hitEntityId !== null) {
    return {
      state: { x: newX, y: newY, z: newZ, vx: 0, vy: 0, vz: 0, ownerId: state.ownerId, ageTicks },
      hitBlock: null,
      hitEntityId,
      expired: false,
    };
  }

  const half = hitboxSize / 2;
  const box = {
    x: state.x - half,
    y: state.y - half,
    z: state.z - half,
    width: hitboxSize,
    height: hitboxSize,
    depth: hitboxSize,
  };
  const result = resolver.move(world, box, dx, dy, dz);
  if (result.collidedX || result.collidedY || result.collidedZ) {
    const rx = result.x + half;
    const ry = result.y + half;
    const rz = result.z + half;
    return {
      state: { x: rx, y: ry, z: rz, vx: 0, vy: 0, vz: 0, ownerId: state.ownerId, ageTicks },
      hitBlock: { x: Math.floor(rx), y: Math.floor(ry), z: Math.floor(rz) },
      hitEntityId: null,
      expired: false,
    };
  }

  return {
    state: {
      x: newX,
      y: newY,
      z: newZ,
      vx: dx * drag,
      vy: vy * drag,
      vz: dz * drag,
      ownerId: state.ownerId,
      ageTicks,
    },
    hitBlock: null,
    hitEntityId: null,
    expired: false,
  };
}
