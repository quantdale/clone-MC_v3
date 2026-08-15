# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **114-tool-tier-and-harvest-rules — VERIFIED 100%**
- Active implementation change: **114-tool-tier-and-harvest-rules — VERIFIED**
- Next change: **115-item-durability-repair — NOT YET ACTIVE (artifacts pending)**
- 114 task ledger: **7 total tasks, 7 completed**
- 114 completion: **100%**
- 114 mandatory tool-tier-and-harvest-rules requirements: **PASS**
- 114 required-test gate: **PASS — unit 1354/1354, E2E 21/21**
- 114 advancement allowed: **Yes**
- Session-start head: `e715b661b40b252baf64d7abe190eee40eb4836f`
- Validated head: `2dcae08fd01a8ab83092521f941600fdcdb2c510` (114 feature commit; state advanced to 115)
- Next exact action: **Advance to 115-item-durability-repair. Read it (and SPEC_AUTHORING_PROTOCOL.md if artifacts incomplete), author/validate proposal/design/tasks/specs/verification, implement general component-driven durability damage/break/repair rules, verify full gate, commit + push, advance program state.**

## What 114 implemented

Change 114 adds tool-tier and harvest rules driven by block/item tags. It
introduces a `miningLevel` (block) + `toolTier` (item) data model, mineable/tools
tag factories, and a `HarvestRules` module that decides effective tool, drop
eligibility, and break speed — wired into `PlayerInteraction`/`Game` so blocks
that require a tool no longer drop by hand.

- `src/world/BlockRegistry.ts` (EDIT) — `miningLevel?: number` on
  `BlockTypeDefinition`; set `miningLevel: 1` on the six pickaxe-family blocks
  (Stone, CoalOre, IronOre, Cobblestone, Bricks, Furnace). New `MINABLE_TAG_BY_KIND`
  + `createDefaultBlockTags(blockRegistry)` builds/finalizes
  `minecraft:mineable/{pickaxe,axe,shovel}` from `preferredTool`.
- `src/inventory/ItemRegistry.ts` (EDIT) — `toolTier?: number` on
  `ItemTypeDefinition`; `toolTier: 1` on WoodenPickaxe/WoodenAxe, `2` on
  StonePickaxe. New `TOOLS_TAG_BY_KIND` + `createDefaultItemTags(itemRegistry)`.
- `src/world/HarvestRules.ts` (NEW) — `HarvestRules` with `blockToolKind`,
  `toolKind`, `isEffectiveTool`, `canHarvest`, `getBreakDuration` (floor
  `MIN_BREAK_DURATION = 0.08`). Tag-driven kind; tier gate: effective iff kind
  matches AND (`miningLevel===0` OR `toolTier>=miningLevel`); harvestable iff level
  0, or right kind + `toolTier>=miningLevel`.
- `src/player/PlayerInteraction.ts` (EDIT) — optional `harvestRules?` field;
  `getBreakDuration` delegates to `HarvestRules` with legacy fallback; `finishBreak`
  gates drops on `canHarvest` (no drop when not harvestable; block still removed,
  tool still damaged).
- `src/engine/Game.ts` (EDIT) — builds `blockTags`/`itemTags`/`harvestRules` after
  loot tables and injects `harvestRules` into `PlayerInteraction`.

## Validation evidence (114)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1354/1354 (prior 1329 + 24 new HarvestRules + 1 PlayerInteraction)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (drop tests target level-0 terrain; gating leaves them dropping)

## Advancement decision

Change 114 is **VERIFIED** at 7/7 (100%). All gates are green: typecheck, lint,
the new 1354-unit suite, production build, and the required E2E suite (21/21). No
advancement exception was needed. Advance to 115.

## What 113 implemented

Change 113 adds durable, serializable player-equipment state integrated with the
existing `Inventory`. It is state + integration only: no protection math, shield
logic, or HUD.

- `src/inventory/Equipment.ts` (NEW) — `EquipmentSlot` (Head/Chest/Legs/Feet/Offhand),
  `EQUIPMENT_SLOT_ORDER`, `ARMOR_SLOTS`, `EquipmentSnapshot { version:1, slots:(ItemStack|null)[] }`,
  and `PlayerEquipment`:
  - `getEquipment(slot)` → `ItemStack | null`;
  - `setEquipment(slot, stack|null)` stores/replaces and returns the previous stack,
    clamping `count` into `[1, MAX_STACK]`, preserving `components`;
  - `clear()` empties all five slots;
  - `getArmorStacks()` returns non-null armor in Head→Chest→Legs→Feet order (the
    116 input);
  - `serialize()` (pure) + `restore(data, isValidItem)` / `validateSnapshot`
    (atomic — a malformed payload returns false without mutating any slot).
- `src/inventory/Inventory.ts` (EDIT) — `readonly equipment: PlayerEquipment`
  (ctor-initialized); `InventorySnapshot.equipment` (optional, backward compatible);
  `snapshot()` includes `equipment.serialize()`; `restore()` validates and restores
  equipment in its atomic early-return block, so a malformed equipment block rejects
  the whole restore.

## Validation evidence (113)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1329/1329 (prior 1306 + 23 new Equipment)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (no new e2e needed — state-only change; 111/112 drop tests stay green)

## Advancement decision

Change 113 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, the
new 1329-unit suite, production build, and the required E2E suite (21/21). No
advancement exception was needed. Advance to 114.

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

## Next change: 115 (pending artifacts)

`115-item-durability-repair` is named in `CHANGE_SEQUENCE.md` with scope "General
component-driven durability damage/break/repair rules." Per `AGENTS.md`, a change
lacking full artifacts is a hard pre-implementation block. Author and validate those
artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 114
verification. Change 115 is the next change; its artifacts must be authored and
validated before implementation begins.
