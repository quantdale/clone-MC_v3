/**
 * Dimension manager (174): the first multi-dimension architecture — a container of independently
 * loaded dimensions, each owning its own world/chunk state (`WorldAccess`) and its own scheduled-tick
 * queue (047), with its `DimensionType` (025) consulted per dimension for vertical extent and
 * lighting metadata.
 *
 * The manager is deliberately state-agnostic about the world seam: `WorldAccess` is the minimal
 * interface the real `World` already implements, so a headless fixture can supply an in-memory fake
 * and the real rendering world can be registered unchanged (a wiring concern, not this change's).
 * Registration order is the deterministic iteration order; each dimension's tick queue is drained
 * independently, so ticking one dimension never affects another.
 *
 * A dimension's key IS its type's resource id (e.g. `minecraft:overworld`), so lookups and the
 * height metadata can never disagree about which dimension they mean.
 */
import { resourceIdToString } from '../data/ResourceId';
import { RegistryError } from '../data/Registry';
import { DimensionType } from '../data/DimensionType';
import { ScheduledTickQueue, type ScheduledTick } from '../simulation/ScheduledTickQueue';
import type { WorldAccess } from './WorldAccess';

/** One loaded dimension: independent world/chunk state + independent scheduled-tick state. */
export interface LoadedDimension {
  /** The dimension key: `resourceIdToString(type.id)` (e.g. `minecraft:overworld`). */
  readonly key: string;
  /** The dimension's height/lighting model (025); consult per dimension. */
  readonly type: DimensionType;
  /** The dimension's own world/chunk access (a `World` in production, a fake in fixtures). */
  readonly world: WorldAccess;
  /** The dimension's own scheduled-tick queue (047). */
  readonly tickQueue: ScheduledTickQueue;
}

/**
 * Multi-dimension container. Deterministic registration order; independent per-dimension queues;
 * duplicate keys rejected at registration.
 */
export class DimensionManager {
  private readonly loaded = new Map<string, LoadedDimension>();

  /**
   * Register a loaded dimension. The key is derived from `type.id`, and a duplicate key is
   * rejected. When `tickQueue` is omitted, a fresh `ScheduledTickQueue` is created for the
   * dimension (the queue is always independent of every other dimension's).
   */
  registerDimension(
    type: DimensionType,
    world: WorldAccess,
    tickQueue?: ScheduledTickQueue,
  ): LoadedDimension {
    const key = resourceIdToString(type.id);
    if (this.loaded.has(key)) {
      throw new RegistryError('DUPLICATE_ID', key, 'dimension already loaded');
    }
    const loaded: LoadedDimension = {
      key,
      type,
      world,
      tickQueue: tickQueue ?? new ScheduledTickQueue(),
    };
    this.loaded.set(key, loaded);
    return loaded;
  }

  /** Whether `key` is loaded. */
  hasDimension(key: string): boolean {
    return this.loaded.has(key);
  }

  /** The loaded dimension for `key`, or `undefined` when not loaded. */
  getDimension(key: string): LoadedDimension | undefined {
    return this.loaded.get(key);
  }

  /** The loaded dimension's world access, or `undefined`. */
  getWorld(key: string): WorldAccess | undefined {
    return this.loaded.get(key)?.world;
  }

  /** The loaded dimension's scheduled-tick queue, or `undefined`. */
  getTickQueue(key: string): ScheduledTickQueue | undefined {
    return this.loaded.get(key)?.tickQueue;
  }

  /** All loaded dimensions in registration order (deterministic). */
  dimensions(): readonly LoadedDimension[] {
    return [...this.loaded.values()];
  }

  /** Number of loaded dimensions. */
  get size(): number {
    return this.loaded.size;
  }

  /**
   * Remove a loaded dimension. Returns `true` when it was present and removed, `false` when `key`
   * was not loaded (idempotent).
   */
  removeDimension(key: string): boolean {
    return this.loaded.delete(key);
  }

  /**
   * Drain every loaded dimension's scheduled-tick queue at `nowTick`, in registration order. Each
   * dimension's queue is drained independently (ticking one dimension never affects another).
   * Returns a map from dimension key to its due ticks; deterministic for a fixed state.
   */
  tickAll(nowTick: number): ReadonlyMap<string, readonly ScheduledTick[]> {
    const due = new Map<string, readonly ScheduledTick[]>();
    for (const loaded of this.loaded.values()) {
      due.set(loaded.key, loaded.tickQueue.tick(nowTick));
    }
    return due;
  }
}
