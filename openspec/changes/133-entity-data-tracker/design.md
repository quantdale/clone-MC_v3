# Design: 133-entity-data-tracker

## Context/current state
- Real Minecraft's `SynchedEntityData` associates each entity class with a fixed set of statically
  defined `EntityDataAccessor<T>` keys (dense per-class ids), then each live entity instance holds a
  `DataItem<T>` (value + dirty flag) per key; a network tick sends only dirty items, and a full
  snapshot (all items) is sent on spawn.
- Nothing in this codebase has this today. 129's `EntityInstance` is a plain, fixed-shape interface
  with no extensible keyed-property slot.

## Target state
- `src/data/EntityDataTracker.ts` provides the two-class primitive (`DataAccessorRegistry` +
  `EntityDataTracker`) matching that shape, fully generic and standalone.

## Invariants
- `DataAccessorRegistry.define<T>(name)` assigns a strictly increasing, unique, dense integer `id`
  per call and never reuses one; `define` with an already-used `name` throws (no partial mutation).
- `EntityDataTracker.define(accessor, initialValue)` may be called at most once per accessor `id` on
  one tracker instance; a second `define` with the same `id` throws.
- `EntityDataTracker.set(accessor, value)` marks the entry dirty if and only if
  `!Object.is(currentValue, value)`; it always overwrites the stored value (even when not dirty, the
  new value replaces the old one — `Object.is` equal values are indistinguishable anyway).
- `getDirty()` returns exactly the entries whose dirty flag is currently set, in accessor-id order;
  `getAll()` returns every defined entry regardless of dirty state, in accessor-id order.
- `clearDirty()` clears every dirty flag without changing any stored value; a subsequent `getDirty()`
  is empty until another `set` actually changes a value.
- `get`/`set`/`isDirty` throw for an accessor never `define`d on that tracker (mirrors 129's registry
  spawn-time-only extension: instances are "shaped" once at construction, not append-only forever like
  a plain map).

## API and data model
```ts
export interface DataAccessor<T> {
  readonly id: number;
  readonly name: string;
}

export class DataAccessorRegistry {
  define<T>(name: string): DataAccessor<T>;   // throws on duplicate name
  has(name: string): boolean;
  get size(): number;
}

export interface DataTrackerEntry<T = unknown> {
  accessor: DataAccessor<T>;
  value: T;
}

export class EntityDataTracker {
  define<T>(accessor: DataAccessor<T>, initialValue: T): void;  // throws on duplicate accessor id
  has(accessor: DataAccessor<unknown>): boolean;
  get<T>(accessor: DataAccessor<T>): T;                          // throws if undefined
  set<T>(accessor: DataAccessor<T>, value: T): boolean;          // returns whether it changed; throws if undefined
  isDirty(accessor: DataAccessor<unknown>): boolean;              // throws if undefined
  getDirty(): DataTrackerEntry[];
  getAll(): DataTrackerEntry[];
  clearDirty(): void;
}
```

## Control/data flow
1. A schema owner builds one `DataAccessorRegistry` (e.g. per entity kind) and calls `define` once
   per property it wants synchronized, keeping the returned `DataAccessor<T>` objects as constants.
2. Each live instance constructs its own `EntityDataTracker` and calls `define(accessor, initial)` for
   every accessor from that schema, seeding starting values.
3. Per frame/tick, a consumer calls `set(accessor, newValue)` whenever a tracked property changes;
   `set` compares via `Object.is` and flips the dirty flag only on an actual change.
4. A sync step calls `getDirty()` (incremental) or `getAll()` (full/initial), does whatever it needs
   with the returned `{ accessor, value }` pairs, then calls `clearDirty()` once the sync is
   flushed.

## Detailed behavior
- `set` always writes the new value into storage regardless of whether it differs (no read-then-skip
  optimization needed since the write is O(1) and the returned boolean already tells the caller
  whether anything changed).
- `getDirty()`/`getAll()` return fresh arrays (not a live view) so a caller can freely `clearDirty()`
  afterward without invalidating an in-flight iteration.
- Order is accessor-`id` ascending (definition order on that tracker, since ids are assigned by
  `DataAccessorRegistry` in `define` call order and a tracker only ever grows its stored map via
  `define`).

## Failure modes
- `DataAccessorRegistry.define` with a duplicate `name`: throws, no id consumed.
- `EntityDataTracker.define` with a duplicate accessor `id` (already defined on this tracker): throws,
  existing entry unchanged.
- `EntityDataTracker.get`/`set`/`isDirty` on an accessor never `define`d on this tracker: throws.

## Compatibility/migration
- One new, dependency-free file; no edits to any existing module. No schema/save-format change; no
  migration.

## Performance/resource constraints
- `define`/`get`/`set`/`isDirty`/`has` are O(1) (`Map` operations). `getDirty()`/`getAll()` are O(n)
  in the number of defined accessors on that tracker. No unbounded growth: a tracker's accessor set
  is exactly what was `define`d, never appended elsewhere.

## Testing seams
- Both classes are pure, dependency-free, and directly constructible in a test — no `Game`/`World`/
  `EntityManager` needed.

## Observability/debugging
- `DataAccessor.name` is retained purely for debugging/error messages (not used for lookup, which is
  always by dense `id`), so a thrown error can name the offending property.

## Affected files/symbols
- `src/data/EntityDataTracker.ts` (new).
- Tests: `tests/unit/EntityDataTracker.test.ts` (new).

## Rejected alternatives
- **Building this on the 003 generic `Registry<T>` (ResourceId-keyed)**: rejected — that registry's
  key type (`ResourceId`) and single-type-per-registry-instance shape don't fit a per-accessor
  `T`-typed value store; a dedicated dense-integer-id registry is simpler and more direct here.
- **Deep-equality dirty detection**: rejected (see proposal Non-goals) — `Object.is` matches this
  codebase's existing "pass a new value/object on change" idiom (e.g. 129's defensive-copy-on-write
  setters) and avoids an expensive/ambiguous deep-compare for arbitrary `T`.
- **Attaching an `EntityDataTracker` directly onto `EntityInstance` in this change**: rejected — no
  rendering/networking consumer exists yet to define what should be tracked; wiring now would be
  speculative. 133 delivers the reusable primitive only.

## Downstream dependencies
- A future entity-rendering change would build a `DataAccessorRegistry` schema per mob kind and give
  each spawned `EntityInstance` (or a parallel per-id map) an `EntityDataTracker`, syncing
  `getDirty()` into render state each frame.
- A future networking change (if ever undertaken) would serialize `getDirty()`/`getAll()` into a wire
  format — out of scope here.
