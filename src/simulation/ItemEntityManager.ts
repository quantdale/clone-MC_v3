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

/** Ticks before a freshly spawned drop may be collected (0.5s at 20 TPS). */
export const PICKUP_DELAY_TICKS = 10;
/** Ticks before an uncollected drop despawns (5 min at 20 TPS). */
export const DESPAWN_AGE_TICKS = 6000;
/** Center-distance (blocks) within which same-item entities merge. */
export const MERGE_RADIUS = 0.25;
/** Player-center → entity distance (blocks) within which a delayed drop is collected. */
export const PICKUP_RADIUS = 1.5;

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

  /**
   * Fold overlapping same-item entities into one up to the item's `stackSize`.
   * For each entity (lower id first), the first later entity with the same
   * `item` and a center distance `<= radius` is merged into it when the summed
   * count fits within `stackSize` (otherwise both are left intact). Merged
   * entities are removed. Returns the number of entities removed.
   */
  mergeEntities(radius: number = MERGE_RADIUS): number {
    const ids = [...this.order];
    const removedIds = new Set<number>();
    const radiusSq = radius * radius;
    let removed = 0;
    for (let i = 0; i < ids.length; i++) {
      const aId = ids[i]!;
      if (removedIds.has(aId)) continue;
      const a = this.byId.get(aId);
      if (!a) continue;
      const max = this.itemRegistry.get(a.item).stackSize;
      if (a.count >= max) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const bId = ids[j]!;
        if (removedIds.has(bId)) continue;
        const b = this.byId.get(bId);
        if (!b || b.item !== a.item) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        if (dx * dx + dy * dy + dz * dz > radiusSq) continue;
        if (a.count + b.count > max) continue;
        a.count += b.count;
        removedIds.add(bId);
        this.removeItemEntity(bId);
        removed++;
        if (a.count >= max) break;
      }
    }
    return removed;
  }

  /**
   * Remove every entity whose `ageTicks >= maxAgeTicks`. The boundary is
   * inclusive, so an entity exactly at the cap despawns. Returns the number
   * removed.
   */
  despawnExpired(maxAgeTicks: number = DESPAWN_AGE_TICKS): number {
    let removed = 0;
    for (const id of [...this.order]) {
      const e = this.byId.get(id);
      if (e && e.ageTicks >= maxAgeTicks) {
        this.removeItemEntity(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Collect every deliverable drop for the player. A drop is deliverable when
   * `ageTicks >= PICKUP_DELAY_TICKS` and its center is within `pickupRadius` of
   * `(playerX, playerY, playerZ)`. Each is offered to `insert(item, count)`
   * (mirroring `Inventory.addItem`'s contract: returns the uninserted leftover).
   * On a full insert the drop is removed; on a partial insert its `count` is set
   * to the leftover. Returns the total count collected. Iterates a snapshot so it
   * is safe for `insert` to mutate the manager.
   */
  collectPlayerDrops(
    playerX: number,
    playerY: number,
    playerZ: number,
    insert: (item: number, count: number) => number,
    pickupRadius: number = PICKUP_RADIUS,
  ): number {
    let collected = 0;
    const radiusSq = pickupRadius * pickupRadius;
    for (const e of this.getItemEntities()) {
      if (e.ageTicks < PICKUP_DELAY_TICKS) continue;
      const dx = e.x - playerX;
      const dy = e.y - playerY;
      const dz = e.z - playerZ;
      if (dx * dx + dy * dy + dz * dz > radiusSq) continue;
      const leftover = insert(e.item, e.count);
      const taken = e.count - leftover;
      if (taken > 0) collected += taken;
      if (leftover <= 0) {
        this.removeItemEntity(e.id);
      } else {
        e.count = leftover;
      }
    }
    return collected;
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
