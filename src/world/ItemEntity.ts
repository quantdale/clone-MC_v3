/**
 * World item entity model (111).
 *
 * An `ItemEntity` is a free-floating world object holding one item stack, a float
 * position, stored motion (consumed by 130 entity physics), and an age in ticks.
 * Item entities are spawned when blocks (and later, mobs) drop items, so mined
 * loot exists in the world instead of teleporting into the inventory.
 *
 * Validation here is structural (finite numbers, non-negative age, positive
 * integer count). Item-id validity against the registry is enforced by
 * `ItemEntityManager` at spawn time.
 */

/** Registry type key for item entities, matching the 037 `SerializedEntity` contract. */
export const ITEM_ENTITY_TYPE_KEY = 'minecraft:item';

/** A live world item entity. */
export interface ItemEntity {
  /** Unique non-negative integer minted by the manager. */
  readonly id: number;
  /** Registered item id (numeric legacy id). */
  readonly item: number;
  /** Positive integer quantity, `1 <= count <= stackSize(item)`. */
  readonly count: number;
  /** World X (float). */
  x: number;
  /** World Y (float). */
  y: number;
  /** World Z (float). */
  z: number;
  /** Stored horizontal/vertical motion; integrated by 130, unused in 111. */
  vx: number;
  /** Stored vertical motion. */
  vy: number;
  /** Stored horizontal motion. */
  vz: number;
  /** Age in simulation ticks; advanced by `tickItemEntities`. */
  ageTicks: number;
}

/** A block-center spawn coordinate. */
export interface SpawnPosition {
  x: number;
  y: number;
  z: number;
}

/** Constructor arguments for {@link createItemEntity}. */
export interface CreateItemEntityOptions {
  id: number;
  item: number;
  count: number;
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  ageTicks?: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Compute the spawn position for a dropped item: the broken block's center, raised
 * 0.5 on Y so the entity sits at the block's mid-height rather than its floor.
 */
export function createSpawnPosition(blockX: number, blockY: number, blockZ: number): SpawnPosition {
  return { x: blockX + 0.5, y: blockY + 0.5, z: blockZ + 0.5 };
}

/**
 * Strict `ItemEntity` constructor. Validates finite coordinates/velocity, a
 * non-negative integer `ageTicks`, and a positive integer `count`. Throws a
 * descriptive `Error` on any invalid field. Item-id validity is NOT checked here
 * (the manager validates it against the registry).
 */
export function createItemEntity(opts: CreateItemEntityOptions): ItemEntity {
  if (!Number.isInteger(opts.id) || opts.id < 0) {
    throw new Error(`ItemEntity: id must be a non-negative integer (got ${String(opts.id)})`);
  }
  if (!Number.isInteger(opts.item) || opts.item < 0) {
    throw new Error(`ItemEntity: item must be a non-negative integer (got ${String(opts.item)})`);
  }
  if (!Number.isInteger(opts.count) || opts.count < 1) {
    throw new Error(`ItemEntity: count must be a positive integer (got ${String(opts.count)})`);
  }
  if (!isFiniteNumber(opts.x) || !isFiniteNumber(opts.y) || !isFiniteNumber(opts.z)) {
    throw new Error('ItemEntity: x/y/z must be finite numbers');
  }
  const vx = opts.vx ?? 0;
  const vy = opts.vy ?? 0;
  const vz = opts.vz ?? 0;
  if (!isFiniteNumber(vx) || !isFiniteNumber(vy) || !isFiniteNumber(vz)) {
    throw new Error('ItemEntity: vx/vy/vz must be finite numbers');
  }
  const ageTicks = opts.ageTicks ?? 0;
  if (!Number.isInteger(ageTicks) || ageTicks < 0) {
    throw new Error(`ItemEntity: ageTicks must be a non-negative integer (got ${String(ageTicks)})`);
  }
  return {
    id: opts.id,
    item: opts.item,
    count: opts.count,
    x: opts.x,
    y: opts.y,
    z: opts.z,
    vx,
    vy,
    vz,
    ageTicks,
  };
}
