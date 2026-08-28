/**
 * Shape-aware collision and gravity for non-player entities (130).
 *
 * `computeEntityPhysicsStep` is a pure per-tick step: apply gravity to vertical
 * velocity (clamped at a terminal velocity), integrate the resulting velocity
 * through the existing 057 `CollisionResolver`/056 `VoxelShape` shape-aware
 * collision primitive, zero the velocity component of any axis that collided,
 * and report whether the entity is now grounded. `tickEntityPhysics` is a thin
 * wrapper that reads/writes one entity's transform/velocity through a 129
 * `EntityManager`.
 *
 * `PlayerPhysics` is untouched (this is explicitly non-player scope); no
 * sub-stepping, no per-type bounding-box storage on the 017 `EntityRegistry`,
 * no fluid physics, and no `Game` tick-loop wiring are in scope here.
 *
 * Physics tiering (audit 02 §8): this is the mob tier — kinematic AABB with
 * shape-aware axis-separated resolution and per-axis collision flags.
 * Items/XP use a cheaper gravity + ground-snap policy; projectiles use the
 * swept segment traversal in `ProjectileCore` to prevent tunneling.
 *
 * Transform convention (matches `PlayerPhysics`): `transform.x`/`z` are the
 * entity box's horizontal center; `transform.y` is the box's bottom (feet).
 */
import type { CollisionResolver, ShapeWorld } from '../world/CollisionResolver';
import type { EntityManager } from './EntityManager';
import type { EntityTransform, EntityVelocity } from '../world/Entity';

/** A physics-relevant bounding box for one entity. All fields must be positive. */
export interface EntityPhysicsBox {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Optional overrides for one physics step. */
export interface EntityPhysicsOptions {
  gravity?: number;
  terminalVelocity?: number;
}

/** Result of one physics step. */
export interface EntityPhysicsStepResult {
  transform: EntityTransform;
  velocity: EntityVelocity;
  onGround: boolean;
}

/**
 * Default gravity in blocks/s^2. Duplicated from (rather than imported as)
 * `CONFIG.player.gravity`'s value, so non-player entity physics is not coupled
 * to the player config namespace, while staying physically consistent.
 */
export const DEFAULT_GRAVITY = 26.0;

/**
 * Default terminal (max downward) velocity in blocks/s. Duplicated from
 * `CONFIG.player.terminalVelocity`'s value for the same reason as
 * {@link DEFAULT_GRAVITY}.
 */
export const DEFAULT_TERMINAL_VELOCITY = 54.0;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Run one gravity + shape-aware-collision step for an entity. Pure: never
 * mutates `transform`/`velocity`/`box`. `dt` is only used as a multiplier —
 * a non-finite `dt` is treated as `0` (gravity still integrates into
 * velocity, but no displacement occurs and nothing collides).
 */
export function computeEntityPhysicsStep(
  world: ShapeWorld,
  resolver: CollisionResolver,
  transform: EntityTransform,
  velocity: EntityVelocity,
  box: EntityPhysicsBox,
  dt: number,
  opts: EntityPhysicsOptions = {},
): EntityPhysicsStepResult {
  const gravity = opts.gravity ?? DEFAULT_GRAVITY;
  const terminalVelocity = opts.terminalVelocity ?? DEFAULT_TERMINAL_VELOCITY;
  const d = isFiniteNumber(dt) ? dt : 0;

  const vy = Math.max(velocity.vy - gravity * d, -terminalVelocity);

  const collisionBox = {
    x: transform.x - box.width / 2,
    y: transform.y,
    z: transform.z - box.depth / 2,
    width: box.width,
    height: box.height,
    depth: box.depth,
  };
  const result = resolver.move(world, collisionBox, velocity.vx * d, vy * d, velocity.vz * d);

  const newTransform: EntityTransform = {
    x: result.x + box.width / 2,
    y: result.y,
    z: result.z + box.depth / 2,
    yaw: transform.yaw,
    pitch: transform.pitch,
  };
  const newVelocity: EntityVelocity = {
    vx: result.collidedX ? 0 : velocity.vx,
    vy: result.collidedY ? 0 : vy,
    vz: result.collidedZ ? 0 : velocity.vz,
  };
  const onGround = result.collidedY && vy < 0;

  return { transform: newTransform, velocity: newVelocity, onGround };
}

/**
 * Run one physics step for the entity `id` in `manager` and persist the
 * result via `setTransform`/`setVelocity`. Returns `{ ran: false, onGround:
 * false }` without touching the manager when `id` does not resolve to an
 * `ACTIVE` entity, or when `dt` is not a finite positive number.
 */
export function tickEntityPhysics(
  manager: EntityManager,
  id: number,
  world: ShapeWorld,
  resolver: CollisionResolver,
  box: EntityPhysicsBox,
  dt: number,
  opts: EntityPhysicsOptions = {},
): { ran: boolean; onGround: boolean } {
  if (!isFiniteNumber(dt) || dt <= 0) {
    return { ran: false, onGround: false };
  }
  const entity = manager.get(id);
  if (!entity || entity.state !== 'ACTIVE') {
    return { ran: false, onGround: false };
  }
  const step = computeEntityPhysicsStep(world, resolver, entity.transform, entity.velocity, box, dt, opts);
  manager.setTransform(id, step.transform);
  manager.setVelocity(id, step.velocity);
  return { ran: true, onGround: step.onGround };
}
