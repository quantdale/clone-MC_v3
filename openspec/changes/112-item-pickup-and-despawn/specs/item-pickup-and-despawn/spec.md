# Spec: item-pickup-and-despawn

## Contract

World item entities spawned by 111 MUST become collectible and self-managing
over time. The `ItemEntityManager` MUST provide a pickup delay, a merge policy,
inventory insertion, and a despawn timer, and `Game.update` MUST run them each
simulation tick after age ticking so drops are eventually collected and the
world does not accumulate inert entities.

This spec covers pickup, merge, insertion, and despawn only. Movement/gravity
and attraction toward the player are specified by 130; live autosave of the
transient state is 131.

## Definitions

- **Pickup delay**: an entity with `ageTicks < PICKUP_DELAY_TICKS` cannot be
  collected, regardless of how close the player is.
- **Merge**: two same-`item` entities whose center distance is `<= MERGE_RADIUS`
  combine into one entity whose `count` is the sum, capped at `stackSize(item)`.
- **Pickup radius**: an entity is collectible only when its distance from the
  player point is `<= PICKUP_RADIUS`.
- **Despawn age**: an entity with `ageTicks >= DESPAWN_AGE_TICKS` is removed.

## Invariants

- J1. For every live entity, `1 <= count <= stackSize(item)`. Merge caps at
  `stackSize`; partial pickup never yields a negative or over-cap count.
- J2. Every live entity keeps a unique non-negative integer `id`.
- J3. Pickup is delayed: `ageTicks < PICKUP_DELAY_TICKS` implies never collected.
- J4. `mergeEntities` is idempotent on a static world: after one pass no two
  same-`item` entities remain within `MERGE_RADIUS`.
- J5. `despawnExpired` is monotonic: a removed entity is gone and is never
  collected afterward.
- J6. `insert` is the single inventory side-effect; the manager never touches
  inventory internals. A full `insert` return (leftover == count) leaves the
  entity's `count` unchanged.
- J7. `collectPlayerDrops` iterates a snapshot, so removing/reducing entities
  during collection is safe.

## Requirements

### Requirement: pickup delay

`collectPlayerDrops` MUST NOT collect an entity whose `ageTicks <
PICKUP_DELAY_TICKS`, even when it is within `pickupRadius`, and MUST NOT call
`insert` for it.

#### Scenario: young drop is not collected
- **GIVEN** an entity at the player point with `ageTicks = PICKUP_DELAY_TICKS - 1`
- **WHEN** `collectPlayerDrops(px,py,pz, insert)` is called with `insert` returning 0
- **THEN** `insert` is never called and the entity remains in the world

#### Scenario: delay boundary is the first collectible tick
- **GIVEN** an entity at the player point with `ageTicks = PICKUP_DELAY_TICKS`
- **WHEN** `collectPlayerDrops(px,py,pz, insert)` is called
- **THEN** `insert` is called once and the entity is removed

### Requirement: merge policy

`mergeEntities(radius)` MUST fold every pair of same-`item` entities whose center
distance is `<= radius` into a single surviving entity, moving the summed `count`
into it (capped at `stackSize(item)`), and remove the other. It MUST return the
number of entities removed. When no pair qualifies, it MUST be a no-op returning 0.

#### Scenario: overlapping same-item drops merge
- **GIVEN** two entities of the same `item` (`stackSize` 64) at distance 0.1 with
  counts `10` and `5`
- **WHEN** `mergeEntities()` is called
- **THEN** one entity remains with `count = 15` and the method returns 1

#### Scenario: distant drops do not merge
- **GIVEN** two entities of the same `item` at distance 1.0
- **WHEN** `mergeEntities()` is called
- **THEN** both entities remain and the method returns 0

#### Scenario: merge caps at stackSize
- **GIVEN** two entities of the same `item` (`stackSize` 64) with counts `50` and
  `40` within `MERGE_RADIUS`
- **WHEN** `mergeEntities()` is called
- **THEN** both entities remain (neither exceeds its own cap) and the method
  returns 0

#### Scenario: different items never merge
- **GIVEN** two entities of different `item`s within `MERGE_RADIUS`
- **WHEN** `mergeEntities()` is called
- **THEN** both entities remain and the method returns 0

### Requirement: inventory insertion

`collectPlayerDrops` MUST, for each collectible entity (past delay and within
`pickupRadius`), call `insert(item, count)`. On a full insert (leftover <= 0) it
MUST remove the entity; on a partial insert it MUST set the entity's `count` to
the leftover and keep it. The method MUST return the total count collected and
MUST skip entities outside `pickupRadius`.

