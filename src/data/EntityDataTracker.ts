/**
 * Dirty synchronized property container (133), mirroring real Minecraft's
 * `SynchedEntityData`. `DataAccessorRegistry` assigns dense, unique, typed
 * `DataAccessor<T>` keys; `EntityDataTracker` stores per-instance values
 * against those keys and tracks which have changed (via `Object.is`) since
 * construction or the last `clearDirty()`, exposing an incremental
 * (`getDirty`) and full (`getAll`) read for a future sync consumer.
 *
 * Fully generic and standalone: no wire/serialization format, and no wiring
 * into `EntityInstance`/`EntityManager`/`Game`/rendering — a future
 * rendering or networking consumer builds a schema on top of this.
 */

/** An immutable, typed property key. `T` is compile-time only; lookup is always by dense `id`. */
export interface DataAccessor<T> {
  readonly id: number;
  readonly name: string;
  /** Phantom marker carrying `T` for type-safe `get`/`set` call sites; never assigned or read. */
  readonly __phantom?: T;
}

/** One tracker entry: the accessor it belongs to and its current value. */
export interface DataTrackerEntry<T = unknown> {
  accessor: DataAccessor<T>;
  value: T;
}

/** Assigns dense, unique integer ids to named typed accessors. Rejects duplicate names. */
export class DataAccessorRegistry {
  private readonly byName = new Map<string, DataAccessor<unknown>>();
  private nextId = 0;

  /** Define a new accessor named `name`. Throws when `name` is already defined; consumes no id. */
  define<T>(name: string): DataAccessor<T> {
    if (this.byName.has(name)) {
      throw new Error(`DataAccessorRegistry: duplicate accessor name '${name}'`);
    }
    const accessor: DataAccessor<T> = { id: this.nextId++, name };
    this.byName.set(name, accessor);
    return accessor;
  }

  /** Whether an accessor named `name` has been defined. */
  has(name: string): boolean {
    return this.byName.has(name);
  }

  /** Number of defined accessors. */
  get size(): number {
    return this.byName.size;
  }
}

/**
 * Per-instance store of accessor-keyed values with dirty tracking. Construct
 * one per live instance; `define` each accessor from its schema once, then
 * `get`/`set` as the instance's state changes.
 */
export class EntityDataTracker {
  private readonly values = new Map<number, unknown>();
  private readonly accessors = new Map<number, DataAccessor<unknown>>();
  private readonly dirty = new Set<number>();

  /**
   * Seed `accessor` with `initialValue`, not dirty. Throws when `accessor.id`
   * is already defined on this tracker; the existing entry is unchanged.
   */
  define<T>(accessor: DataAccessor<T>, initialValue: T): void {
    if (this.accessors.has(accessor.id)) {
      throw new Error(`EntityDataTracker: accessor '${accessor.name}' (id ${accessor.id}) already defined`);
    }
    this.accessors.set(accessor.id, accessor);
    this.values.set(accessor.id, initialValue);
  }

  /** Whether `accessor` has been `define`d on this tracker. */
  has(accessor: DataAccessor<unknown>): boolean {
    return this.accessors.has(accessor.id);
  }

  /** The current value of `accessor`. Throws when undefined. */
  get<T>(accessor: DataAccessor<T>): T {
    this.requireDefined(accessor);
    return this.values.get(accessor.id) as T;
  }

  /**
   * Set `accessor`'s value. Always stores `value`; marks the entry dirty when
   * `!Object.is(previousValue, value)`, returning whether it changed. Throws
   * when `accessor` is undefined on this tracker.
   */
  set<T>(accessor: DataAccessor<T>, value: T): boolean {
    this.requireDefined(accessor);
    const previous = this.values.get(accessor.id);
    const changed = !Object.is(previous, value);
    this.values.set(accessor.id, value);
    if (changed) {
      this.dirty.add(accessor.id);
    }
    return changed;
  }

  /** Whether `accessor`'s value has changed since construction or the last `clearDirty()`. */
  isDirty(accessor: DataAccessor<unknown>): boolean {
    this.requireDefined(accessor);
    return this.dirty.has(accessor.id);
  }

  /** Entries whose value has changed since the last `clearDirty()`, in accessor-id order. */
  getDirty(): DataTrackerEntry[] {
    const out: DataTrackerEntry[] = [];
    for (const id of [...this.dirty].sort((a, b) => a - b)) {
      out.push({ accessor: this.accessors.get(id)!, value: this.values.get(id) });
    }
    return out;
  }

  /** Every defined entry regardless of dirty state, in accessor-id order. */
  getAll(): DataTrackerEntry[] {
    const out: DataTrackerEntry[] = [];
    for (const id of [...this.accessors.keys()].sort((a, b) => a - b)) {
      out.push({ accessor: this.accessors.get(id)!, value: this.values.get(id) });
    }
    return out;
  }

  /** Clear every dirty flag without changing any stored value. */
  clearDirty(): void {
    this.dirty.clear();
  }

  private requireDefined(accessor: DataAccessor<unknown>): void {
    if (!this.accessors.has(accessor.id)) {
      throw new Error(`EntityDataTracker: accessor '${accessor.name}' (id ${accessor.id}) is not defined`);
    }
  }
}
