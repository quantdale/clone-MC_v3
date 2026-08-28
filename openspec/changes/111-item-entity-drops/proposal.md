# Proposal: 111-item-entity-drops

## Problem

When a block is mined, `PlayerInteraction.finishBreak` inserts the resulting
stacks directly into the player's inventory via `BlockSelector.addItem`. There is
no concept of an item *in the world*: drops cannot fall, accumulate on the
ground, be pushed by pistons, survive the miner walking away, or be collected by
another mechanic. Minecraft parity requires drops to appear as world item
entities that the player (and future systems) interact with.

This change introduces the **item entity** primitive and the deterministic
manager that spawns drops into the world. Pickup, merge, and despawn (112) and
entity-physics movement (130) build on this foundation.

## Goals

- Define an immutable, validated `ItemEntity` runtime model (id, item, count,
  position, velocity, age).
- Provide an `ItemEntityManager` that deterministically mints unique ids, spawns
  item entities from one or many stacks (splitting oversized counts), ticks age,
  queries/removes, and serializes to the 037 entity envelope.
- Route block-break drops through the manager so mined blocks leave item
  entities in the world instead of teleporting into the inventory.
- Keep the whole system deterministic and unit-tested, with the full gate green.

## Non-goals

- **Pickup / despawn / merge** — deferred to 112. In 111 an item entity persists
  in the world indefinitely and is never collected.
- **Movement / gravity / collision** — deferred to 130. Velocity is stored on the
  entity for future integration but is not applied in 111; position is static
  after spawn (a small deterministic spawn offset spreads stacked drops).
- **Live autosave wiring** — the 037 envelope and store exist; the runtime that
  reads/writes entity records during autosave is 131. 111 only provides
  lossless serialize/deserialize aligned to that envelope.
- **Entity (mob) death drops** — mobs arrive at 129+. The spawn API is reusable
  for them but no mob drops are produced yet.

## Preconditions

- 110 VERIFIED; `LootTable.evaluate` returns `LootStack { item: number; count: number }`.
- `ItemTypeRegistry` exposes `has(id)`, `get(id)`, `get(id).stackSize`.
- `BlockRegistry` blocks carry `dropItem` / `lootTable` (011).
- 037 `SerializedEntity` envelope `{ schemaVersion, typeKey, x, y, z, data }`.

## Dependencies

- 011 loot tables, 004 block/item separation, 008/009 stack model, 037 entity
  persistence envelope, 052 block-entity-manager pattern (used as the structural
  template).

## Proposed change

1. `src/world/ItemEntity.ts` (NEW): `ItemEntity` type, `ITEM_ENTITY_TYPE_KEY`,
   `createSpawnPosition(blockX,blockY,blockZ)`, and a strict `createItemEntity`
   constructor that validates finite coordinates/velocity, non-negative age, and
   positive integer count.
2. `src/simulation/ItemEntityManager.ts` (NEW): chunk-agnostic id-minting store
   holding item entities; `spawnItemEntity`, `spawnLootStacks` (split into
   stackSize chunks with deterministic spawn jitter), `removeItemEntity`,
   `getItemEntity(s)`, `getItemEntitiesInChunk`, `tickItemEntities(dt)` (advances
   age by `round(dt*20)`), `clear`, `serializeAll` / `deserializeAll` to the 037
   envelope (all-or-nothing).
3. `src/player/PlayerInteraction.ts`: constructor gains `itemEntities?`:
   `ItemEntityManager`; `finishBreak` collects drops into `LootStack[]` (loot
   table or `dropItem` fallback, leaves→apple) and calls
   `itemEntities.spawnLootStacks(stacks, spawn.x, spawn.y, spawn.z, rng)` at the
   block center instead of `selector.addItem`.
4. `src/engine/Game.ts`: construct one `ItemEntityManager`, pass it to the
   interaction, and call `itemEntities.tickItemEntities(dt)` each simulation tick;
   expose it (public readonly) for inspection/tests.

## Compatibility and migration

No stored-data shape changes. Serialized item entities use the forward-compatible
037 `SerializedEntity` envelope, so 131 can persist them without a migration. No
registry id churn; no new blocks/items.

## Risks

- **Temporary collectability regression**: between 111 and 112, mined items are no
  longer added to the inventory automatically. This is the intended phased
  sequence (111 spawns, 112 collects) and the existing gate (e2e only asserts the
  block becomes air) stays green.
- **Scope creep**: movement/despawn/pickup are explicitly out of scope (see
  Non-goals) to keep 111 shippable and verified.

## Rollback strategy

The change is additive and isolated behind the `itemEntities` injection. Removing
the `PlayerInteraction` drop-routing edit and the manager restores the prior
inventory-direct behavior. No persistent data depends on it yet.

## Definition of Done

- `ItemEntity` + `ItemEntityManager` implemented with strict validation.
- Block-break drops spawn world item entities (verified by unit + e2e).
- Manager is deterministically tickable and round-trips through the 037 envelope.
- Full gate green: typecheck, lint, 1267+ unit tests, build, 19 e2e.
- Artifacts updated; program state advanced.

## Advancement gate

Target 100%. No MUST/SHALL requirement may fail. Required tests: the new
`ItemEntityManager` suite, the updated break-flow behavior, and the unchanged
baseline (unit + e2e). Below 100% advancement is forbidden.
