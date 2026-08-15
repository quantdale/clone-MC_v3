/**
 * World item-entity manager (111).
 *
 * Owns every live item entity for a world. Mints strictly increasing unique ids,
 * validates every spawn, splits oversized drops into stackSize chunks, advances age
 * on tick, queries/removes entities, and serializes to the 037 `SerializedEntity`
 * envelope used by the future entity-persistence runtime (131).
 *
 * Movement/collision (130), pickup/despawn/merge (112), and live autosave wiring
 * (131) build on this store; they are intentionally out of scope here. Velocity is
 * stored so 130 can integrate it without a data change.
 */
import type { ItemTypeRegistry } from '../inventory/ItemRegistry';
import {
  ITEM_ENTITY_TYPE_KEY,
  createItemEntity,
  type ItemEntity,
} from '../world/ItemEntity';
import { ENTITY_RECORD_VERSION, validateSerializedEntity, type SerializedEntity } from '../storage/EntityRecord';
import type { RandomSource } from '../inventory/LootTable';

/** A minimal item stack accepted by the spawn API. */
export interface ItemStackLike {
  readonly item: number;
  readonly count: number;
}

/** Horizontal/vertical spawn jitter half-spread (blocks) applied when an rng is supplied. */
const SPAWN_JITTER = 0.25;
/** Small stored upward motion seeded on spawn for future physics integration. */
const SPAWN_UP_VELOCITY = 0.05;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * World-scoped store of item entities with deterministic id minting and 037
 * envelope serialization. Construct one per world/dimension.
 */
export class ItemEntityManager {
  private readonly itemRegistry: ItemTypeRegistry;
  private readonly rng?: RandomSource;
  private readonly byId = new Map<number, ItemEntity>();
  private readonly order: number[] = [];
  private nextId = 0;

  constructor(opts: { itemRegistry: ItemTypeRegistry; rng?: RandomSource }) {
    this.itemRegistry = opts.itemRegistry;
    this.rng = opts.rng;
  }

