# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **112-item-pickup-and-despawn — VERIFIED 100%**
- Active implementation change: **112-item-pickup-and-despawn — VERIFIED**
- Next change: **113-equipment-slots — NOT YET ACTIVE (artifacts pending)**
- 112 task ledger: **6 total tasks, 6 completed**
- 112 completion: **100%**
- 112 mandatory item-pickup-and-despawn requirements: **PASS**
- 112 required-test gate: **PASS — unit 1306/1306, E2E 21/21**
- 112 advancement allowed: **Yes**
- Session-start head: `e715b661b40b252baf64d7abe190eee40eb4836f`
- Validated head: `4f7d0e7bb3586590b783ba340814122952664159` (112 feature commit; state advanced to 113)
- Next exact action: **Advance to 113-equipment-slots. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (113 artifacts must be authored before implementation), validate, implement armor/offhand/mainhand equipment state and inventory integration, verify full gate, commit + push, advance program state.**

## What 112 implemented

Change 112 makes mined-block item entities collectible and self-managing: pickup
delay, merge policy, inventory insertion, and a despawn timer, wired into the
per-tick simulation.

- `src/world/ItemEntity.ts` — `ItemEntity.count` is now mutable; the manager is
  the sole owner of quantity (merge + partial pickup adjust it; `createItemEntity`
  still validates the initial value). Value domain unchanged (`1..stackSize`).
- `src/simulation/ItemEntityManager.ts` — constants `PICKUP_DELAY_TICKS = 10`
  (0.5s), `DESPAWN_AGE_TICKS = 6000` (5 min), `MERGE_RADIUS = 0.25`,
  `PICKUP_RADIUS = 1.5`, and three methods:
  - `mergeEntities(radius)` — folds overlapping same-item entities into one up to
    `stackSize`; iterates a stable id snapshot so 3+ overlaps fold idempotently
    into a single entity; returns removed count.
  - `despawnExpired(maxAgeTicks)` — removes entities with `ageTicks >= cap`
    (inclusive); returns removed count.
  - `collectPlayerDrops(px,py,pz, insert, pickupRadius)` — for each deliverable
    drop (past delay AND within radius), offers `insert(item,count)` (mirrors
    `Inventory.addItem`'s leftover contract); removes on full insert, reduces
    `count` on partial; returns total collected; iterates a snapshot.
- `src/engine/Game.ts` — in the active-simulation block after
  `tickItemEntities(dt)`, runs `mergeEntities()`, `despawnExpired()`, and
  `collectPlayerDrops(player.position…, (id,n)=>inventory.addItem(id,n))`, and
  re-renders the hotbar when collection returns > 0.

## Validation evidence (112)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1306/1306 (prior 1290 + 16 new ItemPickup)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (new `breaking a block drops an item the player collects`; 111
  `breaking a block spawns a world item entity` regression stays green)

## Advancement decision

Change 112 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint,
the new 1306-unit suite, production build, and the required E2E suite (21/21,
including the new collect test and the preserved 111 spawn test). No advancement
exception was needed. Advance to 113.

## What 111 implemented

Change 111 adds world item-entity spawning for block/entity drops.

- `src/world/ItemEntity.ts` (NEW) — `ITEM_ENTITY_TYPE_KEY 'minecraft:item'`; `ItemEntity`
  interface (id, item, count, x/y/z, vx/vy/vz, ageTicks); `createSpawnPosition(bx,by,bz)`
  → block center `{x+0.5,y+0.5,z+0.5}`; strict `createItemEntity` validating finite
  coords/velocity and a non-negative integer `ageTicks`.
- `src/simulation/ItemEntityManager.ts` (NEW) — per-world store; strict id minting;
  `spawnItemEntity` (item-registry + positive-integer-count + stackSize + finite-coord
  validation, atomic on rejection); `spawnLootStacks` (splits each stack into
  `ceil(count/stackSize)` entities with deterministic rng jitter, or exact positions with
  no rng); `removeItemEntity` / `getItemEntity` / `getItemEntities` (insertion order) /
  `getItemEntitiesInChunk` (floor x/16, floor z/16); `tickItemEntities(dt)` ages by
  `round(dt*20)`, no-op when `dt<=0`; `clear` / `size`; `serializeAll` / `deserializeAll`
  to the 037 `SerializedEntity` envelope (atomic all-or-nothing validation, resets nextId
  to maxId+1). Velocity stored for 130 physics.
- `src/player/PlayerInteraction.ts` — `itemEntities?` constructor field; `finishBreak`
  collects drops into `LootStack[]` (loot table, else `dropItem`/`resourceId` fallback;
  leaves → `ItemId.Apple`) and routes them through `itemEntities.spawnLootStacks` at the
  block center. The `selector.addItem` drop path is removed; `onAction('break', primaryDropId)`
  is unchanged.
- `src/engine/Game.ts` — constructs `new ItemEntityManager({ itemRegistry, rng: Math.random })`,
  passes it to `PlayerInteraction`, ticks it each simulation step, and exposes it publicly
  (`window.__voxelGame.itemEntities`).

## Validation evidence (111)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1290/1290 (prior 1267 + 23 new ItemEntityManager + rewritten PlayerInteraction ore test)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 20/20 (new `breaking a block spawns a world item entity`)

## Advancement decision

Change 111 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, the new
1290-unit suite, production build, and the required E2E suite (20/20). No advancement
exception was needed. Advance to 112.

## Next change: 113 (pending artifacts)

`113-equipment-slots` is named in `CHANGE_SEQUENCE.md` with scope "Armor/offhand/
mainhand equipment state and inventory integration." Per `AGENTS.md`, a change lacking
full artifacts is a hard pre-implementation block. Author and validate those artifacts
via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 112
verification. Change 113 is the next change; its artifacts must be authored and
validated before implementation begins.
