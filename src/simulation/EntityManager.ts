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
 * `SaveUnitKind` plumbing. Collision/physics (130) is a separate module; the
 * dirty data tracker (133) remains a non-goal; no existing entity kind (item
 * entities, xp orbs) is migrated onto it.
 *
 * Phase 8 (entity scale): the manager also owns a chunk-partitioned spatial
 * index maintained incrementally on spawn/move/remove (no per-tick rebuild),
 * radius/chunk queries over that index, an activation-range machinery with
 * enter/exit hysteresis around the caller-supplied simulation distance, and a
 * round-robin per-tick update budget for full entity updates.
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

/**
 * Chunk-key packing range: chunk coordinates are assumed to lie within
 * `[-CHUNK_KEY_BIAS, CHUNK_KEY_BIAS)` (±524288 chunks, i.e. ±8.4M blocks —
 * far beyond any real world). Keys pack into one exact float64.
 */
const CHUNK_KEY_BITS = 20;
const CHUNK_KEY_BIAS = 1 << (CHUNK_KEY_BITS - 1);
const CHUNK_KEY_MOD = 1 << CHUNK_KEY_BITS;

/** Pack `(cx, cz)` into one compact numeric key (bijective over the biased range). */
function packChunkKey(cx: number, cz: number): number {
  return (cx + CHUNK_KEY_BIAS) * CHUNK_KEY_MOD + (cz + CHUNK_KEY_BIAS);
}

/** Inverse of {@link packChunkKey}. */
function unpackChunkKey(key: number): { cx: number; cz: number } {
  const cx = Math.floor(key / CHUNK_KEY_MOD) - CHUNK_KEY_BIAS;
  const cz = (key % CHUNK_KEY_MOD) - CHUNK_KEY_BIAS;
  return { cx, cz };
}

/**
 * Distance (blocks) beyond the simulation distance at which an entity counts
 * as inactive; it must come back inside the plain simulation distance to
 * reactivate, giving a hysteresis band that prevents activate/deactivate
 * thrash for entities hovering near the boundary.
 */
export const ACTIVATION_HYSTERESIS_BLOCKS = 16;

/**
 * Per-tick full-update budget default: at most this many activation-active
 * entities receive a full update slot per {@link EntityManager.collectUpdateSet}
 * call when the caller passes no explicit budget.
 */
export const DEFAULT_TICK_ENTITY_BUDGET = 64;

/** Per-entity activation bookkeeping. */
interface ActivationState {
  /** Whether the entity currently passes the activation range check. */
  active: boolean;
}

/** World-scoped store of general entity instances with deterministic id minting. */
export class EntityManager {
  private readonly registry: EntityRegistry;
  private readonly byId = new Map<number, EntityInstance>();
  private readonly order: number[] = [];
  private nextId = 0;

  /**
   * Spatial index: packed chunk key -> ids of `ACTIVE` entities whose
   * transform's column chunk is that chunk. Maintained incrementally by every
   * mutating operation; never rebuilt per tick.
   */
  private readonly chunkBuckets = new Map<number, Set<number>>();

  /** Activation state per entity id (only entities evaluated at least once). */
  private readonly activation = new Map<number, ActivationState>();