  /**
   * Spawn a single item entity. Validates the item id, a positive integer count, and
   * finite coordinates. Rejects `count > stackSize` (split drops with
   * `spawnLootStacks` first). Throws and leaves the manager unchanged on any invalid
   * input. `vx/vy/vz` default to 0; `id` defaults to the next minted id.
   */
  spawnItemEntity(
    stack: ItemStackLike,
    x: number,
    y: number,
    z: number,
    opts?: { vx?: number; vy?: number; vz?: number; id?: number },
  ): ItemEntity {
    if (!this.itemRegistry.has(stack.item)) {
      throw new Error(`ItemEntityManager: unknown item id ${stack.item}`);
    }
    const max = this.itemRegistry.get(stack.item).stackSize;
    if (!Number.isInteger(stack.count) || stack.count < 1) {
      throw new Error(`ItemEntityManager: count must be a positive integer (got ${String(stack.count)})`);
    }
    if (stack.count > max) {
      throw new Error(`ItemEntityManager: count ${stack.count} exceeds stackSize ${max} for item ${stack.item}`);
    }
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
      throw new Error('ItemEntityManager: spawn position must be finite numbers');
    }
    const id = opts?.id ?? this.nextId++;
    const entity = createItemEntity({
      id,
      item: stack.item,
      count: stack.count,
      x,
      y,
      z,
      vx: opts?.vx,
      vy: opts?.vy,
      vz: opts?.vz,
    });
    this.byId.set(id, entity);
    this.order.push(id);
    if (id >= this.nextId) this.nextId = id + 1;
    return entity;
  }

  /**
   * Spawn one or more drops, splitting each stack into `ceil(count/stackSize)`
   * entities (each `<= stackSize`) and applying a small deterministic spawn jitter
   * derived from the supplied `rng` (or exact positions when `rng` is omitted).
   * Returns the spawned entities in spawn order.
   */
  spawnLootStacks(stacks: readonly ItemStackLike[], x: number, y: number, z: number, rng?: RandomSource): ItemEntity[] {
    const source = rng ?? this.rng;
    const spawned: ItemEntity[] = [];
    for (const stack of stacks) {
      const max = this.itemRegistry.get(stack.item).stackSize;
      let remaining = stack.count;
      while (remaining > 0) {
        const n = Math.min(remaining, max);
        const jx = source ? (source() - 0.5) * 2 * SPAWN_JITTER : 0;
        const jz = source ? (source() - 0.5) * 2 * SPAWN_JITTER : 0;
        const vy = source ? SPAWN_UP_VELOCITY : 0;
        const vx = source ? (source() - 0.5) * 2 * SPAWN_JITTER : 0;
        const vz = source ? (source() - 0.5) * 2 * SPAWN_JITTER : 0;
        spawned.push(
          this.spawnItemEntity({ item: stack.item, count: n }, x + jx, y, z + jz, { vx, vy, vz }),
        );
        remaining -= n;
      }
    }
    return spawned;
  }

  /** Remove the entity with `id`; returns whether one existed. */
  removeItemEntity(id: number): boolean {
    if (!this.byId.has(id)) return false;
    this.byId.delete(id);
    const index = this.order.indexOf(id);
    if (index >= 0) this.order.splice(index, 1);
    return true;
  }

  /** The entity with `id`, or `null`. */
  getItemEntity(id: number): ItemEntity | null {
    return this.byId.get(id) ?? null;
  }

  /** All live entities in insertion order. */
  getItemEntities(): ItemEntity[] {
    const out: ItemEntity[] = [];
    for (const id of this.order) {
      const e = this.byId.get(id);
      if (e) out.push(e);
    }
    return out;
  }

  /** Entities whose floored chunk coordinates match `(cx, cz)` in insertion order. */
  getItemEntitiesInChunk(cx: number, cz: number): ItemEntity[] {
    const out: ItemEntity[] = [];
    for (const id of this.order) {
      const e = this.byId.get(id);
      if (!e) continue;
      if (Math.floor(e.x / 16) === cx && Math.floor(e.z / 16) === cz) out.push(e);
    }
    return out;
  }

  /**
   * Advance every live entity's `ageTicks` by `round(dt * 20)` (20 ticks/second).
   * A non-positive `dt` is a no-op. Returns the number of ticked entities.
   */
  tickItemEntities(dt: number): number {
    if (!isFiniteNumber(dt) || dt <= 0) return 0;
    const ticks = Math.round(dt * 20);
    if (ticks <= 0) return 0;
    for (const id of this.order) {
      const e = this.byId.get(id);
      if (e) e.ageTicks += ticks;
    }
    return this.byId.size;
  }

  /** Number of live entities. */
  get size(): number {
    return this.byId.size;
  }

  /** Remove all entities. */
  clear(): void {
    this.byId.clear();
    this.order.length = 0;
    this.nextId = 0;
  }

  /** Serialize all live entities to the 037 `SerializedEntity` envelope. */
  serializeAll(): SerializedEntity[] {
    return this.order.map((id) => {
      const e = this.byId.get(id)!;
      return {
        schemaVersion: ENTITY_RECORD_VERSION,
        typeKey: ITEM_ENTITY_TYPE_KEY,
        x: Math.floor(e.x),
        y: Math.floor(e.y),
        z: Math.floor(e.z),
        data: {
          id: e.id,
          item: e.item,
          count: e.count,
          x: e.x,
          y: e.y,
          z: e.z,
          vx: e.vx,
          vy: e.vy,
          vz: e.vz,
          ageTicks: e.ageTicks,
        },
      };
    });
  }

  /**
   * Restore entities from 037 payloads. The whole batch is validated first
   * (envelope, `minecraft:item` type, and data shape); on any rejection the manager
   * is left unchanged and an `Error` is thrown. Returns the number of entities added.
   */
  deserializeAll(entities: unknown[]): number {
    const parsed = entities.map((e) => validateSerializedEntity(e));
    const rebuilt: ItemEntity[] = [];
    let maxId = -1;
    for (const record of parsed) {
      if (record.typeKey !== ITEM_ENTITY_TYPE_KEY) {
        throw new Error(`ItemEntityManager: unexpected entity typeKey ${record.typeKey}`);
      }
      const d = record.data as Record<string, unknown>;
      if (
        !isFiniteNumber(d.id) ||
        !Number.isInteger(d.id) ||
        !isFiniteNumber(d.item) ||
        !Number.isInteger(d.item) ||
        !isFiniteNumber(d.count) ||
        !Number.isInteger(d.count) ||
        !isFiniteNumber(d.x) ||
        !isFiniteNumber(d.y) ||
        !isFiniteNumber(d.z) ||
        !isFiniteNumber(d.vx) ||
        !isFiniteNumber(d.vy) ||
        !isFiniteNumber(d.vz) ||
        !isFiniteNumber(d.ageTicks) ||
        !Number.isInteger(d.ageTicks) ||
        (d.ageTicks as number) < 0
      ) {
        throw new Error('ItemEntityManager: malformed item-entity data payload');
      }
      rebuilt.push(
        createItemEntity({
          id: d.id as number,
          item: d.item as number,
          count: d.count as number,
          x: d.x as number,
          y: d.y as number,
          z: d.z as number,
          vx: d.vx as number,
          vy: d.vy as number,
          vz: d.vz as number,
          ageTicks: d.ageTicks as number,
        }),
      );
      if ((d.id as number) > maxId) maxId = d.id as number;
    }

    this.byId.clear();
    this.order.length = 0;
    for (const entity of rebuilt) {
      this.byId.set(entity.id, entity);
      this.order.push(entity.id);
    }
    this.nextId = maxId + 1;
    return rebuilt.length;
  }
}
