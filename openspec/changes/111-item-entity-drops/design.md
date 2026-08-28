# Design: 111-item-entity-drops

## Context / current state

`PlayerInteraction.finishBreak` (src/player/PlayerInteraction.ts:226) currently
routes every mined block's drops straight into the player's inventory:

```ts
for (const stack of evaluate(table, ctx, rng, this.itemRegistry)) {
  this.selector.addItem?.(stack.item, stack.count);
}
```

There is no in-world item representation. The 052 `BlockEntityManager`
(src/simulation/BlockEntityManager.ts) is the established pattern for a
positioned, id-minting, chunk-groupable, serializable runtime store; item
entities follow the same shape but are free-floating (not bound to a block
position) and carry an item stack plus motion/age state.

The 037 `SerializedEntity` envelope (src/storage/EntityRecord.ts) already exists
for a future entity framework: `{ schemaVersion, typeKey, x, y, z, data }`. Item
entities reuse it with `typeKey: 'minecraft:item'`; the runtime float position and
motion live inside `data` while the envelope `x/y/z` hold `Math.floor` values for
chunk grouping.

## Target state

- A `ItemEntity` is `{ id, item, count, x, y, z, vx, vy, vz, ageTicks }`.
- `ItemEntityManager` owns all live item entities for the world, mints strictly
  increasing integer ids, validates every spawn, and serializes to 037.
- Mining a block spawns item entities at the block center (with a small
  deterministic jitter so stacked drops do not perfectly overlap). The player no
  longer receives mined items automatically (collection is 112).

## Invariants

- `id` is a unique non-negative integer assigned by the manager; never reused
  while the manager is alive.
- `count` is a positive integer `1 <= count <= item.stackSize`. Oversized drops
  are split into multiple entities before spawn (MC parity).
- `item` is a registered `ItemId` (validated via `ItemTypeRegistry.has`).
- `x/y/z`, `vx/vy/vz` are finite numbers. `ageTicks >= 0` integer.
- `serializeAll` is lossless: `deserializeAll(serializeAll())` reproduces every
  entity including fractional coordinates and velocity.
- Deserialize is atomic: a single invalid/foreign entity rejects the whole batch
  and leaves the manager unchanged.

## API and data model

```ts
// src/world/ItemEntity.ts
export const ITEM_ENTITY_TYPE_KEY = 'minecraft:item';

export interface ItemEntity {
  readonly id: number;
  readonly item: number;
  readonly count: number;
  x: number; y: number; z: number;          // world coordinates (float)
  vx: number; vy: number; vz: number;       // stored for 130; unused in 111
  ageTicks: number;                          // advanced by tickItemEntities
}

export interface SpawnPosition { x: number; y: number; z: number; }

/** Block center, raised 0.5 so the entity sits at the block's mid-height. */
export function createSpawnPosition(blockX: number, blockY: number, blockZ: number): SpawnPosition;

/** Strict constructor: throws on non-finite coordinates, negative age, count<1. */
export function createItemEntity(opts: {
  id: number; item: number; count: number;
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number; ageTicks?: number;
}): ItemEntity;
```

```ts
// src/simulation/ItemEntityManager.ts
export interface ItemStackLike { item: number; count: number; }

export class ItemEntityManager {
  constructor(opts: { itemRegistry: ItemTypeRegistry; rng?: RandomSource });
  spawnItemEntity(stack: ItemStackLike, x: number, y: number, z: number,
                  opts?: { vx?: number; vy?: number; vz?: number; id?: number }): ItemEntity;
  spawnLootStacks(stacks: ItemStackLike[], x: number, y: number, z: number, rng?: RandomSource): ItemEntity[];
  removeItemEntity(id: number): boolean;
  getItemEntity(id: number): ItemEntity | null;
  getItemEntities(): ItemEntity[];                 // insertion order
  getItemEntitiesInChunk(cx: number, cz: number): ItemEntity[];
  tickItemEntities(dt: number): number;            // age += round(dt*20)
  clear(): void;
  get size(): number;
  serializeAll(): SerializedEntity[];              // 037 envelope
  deserializeAll(entities: unknown[]): number;    // all-or-nothing
}
```

