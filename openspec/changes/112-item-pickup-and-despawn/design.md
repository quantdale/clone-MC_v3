# Design: 112-item-pickup-and-despawn

## Context / current state

111 introduced `ItemEntity` (`src/world/ItemEntity.ts`) and `ItemEntityManager`
(`src/simulation/ItemEntityManager.ts`). A mined block now spawns world item
entities via `spawnLootStacks`, and `Game.update` calls
`itemEntities.tickItemEntities(dt)` each simulation tick (only advancing
`ageTicks`). The entities are inert: they cannot be collected, merged, or
despawned, so the player loses every mined item.

`Inventory.addItem(id, amount): number` (`src/inventory/Inventory.ts:194`)
already inserts into compatible stacks then empty hotbar/storage slots,
returning the uninserted `remaining`. The player position is
`this.player.position` (a `THREE.Vector3`) in `Game`.

## Target state

The manager owns four time-driven behaviors, all deterministic and tick-driven:

1. **Age** (already in 111): `tickItemEntities(dt)` advances `ageTicks` by
   `round(dt*20)`.
2. **Merge**: overlapping same-item entities combine up to `stackSize`.
3. **Despawn**: entities older than `DESPAWN_AGE_TICKS` are removed.
4. **Pickup**: once an entity is past `PICKUP_DELAY_TICKS` and within
   `PICKUP_RADIUS` of the player, its stack is inserted into the inventory; the
   entity is removed (full insert) or its `count` reduced (partial insert).

`Game.update` runs merge → despawn → pickup, in that order, every simulation
tick after age ticking.

## Invariants

- `count` stays `1 <= count <= stackSize(item)` at all times (merge caps at
  `stackSize`; partial pickup never produces a negative or over-cap count).
- `id` uniqueness is preserved (merge removes exactly one of a pair; pickup
  removes the whole entity or leaves `count` unchanged in total quantity).
- Pickup is **delayed**: an entity with `ageTicks < PICKUP_DELAY_TICKS` is never
  collected, regardless of proximity.
- Merge is **idempotent** on a static world: after one pass, no two same-item
  entities remain within `MERGE_RADIUS`.
- Despawn is monotonic: an entity removed by `despawnExpired` is gone and will
  not be re-collected.
- `insert` is the single side-effecting call into the inventory; the manager
  never reaches into inventory internals directly.

## API and data model

```ts
// src/world/ItemEntity.ts
export interface ItemEntity {
  readonly id: number;
  readonly item: number;
  count: number;            // NOW MUTABLE (was readonly) — manager-owned quantity
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  ageTicks: number;
}
```

```ts
// src/simulation/ItemEntityManager.ts
export const PICKUP_DELAY_TICKS = 10;     // 0.5s at 20 TPS
export const DESPAWN_AGE_TICKS = 6000;     // 5 min at 20 TPS
export const MERGE_RADIUS = 0.25;          // center distance for merge
export const PICKUP_RADIUS = 1.5;          // player center → entity distance

/** Fold overlapping (same item, within radius) entities into one up to stackSize.
 *  Returns the number of entities removed by merging. */
mergeEntities(radius = MERGE_RADIUS): number;

/** Remove entities with ageTicks >= maxAgeTicks. Returns the number removed. */
despawnExpired(maxAgeTicks = DESPAWN_AGE_TICKS): number;

/** For each collectible entity (past delay + within pickupRadius of the player
 *  point), call `insert(item, count)`; remove on full insert, reduce count on
 *  partial. Returns the total count collected. */
collectPlayerDrops(
  playerX: number, playerY: number, playerZ: number,
  insert: (item: number, count: number) => number,
  pickupRadius = PICKUP_RADIUS,
): number;
```

`insert` mirrors `Inventory.addItem`'s contract: `(item, count) => leftover`.

## Control / data flow

Each `Game.update` simulation tick (after `tickItemEntities(dt)`):

```ts
this.itemEntities.mergeEntities();
this.itemEntities.despawnExpired();
const collected = this.itemEntities.collectPlayerDrops(
  this.player.position.x, this.player.position.y, this.player.position.z,
  (id, count) => this.inventory.addItem(id, count),
);
if (collected > 0) {
  this.hotbar.render();
}
```

