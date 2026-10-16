/**
 * Block-entity runtime framework (052). A `BlockEntityInstance` is a positioned, typed, opaque-data
 * object with a tickable flag and an optional `onTick` hook. A `BlockEntityManager` keeps at most one
 * instance per world position, groups instances per chunk `(x >> 4, z >> 4)`, ticks tickable
 * instances deterministically (insertion order), and serializes/deserializes through the 036
 * `SerializedBlockEntity` envelope so the persistence layer (036) and the runtime speak the same
 * shape.
 */
import { SECTION_SIZE } from '../math/SectionCoordinate';
import type { SerializedBlockEntity } from '../storage/BlockEntityRecord';
import { validateSerializedBlockEntity } from '../storage/BlockEntityRecord';

export interface BlockEntityInstanceOptions {
  typeKey: string;
  x: number;
  y: number;
  z: number;
  /** Whether this instance receives `tick` calls (default false). */
  tickable?: boolean;
  /** Opaque per-instance payload (owned by the concrete block entity). */
  data?: unknown;
  /** Called by `tick` when tickable; receives the instance and the game tick. */
  onTick?: (instance: BlockEntityInstance, tick: number) => void;
}

/** One positioned, typed block-entity instance. */
export class BlockEntityInstance {
  readonly typeKey: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  private isTickable: boolean;
  private readonly payload: unknown;
  private readonly onTick?: (instance: BlockEntityInstance, tick: number) => void;

  constructor(opts: BlockEntityInstanceOptions) {
    this.typeKey = opts.typeKey;
    this.x = opts.x;
    this.y = opts.y;
    this.z = opts.z;
    this.isTickable = opts.tickable ?? false;
    this.payload = opts.data;
    this.onTick = opts.onTick;
  }

  get tickable(): boolean {
    return this.isTickable;
  }

  setTickable(value: boolean): void {
    this.isTickable = value;
  }

  get data(): unknown {
    return this.payload;
  }

  /** Advance one game tick; invokes `onTick` only when tickable. */
  tick(tick: number): void {
    if (this.isTickable) {
      this.onTick?.(this, tick);
    }
  }
}

function positionKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function chunkOf(x: number, z: number): string {
  return chunkKey(Math.floor(x / SECTION_SIZE), Math.floor(z / SECTION_SIZE));
}

/** Chunk-grouped block-entity instance store with deterministic ticking. */
export class BlockEntityManager {
  private readonly byPosition = new Map<string, BlockEntityInstance>();
  private readonly byChunk = new Map<string, Set<string>>();
  private readonly order: string[] = [];

  /** Add an instance; returns `false` when the position is already occupied. */
  add(instance: BlockEntityInstance): boolean {
    const key = positionKey(instance.x, instance.y, instance.z);
    if (this.byPosition.has(key)) return false;
    this.byPosition.set(key, instance);
    this.order.push(key);

    const chunk = chunkOf(instance.x, instance.z);
    let members = this.byChunk.get(chunk);
    if (!members) {
      members = new Set();
      this.byChunk.set(chunk, members);
    }
    members.add(key);
    return true;
  }

  /** Remove the instance at `(x, y, z)`; returns whether one existed. */
  remove(x: number, y: number, z: number): boolean {
    const key = positionKey(x, y, z);
    const instance = this.byPosition.get(key);
    if (!instance) return false;
    this.byPosition.delete(key);
    this.byChunk.get(chunkOf(x, z))?.delete(key);
    const orderIndex = this.order.indexOf(key);
    if (orderIndex >= 0) this.order.splice(orderIndex, 1);
    return true;
  }

  /**
   * Swap the instance at `(x, y, z)` for `next` (251): instances are immutable,
   * so a ticked furnace publishes its new state through an order-preserving
   * replace instead of mutation. Returns false when no instance occupies the
   * position or the position/type/coords disagree with `next`; the manager is
   * unchanged in that case.
   */
  replace(next: BlockEntityInstance): boolean {
    const key = positionKey(next.x, next.y, next.z);
    const current = this.byPosition.get(key);
    if (!current || current.typeKey !== next.typeKey) return false;
    if (chunkOf(next.x, next.z) !== chunkOf(current.x, current.z)) return false;
    this.byPosition.set(key, next);
    return true;
  }

