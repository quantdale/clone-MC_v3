# Design: 174-dimension-manager

## Context/current state
- 025's `DimensionType` derives the vertical section model (`minSectionY`, `sectionCount`,
  `maxSectionY`, `maxY`, `containsY`) and carries skylight/ultrawarm metadata; `World` accepts one
  optional dimension to shape its streamed vertical window. 047's `ScheduledTickQueue` is the
  deterministic per-area tick queue used by every simulation module.
- Nothing today can hold more than one dimension; 174 adds the container with per-dimension
  independence guarantees, without touching `World`'s rendering-heavy internals.

## Target state
- `src/world/DimensionManager.ts` holding `LoadedDimension` and the manager, operating over the
  `WorldAccess` seam (which `World` already implements).

## Invariants
- A dimension's key is exactly `resourceIdToString(type.id)`; there is no separate key argument.
- Every loaded dimension has its own `tickQueue` instance (fresh unless supplied) and its own
  `world` instance; `tickAll` drains each queue independently and in registration order.
- Duplicate registration throws `RegistryError('DUPLICATE_ID', key, …)`.
- Lookups for unknown keys return `undefined`/`false`; `removeDimension` is idempotent.

## API and data model
```ts
// src/world/DimensionManager.ts (new)
export interface LoadedDimension {
  readonly key: string;                  // resourceIdToString(type.id)
  readonly type: DimensionType;
  readonly world: WorldAccess;
  readonly tickQueue: ScheduledTickQueue;
}

export class DimensionManager {
  registerDimension(
    type: DimensionType,
    world: WorldAccess,
    tickQueue?: ScheduledTickQueue,
  ): LoadedDimension;
  hasDimension(key: string): boolean;
  getDimension(key: string): LoadedDimension | undefined;
  getWorld(key: string): WorldAccess | undefined;
  getTickQueue(key: string): ScheduledTickQueue | undefined;
  dimensions(): readonly LoadedDimension[];   // registration order
  get size(): number;
  removeDimension(key: string): boolean;       // idempotent
  tickAll(nowTick: number): ReadonlyMap<string, readonly ScheduledTick[]>;
}
```

## Control/data flow
1. A caller (production wiring or a future dimension-aware system) constructs the `DimensionType`
   and the dimension's `WorldAccess`, then `registerDimension`.
2. Per fixed tick, `tickAll(nowTick)` drains each dimension's queue; consumers of the returned map
   process due ticks per dimension.
3. Lookups route by key; removal is idempotent.

## Detailed behavior
- `registerDimension` validates nothing beyond the duplicate key (the `DimensionType` constructor
  already validates vertical extent); a supplied queue is adopted as-is (so a caller can restore a
  serialized queue), an omitted one is created fresh.
- `tickAll` iterates the internal `Map` (insertion order) and calls `tick(nowTick)` per dimension —
  each queue is independent by construction, and the returned map preserves registration order for
  deterministic processing.

## Failure modes
- Duplicate registration throws `DUPLICATE_ID` before any state changes (the map is not touched).
- All other API paths are total: unknown keys yield `undefined`/`false`; `removeDimension` on an
  unknown key is a no-op returning `false`.

## Compatibility/migration
- One new file; no existing code touched; no schema/save-format change.

## Performance/resource constraints
- All operations O(1) except `dimensions()` (O(n)) and `tickAll` (O(Σ due work per dimension));
  no hot-path or stored-data change.

## Testing seams
- The manager is tested with in-memory `WorldAccess` fakes and real `DimensionType` instances
  (overworld −64/384/skylight, nether 0/256/ultrawarm) and real 047 queues.

## Observability/debugging
- `LoadedDimension` is a plain value; `dimensions()` exposes the whole loaded set in order.

## Affected files/symbols
- `src/world/DimensionManager.ts` (new).
- Tests: `tests/unit/DimensionManager.test.ts` (new). No other files.

## Rejected alternatives
- **Making the manager own `World` instances directly**: rejected — `World` is rendering-coupled
  (THREE.Scene, meshes); the `WorldAccess` seam keeps the container headless-testable and the
  production wiring free to construct `World`s later.
- **A separate key argument**: rejected — deriving the key from `type.id` removes an entire class of
  key/metadata disagreement bugs.
- **Throwing on unknown-key lookups**: rejected — `hasDimension`-first usage is the safer pattern for
  a container of optional dimensions; `undefined` results are explicit.

## Downstream dependencies
- 175 (`nether-dimension-type`) adds the Nether's `DimensionType` (0/256, no skylight, ultrawarm) and
  can register it through this manager; 176+ (generation) and 180+ (End) follow; 178's
  portal-linking looks up dimensions by key.