#### Scenario: full insert removes the entity
- **GIVEN** an entity with `count = 3` at the player point, `insert` returning 0
- **WHEN** `collectPlayerDrops(px,py,pz, insert)` is called
- **THEN** `insert(item, 3)` is called, the entity is removed, and the return is 3

#### Scenario: partial insert reduces count to leftover
- **GIVEN** an entity with `count = 5` at the player point, `insert` returning 2
- **WHEN** `collectPlayerDrops(px,py,pz, insert)` is called
- **THEN** the entity remains with `count = 2` and the return is 3

#### Scenario: entity outside pickup radius is skipped
- **GIVEN** an entity with `count = 1` at distance `pickupRadius + 1` from the
  player point
- **WHEN** `collectPlayerDrops(px,py,pz, insert)` is called
- **THEN** `insert` is never called and the entity remains

#### Scenario: full inventory leaves the entity untouched
- **GIVEN** an entity with `count = 4` at the player point, `insert` returning 4
  (inventory full)
- **WHEN** `collectPlayerDrops(px,py,pz, insert)` is called
- **THEN** the entity remains with `count = 4` and the return is 0

### Requirement: despawn timer

`despawnExpired(maxAgeTicks)` MUST remove every entity with `ageTicks >=
maxAgeTicks` and MUST return the number removed. The boundary MUST be inclusive
(`ageTicks == maxAgeTicks` despawns). With no eligible entity it MUST be a no-op
returning 0.

#### Scenario: aged entity despawns at the boundary
- **GIVEN** an entity with `ageTicks = DESPAWN_AGE_TICKS`
- **WHEN** `despawnExpired()` is called
- **THEN** the entity is removed and the method returns 1

#### Scenario: young entity survives
- **GIVEN** an entity with `ageTicks = DESPAWN_AGE_TICKS - 1`
- **WHEN** `despawnExpired()` is called
- **THEN** the entity remains and the method returns 0

### Requirement: simulation wiring

`Game.update` MUST, inside its active-simulation block and after
`itemEntities.tickItemEntities(dt)`, call `itemEntities.mergeEntities()`,
`itemEntities.despawnExpired()`, and
`itemEntities.collectPlayerDrops(player.position…, (id, n) => inventory.addItem(id, n))`,
and MUST re-render the hotbar whenever `collectPlayerDrops` returns a positive
value.

#### Scenario: standing on a fresh drop collects it
- **GIVEN** the player stands at a recently broken block and a drop exists at that
  point with `ageTicks >= PICKUP_DELAY_TICKS`
- **WHEN** the simulation ticks
- **THEN** the inventory gains the dropped item and the entity count decreases

#### Scenario: e2e regression — the drop still appears immediately after the break
- **GIVEN** a breakable block the player is mining
- **WHEN** the block becomes air
- **THEN** a world item entity exists (`itemEntities.size > 0`) before the pickup
  delay elapses

## Error and failure behavior

- `insert` returning its full input (inventory full) leaves the entity untouched
  (`count` unchanged) — no item is lost.
- A partially full inventory leaves the entity with the correct leftover `count`.
- `mergeEntities` / `despawnExpired` / `collectPlayerDrops` with no eligible
  entities are no-ops returning 0.
- Distance and age checks use inclusive `>=`, so the boundary tick is the first
  collectible / despawn tick.

## Performance and resource bounds

- Merge is O(n²) over live entities; n is bounded by active drops (tens in 112's
  single-world scope).
- Despawn and pickup are O(n) with no allocation beyond the per-call snapshot
  array.
- All three run once per simulation tick; total cost is linear in live entities.

## Compatibility and migration

`ItemEntity.count` becomes mutable, but its value domain is unchanged
(`1..stackSize`). The 037 envelope and `serializeAll`/`deserializeAll` are
untouched; `ageTicks` and `count` already round-trip, so 131 can persist the
post-112 state with no migration.

## Security and integrity

- Merge never produces a `count` over `stackSize`, preventing inventory corruption
  via oversized stacks.
- Pickup delay prevents instant self-collection and gives drops a moment to
  spread, matching parity and keeping the 111 e2e stable.
- `insert` is the only inventory side-effect, so the manager cannot corrupt
  unrelated inventory state.

## Observability

- `size`, `getItemEntities()`, and the manager's methods allow tests and the debug
  overlay to inspect live drops, merges, pickups, and despawns.

## Verification mapping

| Requirement | Test |
|---|---|
| pickup delay | ItemPickup.test.ts: young drop not collected + boundary tick |
| merge policy | ItemPickup.test.ts: overlap merge / distance / cap / different items |
| inventory insertion | ItemPickup.test.ts: full / partial / radius / full-inventory |
| despawn timer | ItemPickup.test.ts: boundary despawn / young survives |
| simulation wiring | e2e game.spec.ts: break→collect + break→entity spawn regression |
