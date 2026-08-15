/**
 * General entity-core manager (129), extended with a chunk-scoped persistence
 * bridge (131).
 *
 * Owns every live `EntityInstance` for one world: mints stable, strictly
 * increasing runtime ids; validates spawn inputs (registered 017 type,
 * finite transform/velocity, non-colliding explicit id); tracks lifecycle
 * (`ACTIVE`/`REMOVED`); and offers pure position/velocity/dimension setters.
 * `serializeChunk`/`deserializeChunk` (131) bridge persistent entities to the
 * already-generic 037 `SerializedEntity` envelope / 038 `'entities'`
 * `SaveUnitKind` plumbing. Collision/physics (130) is a separate module;
 * chunk-based activation (132) and the dirty data tracker (133) are explicit
 * non-goals here; no existing entity kind (item entities, xp orbs) is
 * migrated onto it.
 */
import type { EntityRegistry } from '../data/EntityType';
import { type ResourceId, resourceIdToString, tryParseResourceId } from '../data/ResourceId';
import { sectionIndex } from '../math/SectionCoordinate';
import {
  ENTITY_RECORD_VERSION,
  validateSerializedEntity,
  type SerializedEntity,
} from '../storage/EntityRecord';
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

  /**
   * Serialize every `ACTIVE`, persistent (017 `isPersistent === true`) entity
   * currently in chunk `(cx, cz)` to the 037 `SerializedEntity` envelope. Pure:
   * never throws, never mutates the manager. Non-persistent, `REMOVED`, and
   * out-of-chunk entities are excluded.
   */
  serializeChunk(cx: number, cz: number): SerializedEntity[] {
    const out: SerializedEntity[] = [];
    for (const e of this.getAll()) {
      if (!this.registry.get(e.typeId).isPersistent) continue;
      if (sectionIndex(e.transform.x) !== cx || sectionIndex(e.transform.z) !== cz) continue;
      out.push({
        schemaVersion: ENTITY_RECORD_VERSION,
        typeKey: resourceIdToString(e.typeId),
        x: Math.floor(e.transform.x),
        y: Math.floor(e.transform.y),
        z: Math.floor(e.transform.z),
        data: {
          id: e.id,
          dimension: resourceIdToString(e.dimension),
          transform: e.transform,
          velocity: e.velocity,
        },
      });
    }
    return out;
  }

  /**
   * Restore chunk `(cx, cz)`'s entities from 037 `SerializedEntity` payloads.
   * The whole batch is validated first (envelope, chunk membership, registered
   * `typeKey`, well-formed `dimension`/`transform`/`velocity`, no duplicate id
   * within the batch or against the manager); on any rejection the manager is
   * left unchanged and an `Error` is thrown. Returns the number of entities
   * spawned.
   */
  deserializeChunk(cx: number, cz: number, entities: unknown[]): number {
    const parsed = entities.map((e) => validateSerializedEntity(e));

    interface Pending {
      id: number;
      typeId: ResourceId;
      dimension: ResourceId;
      transform: EntityTransform;
      velocity: EntityVelocity;
    }
    const pending: Pending[] = [];
    const seenIds = new Set<number>();

    for (const record of parsed) {
      if (sectionIndex(record.x) !== cx || sectionIndex(record.z) !== cz) {
        throw new Error(`EntityManager: entity at ${record.x},${record.z} is outside chunk ${cx},${cz}`);
      }
      const typeId = tryParseResourceId(record.typeKey);
      if (!typeId || !this.registry.has(typeId)) {
        throw new Error(`EntityManager: unknown or malformed entity typeKey ${record.typeKey}`);
      }
      if (typeof record.data !== 'object' || record.data === null) {
        throw new Error('EntityManager: malformed entity data payload');
      }
      const d = record.data as Record<string, unknown>;
      if (!Number.isInteger(d.id) || (d.id as number) < 0) {
        throw new Error('EntityManager: entity data.id must be a non-negative integer');
      }
      if (typeof d.dimension !== 'string') {
        throw new Error('EntityManager: entity data.dimension must be a string');
      }
      const dimension = tryParseResourceId(d.dimension);
      if (!dimension) {
        throw new Error(`EntityManager: malformed entity dimension ${d.dimension}`);
      }
      if (typeof d.transform !== 'object' || d.transform === null || !isValidTransform(d.transform as EntityTransform)) {
        throw new Error('EntityManager: malformed entity transform payload');
      }
      if (typeof d.velocity !== 'object' || d.velocity === null || !isValidVelocity(d.velocity as EntityVelocity)) {
        throw new Error('EntityManager: malformed entity velocity payload');
      }
      const id = d.id as number;
      if (seenIds.has(id) || this.byId.has(id)) {
        throw new Error(`EntityManager: duplicate entity id ${id}`);
      }
      seenIds.add(id);
      pending.push({
        id,
        typeId,
        dimension,
        transform: d.transform as EntityTransform,
        velocity: d.velocity as EntityVelocity,
      });
    }

    for (const p of pending) {
      this.spawn(p.typeId, p.dimension, p.transform, { id: p.id, velocity: p.velocity });
    }
    return pending.length;
  }
}
