# Design: 052-block-entity-framework

## Context / current state

036 provides the persistence envelope; 050 provides behavior dispatch. No runtime instance exists.

## Target state

A `BlockEntityInstance` (position, typeKey, data, tickable, onTick) and a chunk-grouped
`BlockEntityManager` with deterministic ticking and 036-shape serialization.

## Invariants

- At most one instance per world position; `add` on an occupied position returns `false`.
- Instances are grouped by chunk `(x >> 4, z >> 4)`; `getForChunk`/`removeChunk` operate per chunk.
- `tickAll(tick)` invokes `tick` on tickable instances in insertion order and returns the count;
  non-tickable instances are skipped.
- `serializeChunk(cx, cz)` returns 036 `SerializedBlockEntity[]` (schemaVersion 1, typeKey, x/y/z,
  data); `deserializeChunk` validates and restores (one per position; duplicates in the payload are
  rejected).
- `size`/`clear` reflect the instance set.

## API and data model

```ts
// src/simulation/BlockEntityManager.ts
export interface BlockEntityInstanceOptions {
  typeKey: string;
  x: number; y: number; z: number;
  tickable?: boolean;
  data?: unknown;
  onTick?: (instance: BlockEntityInstance, tick: number) => void;
}
export class BlockEntityInstance {
  constructor(opts: BlockEntityInstanceOptions);
  readonly typeKey: string; readonly x: number; readonly y: number; readonly z: number;
  get tickable(): boolean;
  setTickable(v: boolean): void;
  get data(): unknown;
  tick(tick: number): void; // invokes onTick only when tickable
}
export class BlockEntityManager {
  add(instance: BlockEntityInstance): boolean;
  remove(x: number, y: number, z: number): boolean;
  get(x: number, y: number, z: number): BlockEntityInstance | null;
  getForChunk(cx: number, cz: number): BlockEntityInstance[];
  removeChunk(cx: number, cz: number): number;
  tickAll(tick: number): number;
  serializeChunk(cx: number, cz: number): SerializedBlockEntity[];
  deserializeChunk(cx: number, cz: number, entities: unknown[]): number;
  get size(): number;
  clear(): void;
}
```

## Control / data flow

1. World wiring (later) creates instances and `manager.add(...)` on block placement; `remove` on
   break; `removeChunk` on chunk unload.
2. Each fixed tick, `manager.tickAll(tick)` ticks tickable instances in insertion order.
3. On save, `serializeChunk` per dirty chunk feeds the 036 repository; on load,
   `deserializeChunk` restores instances.

## Detailed behavior

- Chunk key: `${x >> 4},${z >> 4}` (arithmetic shift is correct for negatives).
- `tickAll` iterates a global insertion-order list; `remove` leaves a tombstone-free compact list.
- `deserializeChunk` validates the whole payload first (via `validateSerializedBlockEntity` per
  element), then adds instances; any duplicate position in the payload aborts with a descriptive
  error and no partial mutation.

## Failure modes

- Duplicate position on `add` → `false` (no throw).
- Duplicate positions inside a `deserializeChunk` payload → `Error`, manager unchanged.
- Malformed payload element → `Error`, manager unchanged.

## Compatibility / migration

Additive; the 036 envelope is the single persistence shape, so 040 migration output loads directly.

## Performance / resource constraints

add/remove/get O(1) (maps); `tickAll` O(instances); `getForChunk` O(instances in chunk).

## Testing seams

- `tests/unit/BlockEntityManager.test.ts`:
  - instance lifecycle: tickable on/off, onTick invoked with tick number, non-tickable skipped;
  - add/get/remove, duplicate-position rejection;
  - chunk grouping: instances in different chunks isolated; `getForChunk`; `removeChunk` count;
  - `tickAll` insertion order + count;
  - `serializeChunk` → `deserializeChunk` round-trip (fresh manager) equality; malformed payload
    rejection leaves the manager unchanged;
  - size/clear.

## Observability / debugging

`size` and `getForChunk` expose runtime block-entity state.

## Affected files / symbols

- `src/simulation/BlockEntityManager.ts` — NEW.
- `tests/unit/BlockEntityManager.test.ts` — NEW.

## Rejected alternatives

- *Storing instances inside `ChunkColumn`*: couples storage to the framework; a manager keyed by
  position/chunk keeps both sides decoupled (the world wiring bridges them later).
- *Behavior class per block entity*: the instance carries an optional `onTick` hook; concrete
  behaviors arrive with their blocks (107/109+).

## Downstream dependencies

107 (chests), 109 (furnaces), and 166+ (hoppers) create instances through this manager; the world
wiring (later change) attaches it to chunks and feeds 036 persistence.
