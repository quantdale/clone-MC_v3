# Spec: item-entity-drops

## Contract

Mined-block drops MUST be realized as world item entities managed by a single
`ItemEntityManager`, rather than inserted directly into the player inventory. The
manager MUST deterministically mint unique ids, validate every spawn, support
stack splitting, age ticking, querying, removal, and lossless serialization
through the 037 `SerializedEntity` envelope.

This spec covers block-break spawning only. Pickup, despawn, merge, movement, and
mob-death drops are specified by later changes (112/130/148).

## Definitions

- **Item entity**: a free-floating world object holding one item stack (`item`,
  `count`), a float position `(x,y,z)`, stored motion `(vx,vy,vz)`, and `ageTicks`.
- **Spawn position**: the broken block's center raised 0.5 on Y.
- **Stack split**: when a drop's `count` exceeds the item's `stackSize`, it is
  divided into `ceil(count/stackSize)` entities each of `<= stackSize`.

## Invariants

- I1. Every live item entity has a unique non-negative integer `id`.
- I2. `1 <= count <= stackSize(item)` for every entity.
- I3. `item` is a registered `ItemId`.
- I4. `x/y/z`, `vx/vy/vz` are finite; `ageTicks >= 0`.
- I5. `serializeAll` → `deserializeAll` is the identity on entity data.
- I6. `deserializeAll` is atomic: one bad record rejects the whole batch.

## Requirements

### Requirement: unique id minting

`ItemEntityManager` MUST assign a strictly increasing non-negative integer `id` to
each spawned entity and MUST NOT reuse an id while the manager is alive.

#### Scenario: ids are sequential and unique
- **GIVEN** a manager with no entities
- **WHEN** three entities are spawned
- **THEN** their `id`s are `0, 1, 2` (or the next three distinct integers) with no duplicates

#### Scenario: deserialize preserves ids and continues minting above them
- **GIVEN** a manager that serialized entities with ids `5, 9`
- **WHEN** those are deserialized and a new entity is spawned
- **THEN** the new entity's `id` is `> 9` and no existing id is reused

### Requirement: spawn validation

`spawnItemEntity` MUST reject an unknown item id, a non-positive or non-integer
`count`, a `count` greater than the item's `stackSize`, and any non-finite
coordinate or velocity, each by throwing a descriptive error and leaving the
manager unchanged.

#### Scenario: unknown item is rejected
- **GIVEN** a manager
- **WHEN** `spawnItemEntity({item: 99999, count: 1}, 0, 0, 0)` is called
- **THEN** it throws and `size` remains `0`

#### Scenario: oversized count is rejected by spawnItemEntity
- **GIVEN** an item with `stackSize` 64
- **WHEN** `spawnItemEntity({item, count: 100}, 0, 0, 0)` is called
- **THEN** it throws and `size` remains `0`

#### Scenario: non-finite coordinate is rejected
- **GIVEN** a manager
- **WHEN** `spawnItemEntity({item, count: 1}, NaN, 0, 0)` is called
- **THEN** it throws and `size` remains `0`

### Requirement: stack splitting on spawn

`spawnLootStacks` MUST split any stack whose `count` exceeds `stackSize` into
multiple entities, each of `count <= stackSize`, with the total equal to the
original `count`.

#### Scenario: a 200-count drop becomes four entities
- **GIVEN** an item with `stackSize` 64
- **WHEN** `spawnLootStacks([{item, count: 200}], x, y, z)` is called
- **THEN** four entities exist with counts `64, 64, 64, 8` and the same `item`

#### Scenario: multiple distinct stacks each spawn
- **GIVEN** two different items
- **WHEN** `spawnLootStacks([{a,1},{b,1}], x, y, z)` is called
- **THEN** two entities exist, one per item

### Requirement: block-break spawns world item entities

`PlayerInteraction.finishBreak` MUST, for every mined block, spawn the resolved
drops as item entities at the block-center spawn position and MUST NOT insert them
into the player inventory via `selector.addItem`.

#### Scenario: loot-table block spawns its drop
- **GIVEN** a breakable block with a loot table yielding `stone` x1
- **WHEN** the block is broken
- **THEN** exactly one item entity with `item == stone` exists in the world and the
  inventory was not modified by the drop

#### Scenario: leaves additionally drop an apple
- **GIVEN** a `Leaves` block
- **WHEN** the block is broken
- **THEN** item entities for both the leaves drop and an `Apple` exist

#### Scenario: fallback drop without a loot table
- **GIVEN** a block with `dropItem` and no loot table entry
- **WHEN** the block is broken
- **THEN** one item entity for `dropItem` exists