  /** Rotating cursor into {@link order} used by {@link collectUpdateSet}'s round-robin. */
  private updateCursor = 0;

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
    this.indexAdd(id, entity.transform.x, entity.transform.z);
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
    const oldX = e.transform.x;
    const oldZ = e.transform.z;
    e.transform = { ...transform };
    if (sectionIndex(oldX) !== sectionIndex(e.transform.x) || sectionIndex(oldZ) !== sectionIndex(e.transform.z)) {
      this.indexMove(id, oldX, oldZ, e.transform.x, e.transform.z);
    }
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
    this.indexRemove(id, e.transform.x, e.transform.z);
    this.activation.delete(id);
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
    this.chunkBuckets.clear();
    this.activation.clear();
    this.updateCursor = 0;
  }

  /**
   * Serialize every `ACTIVE`, persistent (017 `isPersistent === true`) entity
   * currently in chunk `(cx, cz)` to the 037 `SerializedEntity` envelope. Pure:
   * never throws, never mutates the manager. Non-persistent, `REMOVED`, and
   * out-of-chunk entities are excluded.
   */
  serializeChunk(cx: number, cz: number): SerializedEntity[] {
    const out: SerializedEntity[] = [];
    for (const e of this.getInChunk(cx, cz)) {
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

  /**
   * Permanently evict every entity (whether `ACTIVE` or retained `REMOVED`)
   * whose last-known transform's chunk equals `(cx, cz)`. Unlike `remove()`,
   * this frees the id for reuse by a later `spawn`/`deserializeChunk` (132's
   * "chunk unloaded, forget it" operation, distinct from "entity died").
   * Returns the number of entities evicted. Never throws.
   */
  forgetChunk(cx: number, cz: number): number {
    let removed = 0;
    for (const [id, entity] of [...this.byId.entries()]) {
      if (sectionIndex(entity.transform.x) !== cx || sectionIndex(entity.transform.z) !== cz) continue;
      this.byId.delete(id);
      this.indexRemove(id, entity.transform.x, entity.transform.z);
      this.activation.delete(id);
      const index = this.order.indexOf(id);
      if (index >= 0) this.order.splice(index, 1);
      removed++;
    }
    return removed;
  }

  // ------------------------------------------------------------------
  // Spatial index maintenance (private, incremental)
  // ------------------------------------------------------------------

  private indexAdd(id: number, x: number, z: number): void {
    const key = packChunkKey(sectionIndex(x), sectionIndex(z));
    let bucket = this.chunkBuckets.get(key);
    if (!bucket) {
      bucket = new Set();
      this.chunkBuckets.set(key, bucket);
    }
    bucket.add(id);
  }

  private indexRemove(id: number, x: number, z: number): void {
    const key = packChunkKey(sectionIndex(x), sectionIndex(z));
    const bucket = this.chunkBuckets.get(key);
    if (!bucket) return;
    bucket.delete(id);
    if (bucket.size === 0) this.chunkBuckets.delete(key);
  }

  private indexMove(id: number, oldX: number, oldZ: number, newX: number, newZ: number): void {
    this.indexRemove(id, oldX, oldZ);
    this.indexAdd(id, newX, newZ);
  }

  // ------------------------------------------------------------------
  // Spatial queries
  // ------------------------------------------------------------------

  /**
   * All `ACTIVE` entities whose transform's column chunk is `(cx, cz)`, in
   * spawn order within the chunk. O(bucket size); no scan of other chunks.
   */
  getInChunk(cx: number, cz: number): EntityInstance[] {
    const bucket = this.chunkBuckets.get(packChunkKey(cx, cz));
    if (!bucket) return [];
    const out: EntityInstance[] = [];
    for (const id of bucket) {
      const e = this.byId.get(id);
      if (e && e.state === 'ACTIVE') out.push(e);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  /**
   * All `ACTIVE` entities whose column chunk satisfies `include`, grouped by
   * chunk bucket (order is by bucket insertion, then id within a bucket —
   * not globally spawn order). O(matched buckets' sizes).
   */
  getInChunks(include: (cx: number, cz: number) => boolean): EntityInstance[] {
    const out: EntityInstance[] = [];
    for (const [key, bucket] of this.chunkBuckets) {
      const { cx, cz } = unpackChunkKey(key);
      if (!include(cx, cz)) continue;
      for (const id of bucket) {
        const e = this.byId.get(id);
        if (e && e.state === 'ACTIVE') out.push(e);
      }
    }
    return out;
  }

  /**
   * All `ACTIVE` entities within `radius` blocks (euclidean, 3D) of
   * `(x, y, z)`, optionally restricted to one dimension. Iterates only the
   * chunk buckets overlapping the radius's horizontal square, so cost is
   * O(covered buckets × their sizes), independent of total entity count.
   * Result order is unspecified.
   */
  queryRadius(
    x: number,
    y: number,
    z: number,
    radius: number,
    dimension?: ResourceId,
  ): EntityInstance[] {
    if (!(radius >= 0)) return [];
    const dimKey = dimension === undefined ? null : resourceIdToString(dimension);
    const r2 = radius * radius;
    const minCx = sectionIndex(x - radius);
    const maxCx = sectionIndex(x + radius);
    const minCz = sectionIndex(z - radius);
    const maxCz = sectionIndex(z + radius);
    const out: EntityInstance[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.chunkBuckets.get(packChunkKey(cx, cz));
        if (!bucket) continue;
        for (const id of bucket) {
          const e = this.byId.get(id);
          if (!e || e.state !== 'ACTIVE') continue;
          if (dimKey !== null && resourceIdToString(e.dimension) !== dimKey) continue;
          const dx = e.transform.x - x;
          const dy = e.transform.y - y;
          const dz = e.transform.z - z;
          if (dx * dx + dy * dy + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Activation ranges (simulation LOD gate)
  // ------------------------------------------------------------------

  /**
   * Recompute activation for every `ACTIVE` entity against the player at
   * `(px, py, pz)` and `simulationDistanceBlocks`. An entity activates when
   * its distance is within the simulation distance and deactivates only once
   * it exceeds it by {@link ACTIVATION_HYSTERESIS_BLOCKS} (enter/exit
   * hysteresis band). Entities never evaluated before start active iff inside
   * range. Returns how many entities are active after the update. O(n).
   *
   * Inactive entities should skip AI/goal ticking and full physics; callers
   * may still apply cheap gravity via {@link collectUpdateSet}'s complement.
   */
  updateActivation(
    px: number,
    py: number,
    pz: number,
    simulationDistanceBlocks: number,
  ): number {
    const enterR2 = simulationDistanceBlocks * simulationDistanceBlocks;
    const exitR2 = (simulationDistanceBlocks + ACTIVATION_HYSTERESIS_BLOCKS) ** 2;
    let activeCount = 0;
    for (const id of this.order) {
      const e = this.byId.get(id);
      if (!e || e.state !== 'ACTIVE') continue;
      const dx = e.transform.x - px;
      const dy = e.transform.y - py;
      const dz = e.transform.z - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      let state = this.activation.get(id);
      if (!state) {
        state = { active: d2 <= exitR2 };
        this.activation.set(id, state);
      } else if (state.active) {
        if (d2 > exitR2) state.active = false;
      } else if (d2 <= enterR2) {
        state.active = true;
      }
      if (state.active) activeCount++;
    }
    return activeCount;
  }

  /**
   * Whether `id` currently passes the activation range check. Entities never
   * evaluated by {@link updateActivation} count as active (fail-open), so an
   * integration that never calls `updateActivation` behaves exactly like the
   * pre-activation always-tick behavior.
   */
  isActivationActive(id: number): boolean {
    const state = this.activation.get(id);
    return !state || state.active;
  }

  // ------------------------------------------------------------------
  // Per-tick update budget (round-robin overflow deferral)
  // ------------------------------------------------------------------

  /**
   * Select up to `maxEntities` (default {@link DEFAULT_TICK_ENTITY_BUDGET})
   * entities that are both `ACTIVE` and activation-active, starting from a
   * rotating cursor so entities starved by the budget this tick are first in
   * line next tick (round-robin deferral). Cost is O(scan window), not
   * O(total entities) when the budget binds early.
   */
  collectUpdateSet(maxEntities: number = DEFAULT_TICK_ENTITY_BUDGET): EntityInstance[] {
    if (maxEntities <= 0 || this.order.length === 0) return [];
    const out: EntityInstance[] = [];
    const n = this.order.length;
    let scanned = 0;
    let cursor = this.updateCursor % n;
    while (scanned < n && out.length < maxEntities) {
      const id = this.order[cursor];
      if (id === undefined) break;
      const e = this.byId.get(id);
      if (e && e.state === 'ACTIVE' && this.isActivationActive(id)) out.push(e);
      cursor = (cursor + 1) % n;
      scanned++;
    }
    this.updateCursor = cursor;
    return out;
  }
}
