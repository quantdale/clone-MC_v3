/**
 * General entity-core manager (129).
 *
 * Owns every live `EntityInstance` for one world: mints stable, strictly
 * increasing runtime ids; validates spawn inputs (registered 017 type,
 * finite transform/velocity, non-colliding explicit id); tracks lifecycle
 * (`ACTIVE`/`REMOVED`); and offers pure position/velocity/dimension setters.
 * This is the data/runtime substrate — collision/physics (130), persistence
 * (131), chunk-based activation (132), and the dirty data tracker (133) are
 * explicit non-goals; no existing entity kind (item entities, xp orbs) is
 * migrated onto it here.
 */
import type { EntityRegistry } from '../data/EntityType';
import { type ResourceId, resourceIdToString } from '../data/ResourceId';
import {
  type EntityInstance,
  type EntityTransform,
  type EntityVelocity,
  ZERO_VELOCITY,
  isValidTransform,
  isValidVelocity,
} from '../world/Entity';

/** Optional spawn parameters. */
export interface SpawnEntityOptions {
  /** Initial velocity; defaults to {@link ZERO_VELOCITY}. */
  velocity?: EntityVelocity;
  /** Explicit id to assign instead of the next minted id. Must not collide with any existing record. */
  id?: number;
}

/** World-scoped store of general entity instances with deterministic id minting. */
export class EntityManager {
  private readonly registry: EntityRegistry;
  private readonly byId = new Map<number, EntityInstance>();
  private readonly order: number[] = [];
  private nextId = 0;

  constructor(registry: EntityRegistry) {
    this.registry = registry;
  }

  /**
   * Spawn a new `ACTIVE` entity of `typeId` in `dimension` at `transform`.
   * Throws (leaving the manager unchanged) when `typeId` is unregistered,
   * `transform`/`velocity` hold a non-finite field, or an explicit `opts.id`
   * collides with any existing record (`ACTIVE` or retained `REMOVED`).
   * `velocity` defaults to {@link ZERO_VELOCITY}; `id` defaults to the next
   * minted id. Stores defensive copies of `transform`/`velocity`.
   */
  spawn(
    typeId: ResourceId,
    dimension: ResourceId,
    transform: EntityTransform,
    opts: SpawnEntityOptions = {},
  ): EntityInstance {
    if (!this.registry.has(typeId)) {
      throw new Error(`EntityManager: unknown entity type ${resourceIdToString(typeId)}`);
    }
    if (!isValidTransform(transform)) {
      throw new Error('EntityManager: transform must hold finite x/y/z/yaw/pitch');
    }
    const velocity = opts.velocity ?? ZERO_VELOCITY;
    if (!isValidVelocity(velocity)) {
      throw new Error('EntityManager: velocity must hold finite vx/vy/vz');
    }
    const id = opts.id ?? this.nextId;
    if (this.byId.has(id)) {
      throw new Error(`EntityManager: id ${id} is already in use`);
    }
    const entity: EntityInstance = {
      id,
      typeId,
      transform: { ...transform },
      velocity: { ...velocity },
      dimension,
      state: 'ACTIVE',
    };
    this.byId.set(id, entity);
    this.order.push(id);
    if (id >= this.nextId) this.nextId = id + 1;
    return entity;
  }

  /** The entity with `id` regardless of lifecycle state, or `undefined` if never spawned. */
  get(id: number): EntityInstance | undefined {
    return this.byId.get(id);
  }

  /** All `ACTIVE` entities in spawn order. */
  getAll(): EntityInstance[] {
    const out: EntityInstance[] = [];
    for (const id of this.order) {
      const e = this.byId.get(id);
      if (e && e.state === 'ACTIVE') out.push(e);
    }
    return out;
  }

  /** `ACTIVE` entities currently owned by `dimension` (compared by value), in spawn order. */
  getInDimension(dimension: ResourceId): EntityInstance[] {
    const key = resourceIdToString(dimension);
    return this.getAll().filter((e) => resourceIdToString(e.dimension) === key);
  }

  /**
   * Replace `id`'s transform with a defensive copy of `transform`. Returns
   * `false` (no write) for an unknown/`REMOVED` id or a non-finite field;
   * `true` on success.
   */
  setTransform(id: number, transform: EntityTransform): boolean {
    const e = this.byId.get(id);
    if (!e || e.state !== 'ACTIVE' || !isValidTransform(transform)) return false;
    e.transform = { ...transform };
    return true;
  }

  /** Replace `id`'s velocity. Same failure contract as {@link setTransform}. */
  setVelocity(id: number, velocity: EntityVelocity): boolean {
    const e = this.byId.get(id);
    if (!e || e.state !== 'ACTIVE' || !isValidVelocity(velocity)) return false;
    e.velocity = { ...velocity };
    return true;
  }

  /**
   * Move `id` to a new dimension, preserving its transform/velocity. Returns
   * `false` (no write) for an unknown/`REMOVED` id; `true` on success.
   */
  changeDimension(id: number, dimension: ResourceId): boolean {
    const e = this.byId.get(id);
    if (!e || e.state !== 'ACTIVE') return false;
    e.dimension = dimension;
    return true;
  }

  /**
   * Mark `id` `REMOVED` and drop it from the active/insertion-order index.
   * Idempotent: an already-`REMOVED` or unknown id returns `false`. The
   * record is retained (with `state: 'REMOVED'`) so a later `get(id)` can
   * still observe its final state, and so its id cannot be resurrected via
   * an explicit `spawn` collision.
   */
  remove(id: number): boolean {
    const e = this.byId.get(id);
    if (!e || e.state !== 'ACTIVE') return false;
    e.state = 'REMOVED';
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    return true;
  }

  /** Number of `ACTIVE` entities. */
  get size(): number {
    return this.order.length;
  }

  /** Remove every entity (active or removed) and reset id minting. */
  clear(): void {
    this.byId.clear();
    this.order.length = 0;
    this.nextId = 0;
  }
}