## Detailed behavior

- **Merge**: iterate insertion order; for each entity `a`, find the first later
  entity `b` with the same `item` and center distance `<= radius`. If
  `a.count + b.count <= stackSize(a.item)`, set `a.count += b.count` and remove
  `b`. Otherwise leave both (a full stack cannot absorb another). Scanning is
  O(n²) over live entities; entity counts are small in practice. Because entities
  are static (no physics in 112), each entity is matched at most once per pass.
- **Despawn**: drop any entity whose `ageTicks >= maxAgeTicks`. The manager never
  auto-despawns otherwise.
- **Pickup**: for each entity in insertion order, skip if `ageTicks <
  PICKUP_DELAY_TICKS`. Compute squared distance from `(playerX,playerY,playerZ)`
  to `(e.x,e.y,e.z)`; skip if `> pickupRadius²`. Otherwise call
  `insert(e.item, e.count)`, set `taken = e.count - leftover`, add `taken` to the
  running total, and either `removeItemEntity(e.id)` (leftover ≤ 0) or assign
  `e.count = leftover` (partial). Iteration uses a snapshot array so mutation
  during the loop is safe.

## Failure modes

- `insert` returning its full input (inventory full) leaves the entity untouched
  (count unchanged) — no item is lost.
- A partially full inventory leaves the entity with the correct leftover count.
- `mergeEntities` / `despawnExpired` with no eligible entities are no-ops
  returning `0`.
- Distance and age checks use inclusive `>=` so the boundary tick is the first
  collectible / despawn tick.

## Compatibility / migration

`ItemEntity.count` becomes mutable but its value domain is unchanged
(`1..stackSize`). The 037 envelope and `serializeAll`/`deserializeAll` are
untouched; `ageTicks` and `count` already round-trip. 131 can persist the
post-112 state with no migration.

## Performance / resource constraints

- Merge is O(n²) over live entities; n is bounded by active drops (typically
  tens, not thousands in 112's single-world scope).
- Despawn and pickup are O(n) with no allocation beyond the per-call snapshot.
- All three run once per simulation tick; cost is linear in live entities.

## Testing seams

- `mergeEntities(radius)` is deterministic given entity positions; tests place
  two entities at controlled distances.
- `despawnExpired(maxAgeTicks)` is parameterized so tests can use a tiny cap.
- `collectPlayerDrops` takes an injected `insert` and explicit player point, so
  unit tests verify full/partial pickup, delay, and radius without a live
  `Inventory` or `Game`.
- `createDefaultItemRegistry()` provides real `stackSize` for merge caps.

## Affected files / symbols

- EDIT `src/world/ItemEntity.ts` (`count` mutability + doc).
- EDIT `src/simulation/ItemEntityManager.ts` (constants + 3 methods).
- EDIT `src/engine/Game.ts` (call merge/despawn/collect in the sim step).
- NEW `tests/unit/ItemPickup.test.ts`.
- EDIT `tests/e2e/game.spec.ts` (add break→collect test; keep spawn test).

## Rejected alternatives

- *Auto-pickup with no delay*: Minecraft's delay prevents instant
  self-collection and gives drops a moment to spread; skipping it breaks parity
  and would make the 111 e2e flaky. Rejected.
- *Merge into the most-recently-spawned entity*: keeping the lower id is simpler
  and preserves id ordering; either is fine, lower-id chosen for determinism.
- *Physics-based attraction*: that is 130; doing it here expands scope and the
  advancement gate. Proximity pickup only.
- *Per-entity pickup-delay flag*: the age-based delay is sufficient and already
  tracked; an extra flag adds state without parity benefit.

## Downstream dependencies

- 130 entity physics will move `x/y/z` (and `vx/vy/vz`); pickup/merge will then
  operate on moving entities, which these methods already support (distance-based).
- 131 autosave will serialize the aged/merged/picked state through 037 unchanged.
- 148 mob death reuses `spawnLootStacks`; its drops become collectible for free.