`RandomSource` is the same `(min, max) => number` contract used by loot tables
(src/inventory/LootTable.ts). When no rng is supplied, spawn jitter is zero and
position is exact (deterministic, testable).

## Control / data flow

1. `PlayerInteraction.finishBreak` sets the block to air, then resolves drops into
   `LootStack[]` (loot table when present, else `dropItem`/`resourceId`, plus the
   leaves→apple special case).
2. It computes `createSpawnPosition(blockX, blockY, blockZ)` and calls
   `itemEntities.spawnLootStacks(stacks, pos.x, pos.y, pos.z, this.rng)`.
3. `spawnLootStacks` splits each stack into `ceil(count/stackSize)` entities, each
   placed at the spawn point with a deterministic horizontal jitter derived from
   `rng` (and a tiny upward `vy` stored for 130).
4. Each `Game` simulation tick calls `itemEntities.tickItemEntities(dt)`; for 111
   this only advances `ageTicks`.

## Detailed behavior

- **Id minting**: `spawnItemEntity` uses `this.nextId++` unless an explicit `id`
  is given (deserialize passes stored ids and resets `nextId` above the max).
- **Validation**: unknown item, `count<1`, non-integer count, `count>stackSize`
  (when not splitting), or non-finite coordinates/velocity all throw
  `ItemEntityManager: ...`. `spawnLootStacks` never violates these because it
  pre-splits to `stackSize`.
- **Determinism**: with a fixed `rng` the same break yields the same positions and
  entity count; with `Math.random` (production) it is varied but still valid.
- **Chunk query**: `getItemEntitiesInChunk` groups by `Math.floor(x/16)`,
  `Math.floor(z/16)`; used by 131 persistence and 112 pickup proximity.

## Failure modes

- Invalid stack → throw, manager unchanged, no partial spawn.
- `deserializeAll` on foreign/old `typeKey` or malformed `data` → throw, manager
  unchanged (atomic).
- `spawnLootStacks` with empty array → no-op, returns `[]`.

## Compatibility / migration

Reuses 037 envelope; no registry/codec changes. No migration needed now; 131
will read `serializeAll()` grouped per chunk.

## Performance / resource constraints

- O(entities) per tick for age advancement (cheap integer add); no allocations.
- Splitting bounds entities to `ceil(count/stackSize)` per stack; trivial.
- No per-frame allocations in the spawn path beyond the entity objects themselves.

## Testing seams

- `createDefaultItemRegistry()` provides real `stackSize` for validation tests.
- `spawnLootStacks` accepts an injected `rng` for deterministic position tests.
- `serializeAll`/`deserializeAll` are pure and round-trip tested.

## Affected files / symbols

- NEW `src/world/ItemEntity.ts`
- NEW `src/simulation/ItemEntityManager.ts`
- EDIT `src/player/PlayerInteraction.ts` (`finishBreak`, constructor opts)
- EDIT `src/engine/Game.ts` (construct + tick + expose manager)
- NEW `tests/unit/ItemEntityManager.test.ts`
- EDIT `tests/e2e/game.spec.ts` (assert a world item entity spawns on break)

## Rejected alternatives

- *Direct inventory add with a parallel entity copy*: double-counts items; violates
  parity and complicates pickup. Rejected.
- *Full physics now*: movement/collision is 130; doing it here breaks scope and
  the advancement gate. Velocity is stored for reuse instead.
- *Per-chunk entity manager*: item entities are world-scoped and can cross chunk
  boundaries while falling (130); a single world manager with chunk queries is the
  correct granularity.

## Downstream dependencies

- 112 pickup/despawn consumes `getItemEntitiesInChunk` + `removeItemEntity`.
- 130 entity physics consumes `vx/vy/vz` and moves `x/y/z`.
- 131 autosave consumes `serializeAll`/`deserializeAll`.
- 148 mob death reuses `spawnLootStacks`.