### Requirement: deterministic spawn jitter

When an `rng` is supplied, `spawnLootStacks` MUST place split entities at
deterministic positions derived from `rng`, so the same inputs reproduce the same
world layout. When no `rng` is supplied, positions MUST equal the exact spawn
point.

#### Scenario: no rng yields exact positions
- **GIVEN** `spawnLootStacks(stacks, 10.5, 20.5, 30.5)` with no rng
- **WHEN** entities are spawned
- **THEN** every entity's `x/y/z` equals `10.5/20.5/30.5`

### Requirement: age ticking

`tickItemEntities(dt)` MUST advance each live entity's `ageTicks` by `round(dt*20)`
(20 ticks per second) and MUST return the number of ticked entities. A non-positive
or zero `dt` MUST tick nothing.

#### Scenario: one second ages entities by 20 ticks
- **GIVEN** an entity with `ageTicks` 0
- **WHEN** `tickItemEntities(1.0)` is called
- **THEN** `ageTicks` is `20`

### Requirement: query and removal

The manager MUST support `getItemEntity(id)`, `getItemEntities()` (insertion
order), `getItemEntitiesInChunk(cx,cz)` (entities whose floor(x/16),floor(z/16)
match), and `removeItemEntity(id)` returning whether one was removed.

#### Scenario: removal drops the entity
- **GIVEN** a spawned entity with known `id`
- **WHEN** `removeItemEntity(id)` is called
- **THEN** it returns `true`, `getItemEntity(id)` is `null`, and `size` decreases by 1

#### Scenario: chunk grouping
- **GIVEN** entities at world x=16 and x=40 (same chunk cx=1) and x=48 (cx=3)
- **WHEN** `getItemEntitiesInChunk(1, 0)` is called
- **THEN** it returns the two entities in chunk 1 only

### Requirement: 037 envelope serialization

`serializeAll` MUST emit one `SerializedEntity` per entity with
`typeKey = 'minecraft:item'`, integer `x/y/z` (chunk grouping via `Math.floor`),
and a `data` payload carrying the full float `x/y/z`, `vx/vy/vz`, `ageTicks`,
`item`, `count`, and `id`. `deserializeAll` MUST restore all fields exactly and
MUST reject a foreign/old `typeKey` or malformed `data` atomically.

#### Scenario: round-trip preserves fractional position and velocity
- **GIVEN** an entity at `(10.25, 20.75, 30.1)` with `vx=0.05`
- **WHEN** `deserializeAll(serializeAll())` runs
- **THEN** the restored entity has identical `x/y/z/vx` to the original

#### Scenario: foreign typeKey rejects the whole batch
- **GIVEN** a serialized batch containing one `typeKey: 'minecraft:zombie'`
- **WHEN** `deserializeAll` is called
- **THEN** it throws and the manager's entities are unchanged

## Error and failure behavior

- Spawn of an invalid stack throws and performs no partial insertion.
- `deserializeAll` validates the entire batch before mutating; on any error the
  manager is left exactly as before the call.
- `tickItemEntities` with `dt <= 0` is a no-op (returns 0).

## Performance and resource bounds

- Tick cost is O(live entities) with no per-entity allocation.
- Splitting produces at most `ceil(count/stackSize)` entities per stack.
- Serialization cost is O(live entities).

## Compatibility and migration

No persistent-data changes in 111. Serialized entities use the 037 envelope so the
131 runtime can persist them without a migration.

## Security and integrity

- Id minting prevents collisions that could cause two entities to share state.
- Spawn validation prevents malformed (non-finite / out-of-range) entities from
  entering the world.
- Atomic deserialize prevents a single corrupt record from poisoning the world's
  entity set.

## Observability

- `size`, `getItemEntities()`, and `getItemEntitiesInChunk()` allow tests and the
  debug overlay to inspect live drops.

## Verification mapping

| Requirement | Test |
|---|---|
| unique id minting | ItemEntityManager.test.ts: id sequence + deserialize continuation |
| spawn validation | ItemEntityManager.test.ts: unknown item / oversize / non-finite |
| stack splitting | ItemEntityManager.test.ts: 200-split + multi-stack |
| block-break spawns | ItemEntityManager.test.ts integration + e2e game.spec.ts break→entity |
| deterministic jitter | ItemEntityManager.test.ts: no-rng exact positions |
| age ticking | ItemEntityManager.test.ts: tick advances age |
| query/removal | ItemEntityManager.test.ts: remove + chunk grouping |
| 037 serialization | ItemEntityManager.test.ts: round-trip + foreign reject |