  /** The instance at `(x, y, z)`, or `null`. */
  get(x: number, y: number, z: number): BlockEntityInstance | null {
    return this.byPosition.get(positionKey(x, y, z)) ?? null;
  }

  /** Instances in chunk `(cx, cz)` in insertion order. */
  getForChunk(cx: number, cz: number): BlockEntityInstance[] {
    const members = this.byChunk.get(chunkKey(cx, cz));
    if (!members) return [];
    const out: BlockEntityInstance[] = [];
    for (const key of this.order) {
      if (members.has(key)) {
        const instance = this.byPosition.get(key);
        if (instance) out.push(instance);
      }
    }
    return out;
  }

  /** All live instances in insertion order (251 consumers). */
  all(): BlockEntityInstance[] {
    const out: BlockEntityInstance[] = [];
    for (const key of this.order) {
      const instance = this.byPosition.get(key);
      if (instance) out.push(instance);
    }
    return out;
  }

  /** Remove every instance in chunk `(cx, cz)`; returns the removed count. */
  removeChunk(cx: number, cz: number): number {
    const members = this.byChunk.get(chunkKey(cx, cz));
    if (!members) return 0;
    let removed = 0;
    for (const key of members) {
      this.byPosition.delete(key);
      const orderIndex = this.order.indexOf(key);
      if (orderIndex >= 0) this.order.splice(orderIndex, 1);
      removed++;
    }
    this.byChunk.delete(chunkKey(cx, cz));
    return removed;
  }

  /** Tick all tickable instances in insertion order; returns the ticked count. */
  tickAll(tick: number): number {
    let ticked = 0;
    for (const key of this.order) {
      const instance = this.byPosition.get(key);
      if (instance && instance.tickable) {
        instance.tick(tick);
        ticked++;
      }
    }
    return ticked;
  }

  /** Serialize the chunk's instances into the 036 envelope. */
  serializeChunk(cx: number, cz: number): SerializedBlockEntity[] {
    return this.getForChunk(cx, cz).map((instance) => ({
      schemaVersion: 1,
      typeKey: instance.typeKey,
      x: instance.x,
      y: instance.y,
      z: instance.z,
      // The 036 envelope requires `data` to be present; normalize undefined to null.
      data: instance.data ?? null,
    }));
  }

  /**
   * Restore a chunk's instances from 036 payloads. The whole payload is validated first (including
   * duplicate positions and chunk membership); on rejection the manager is unchanged. Returns the
   * number added.
   */
  deserializeChunk(cx: number, cz: number, entities: unknown[]): number {
    const valid = entities.map((e) => validateSerializedBlockEntity(e));

    const seen = new Set<string>();
    for (const entity of valid) {
      if (chunkOf(entity.x, entity.z) !== chunkKey(cx, cz)) {
        throw new Error(`BlockEntityManager: entity at ${entity.x},${entity.z} is outside chunk ${cx},${cz}`);
      }
      const key = positionKey(entity.x, entity.y, entity.z);
      if (seen.has(key) || this.byPosition.has(key)) {
        throw new Error(`BlockEntityManager: duplicate block-entity position ${entity.x},${entity.y},${entity.z}`);
      }
      seen.add(key);
    }

    for (const entity of valid) {
      this.add(new BlockEntityInstance({ typeKey: entity.typeKey, x: entity.x, y: entity.y, z: entity.z, data: entity.data }));
    }
    return valid.length;
  }

  /** Number of live instances. */
  get size(): number {
    return this.byPosition.size;
  }

  /** Remove all instances. */
  clear(): void {
    this.byPosition.clear();
    this.byChunk.clear();
    this.order.length = 0;
  }
}
