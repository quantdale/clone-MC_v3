# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **140-hostile-target-ai — VERIFIED 100%**
- Active implementation change: **140-hostile-target-ai — VERIFIED**
- Next change: **141-melee-combat-cooldown — NOT YET ACTIVE (artifacts pending)**
- 140 task ledger: **5 total task groups, 5 completed**
- 140 completion: **100%**
- 140 mandatory hostile-target-ai requirements: **PASS**
- 140 required-test gate: **PASS — unit 1808/1808, E2E 21/21**
- 140 advancement allowed: **Yes**
- Session-start head: `221a52c37e07c42c6c62c0cc27666bc06f6a2a47`
- Validated head: `69e0f84d5369fa3584e683b3f0fce40be07bf4a8` (140 feature commit)
- Next exact action: **Advance to 141-melee-combat-cooldown. Author/validate its OpenSpec artifacts per SPEC_AUTHORING_PROTOCOL.md (Java-like attack cooldown, damage, knockback, invulnerability frames, building on 140 HostileTargetAI + existing damage/attribute registries); implement; verify full gate; commit + push; advance program state.**

## What 119 implemented

Change 119 applies enchantment effects to the mining, combat, and durability
pathways. It builds on the 118 registry: it reads enchantments off an
`ItemStack` via the new `ENCHANTMENTS_COMPONENT`, computes each effect with
pure primitives, and folds those effects into the existing
`HarvestRules` / `PlayerInteraction` / `DurabilityRules` / `ArmorProtection` /
`SurvivalSystem` / `Game` code. It is effect application — not the enchanting
table UI/offer generation (120), `ItemStack` acquisition of enchantments (120),
or live armor-equipment wiring (deferred; 116 gap).

- `src/inventory/StackDataComponents.ts` (EDIT) — `ENCHANTMENTS_COMPONENT`
  (`createResourceId('minecraft','enchantments')`), `EnchantmentsComponentValue`
  (record `string -> number`), `enchantmentsComponentType` validating a non-null
  object whose every value is a finite integer `>= 1`; registered in
  `createDefaultStackComponentRegistry`.
- `src/inventory/EnchantmentApplication.ts` (NEW) — `getStackEnchantments` /
  `setStackEnchantments` / `getEnchantmentLevel` storage accessors plus the
  effect primitives `efficiencySpeedMultiplier(l)=1+0.3*l`,
  `silkTouchActive(l)=l>=1`, `fortuneBonusCount(l,rng)=l<=0?0:floor(rng()*(l+1))`,
  `weaponDamageBonus` (sharpness `1+0.5*l`, smite/bane `2.5*l`, else 0),
  `unbreakingWearChance(l)=1/(l+1)`, `protectionEPF(kind,l)` (protection→`l`,
  else `2*l`), `protectionEnchantKeysFor(d)` (fire/lava→+fire_protection,
  explosion/blast→+blast_protection, projectile/arrow→+projectile_protection,
  else `['protection']`), `armorEnchantEPF` (sum, capped 20), and
  `applyArmorEnchantReduction(reduced,epf)=epf>0?reduced/(epf+1):reduced`.
- `src/world/HarvestRules.ts` (EDIT) — `getBreakDuration` divides the effective
  duration by `efficiencySpeedMultiplier(level)` when `efficiencyLevel > 0`,
  floored at `MIN_BREAK_DURATION`.
- `src/player/PlayerInteraction.ts` (EDIT) — optional `enchantmentRegistry?`;
  `advanceBreak` passes the selected stack's `efficiency` level; `finishBreak`
  applies Silk Touch (override primary drop with the block's item form) and
  Fortune (add `fortuneBonusCount` to the primary drop), and reads `unbreaking`
  from the selected stack to forward `unbreakingLevel` + `rng` to
  `selector.damageSelectedItem`.
- `src/inventory/DurabilityRules.ts` (EDIT) — `applyDamage` gains optional
  `unbreakingLevel?` / `rng?`; skips wear when
  `unbreakingLevel > 0 && rng !== undefined && rng() >= 1/(unbreakingLevel+1)`.
- `src/inventory/BlockSelector.ts` / `Inventory.ts` (EDIT) — `getSelectedStack?()`
  added; `damageSelectedItem?(amount, maxDurability, unbreakingLevel?, rng?)`
  implemented in `Inventory` (delegates to `DurabilityRules`).
- `src/player/ArmorProtection.ts` (EDIT, bug fix) — import corrected from
  `'./EnchantmentRegistry'` to `'../inventory/EnchantmentRegistry'`; constructor
  gains optional `enchantRegistry?`; `reduce(rawDamage, bypassArmor, damageType?)`
  folds `armorEnchantEPF` into the post-armor `reduced` via
  `applyArmorEnchantReduction`, leaving `absorbed` unchanged; returns the
  EPF-less result when no registry is present.
- `src/player/SurvivalSystem.ts` (EDIT) — `damage(amount, reason)` passes
  `reason` to `armor.reduce(amount, false, reason)`.
- `src/engine/Game.ts` (EDIT) — builds `createDefaultEnchantmentRegistry()` once
  and injects it into `PlayerInteraction` via the new `enchantmentRegistry` opt.

## Validation evidence (119)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1476/1476 (prior 1439 + 37: EnchantmentApplication,
  ArmorProtection, DurabilityRules, HarvestRules, PlayerInteraction,
  SurvivalSystem)
- production build: PASS (`tsc --noEmit && vite build`, 67 modules)
- E2E: PASS 21/21 (no Game/stack integration touched beyond registry injection)

## Advancement decision

Change 119 is **VERIFIED** at 7/7 task groups (100%). All gates are green:
typecheck, lint, the 1476-unit suite, production build, and the required E2E
suite (21/21). No advancement exception was needed. ArmorProtection is
intentionally NOT wired into the live `Player.armor` (pre-existing 116
composition gap) — armor EPF is correct when constructed with a registry, and
leaving live armor unwired keeps gameplay stable. Advance to 120.

## What 118 implemented

Change 118 adds the enchantment registry: stable enchantment definitions, the
per-item-category applicability rules, the symmetric conflict rules, the
normalized `EnchantmentInstance` model, strict validation of an enchantment
list, and a `version:1` persistence envelope. It is the catalog + rules + model
— not effect application (119), `ItemStack` attachment (119/equipment), or
offer generation at an enchanting table (120).

- `src/inventory/EnchantmentRegistry.ts` (NEW) — `EnchantmentTarget`,
  `EnchantmentDefinition`, `EnchantmentInstance`, `EnchantmentListSnapshot`, the
  `EnchantmentId` enum, and `EnchantmentRegistry` (`get`/`getByResourceId`/
  `getByKey`/`all`/`areIncompatible`/`appliesTo`) with O(1) dense lookups.
  `enchantmentAppliesTo(targets, itemDef)` covers `all`/`tool`/`weapon`/`armor`/
  `pickaxe`/`axe`/`shovel`/`bow`/`fishing_rod`; `validateEnchantmentList`
  (throws `UNKNOWN_ENCHANTMENT`/`LEVEL_OUT_OF_RANGE`/`ENCHANTMENT_CONFLICT`,
  never mutates input); `serializeEnchantments`/`deserializeEnchantments`
  (strict atomic `version:1` envelope); `createDefaultEnchantmentRegistry`
  seeds 11 enchantments with symmetric conflict groups (fortune⇎silk_touch;
  sharpness/smite/bane_of_arthropods; protection/fire/blast/projectile).
- `src/data/Registry.ts` (EDIT) — `RegistryErrorReason` gains
  `UNKNOWN_ENCHANTMENT`/`LEVEL_OUT_OF_RANGE`/`ENCHANTMENT_CONFLICT`/
  `INVALID_SNAPSHOT`/`INVALID_ENTRY`.
- `src/inventory/ItemRegistry.ts` (EDIT) — `ItemTypeDefinition` gains optional
  reserved enchantment target flags `isWeapon`/`isBow`/`isFishingRod`.

## Validation evidence (118)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1439/1439 (prior 1418 + 21 new `EnchantmentRegistry.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (no Game/stack integration touched)

## Advancement decision

Change 118 is **VERIFIED** at 7/7 task groups (100%). All gates are green:
typecheck, lint, the 1439-unit suite, production build, and the required E2E
suite (21/21). No advancement exception was needed. Advance to 119.

## What 117 implemented

Change 117 adds the player experience track: an XP/level model with the canonical
leveling curve, free-floating XP orbs that are attracted to and collected by the
player, and persistence of the accumulated level/XP. It is the model + orb runtime +
persistence — not the XP HUD (205), enchantment XP spending (118/119), or a full
XP-drop catalog (215).

- `src/player/ExperienceSystem.ts` (NEW) — `ExperienceSnapshot { version:1, level, xp }`,
  `computeXpToNext(level)` (`2L+7` / `5L-38` / `9L-158`, continuous at 16 and 31), and
  `ExperienceSystem` with `addXp` (level-only-rises, bad input no-op), `snapshot`,
  `restore` (rejects `version!=1`/non-int `level`/`xp<0`, clamps `xp` into `[0,xpToNext)`),
  and derived `progress`.
- `src/world/XpOrb.ts` (NEW) — `XP_ORB_TYPE_KEY='minecraft:xp_orb'`, the `XpOrb`
  interface, and strict `createXpOrb` (positive-integer `value`, non-negative `id`,
  finite coords/velocity, non-negative `ageTicks`).
- `src/simulation/XpOrbManager.ts` (NEW) — deterministic id minting, `spawnXpOrb`
  (jitter when an rng is supplied, else exact), `tickItemEntities(dt,px,py,pz,experience)`
  (age advance `round(dt*20)`; attraction within `orbAttractionRadius²` capped at the
  current distance — no overshoot; collect within `orbCollectRadius²` →
  `experience.addXp(value)`; despawn at `orbDespawnTicks`), `clear`/`getXpOrbs`, and
  037 `serializeAll`/`deserializeAll` (atomic on one bad record).
- `src/config/index.ts` (EDIT) — frozen `xp` block: attraction/collect radius,
  attraction speed, despawn ticks, spawn up-velocity, default orb value.
- `src/engine/Game.ts` (EDIT) — constructs `ExperienceSystem` + `XpOrbManager`, ticks
  orbs after item-entity collection, adds `experience` to `GameSaveSnapshot`, writes it
  in `savePlayerState`, restores it in `loadPlayerState`, and requires it in
  `isGameSaveSnapshot`.
- `src/player/PlayerInteraction.ts` (EDIT) — optional `xpOrbs?`/`xpOrbValue?`; on a
  productive break, spawns one orb of `xpOrbValue` at the block-center spawn.
- `src/storage/PlayerStateRecord.ts` (EDIT) — adds required `experience: unknown`;
  `validatePlayerStateRecord` rejects a missing `experience`.
- `src/storage/LegacyLocalStorageMigrator.ts` (EDIT) — seeds `experience` in
  `toPlayerStateRecord`.

## Validation evidence (117)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1418/1418 (prior 1391 + 27 new: ExperienceSystem 8, XpOrbManager 12,
  PlayerStateRecord 3, PlayerInteraction +2 productive-break)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (rule/entity change; survival/drop tests stay green)

## Advancement decision

Change 117 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck,
lint, the 1418-unit suite, production build, and the required E2E suite (21/21). No
advancement exception was needed. Advance to 118.

## What 116 implemented

Change 116 integrates worn armor (points + toughness) into the damage calculation
as a reusable, testable rule, and wears armor durability when it absorbs a hit. It
is the calculation plus its data model — not the armor catalog (that is 215) or
enchantment protection (119).

- `src/inventory/ItemRegistry.ts` (EDIT) — `defensePoints?: number` and
  `toughness?: number` on `ItemTypeDefinition` (default `0`).
- `src/player/ArmorProtection.ts` (NEW) — pure functions on worn stacks + a bound class:
  - `computeArmorStats(stacks, registry)` → `{ points, toughness }`, summing
    `defensePoints`/`toughness` (missing def ⇒ 0) and clamping each to `[0, 20]`.
  - `reduceDamage(raw, stats, bypass)` → `{ reduced, absorbed }`; non-positive or
    bypass returns input unchanged; otherwise `armor=min(20,points)`, `cap=armor/25`,
    `tf=min(20,toughness)`, `retained=max(0,1 - sqrt(raw)/(sqrt(raw)+4+tf*2))`,
    `absorbed=raw*cap*retained`, `reduced=raw-absorbed`. ~80% cap at low damage;
    toughness preserves protection at high damage; zero armor ⇒ no reduction.
  - `applyArmorWear(stacks, absorbed, registry)` → `(ItemStack|null)[]`; each durable
    piece loses `max(1, ceil(absorbed/pieceCount))` via `DurabilityRules.applyDamage`;
    non-durable skipped; broken piece ⇒ `null`.
  - `ArmorProtection` class bound to `PlayerEquipment` + `ItemTypeRegistry`:
    `getStats()`, `reduce(raw, bypass)`, `applyWear(absorbed)` (mutates slots, clears
    broken pieces).
- `src/player/SurvivalSystem.ts` (EDIT) — stores the `DamageTypeRegistry`; optional
  `armor?` field; `isBypass(reason)` (unrecognized reason ⇒ non-bypass, fail-safe);
  `damage()` consults `armor` for non-bypass reasons, applies `ceil(reduced)` health
  loss, and calls `armor.applyWear(absorbed)` when `absorbed > 0`.
- `src/data/DamageType.ts` (EDIT) — `fall`, `drowning`, `lava`, `starvation` default
  definitions gain `BYPASS_ARMOR` (environmental damage ignores armor, parity).

## Validation evidence (116)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1391/1391 (prior 1374 + 14 new ArmorProtection + 3 SurvivalSystem integration; DamageType flag assertions updated)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (no new e2e needed — rule-only change; survival/damage tests stay green)

## Advancement decision

Change 116 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint,
the new 1391-unit suite, production build, and the required E2E suite (21/21).
No advancement exception was needed. Advance to 117.

## What 115 implemented

Change 115 adds a general, pure, component-driven durability rule set and makes
`Inventory` delegate its wear/repair to it. It is reusable by later enchantment
(119) and anvil/grindstone/mending (948/949/2202/2203) changes.

- `src/inventory/DurabilityRules.ts` (NEW) — pure functions on an explicit
  `maxDurability` plus the stack's `DAMAGE_COMPONENT`:
  - `getRemainingDurability(maxDurability, stack)` → `max(0,min(max,max-damage))`
    for a tool, `0` for non-tool/empty/missing.
  - `isBroken(maxDurability, stack)` → true for a depleted tool (`remaining<=0`)
    or `count<=0`, false for non-tools.
  - `applyDamage(maxDurability, stack, amount)` → `{ stack, broke }`; accumulates
    `max(1,trunc(amount))` into `DAMAGE_COMPONENT`; on depletion returns
    `{ ...stack, count:0, components:undefined }` with `broke:true` (identical to
    the prior inline zeroing); non-tools/empty returned unchanged.
  - `repair(maxDurability, stack, amount)` → reduces `damage` by
    `max(1,trunc(amount))`, clamped at `0` (pristine, component removed);
    preserves `count`/identity; non-tool/empty/pristine returned unchanged.
- `src/inventory/Inventory.ts` (EDIT) — `damageSelectedItem` now delegates to
  `applyDamage` with identical observable behavior; new `repairSelectedItem`
  looks up `maxDurability` from the registry and delegates to `repair`, returning
  whether the selected tool changed.

## Validation evidence (115)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1374/1374 (prior 1354 + 18 new DurabilityRules + 2 new Inventory repair)
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 21/21 (no new e2e needed — rule-only change; durability drop tests stay green)

## Advancement decision

Change 115 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint,
the new 1374-unit suite, production build, and the required E2E suite (21/21).
No advancement exception was needed. Advance to 116.

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

## What 120 implemented

Change 120 adds the enchanting-table logic surface: registering the enchanting
items/blocks and `enchantability`, the XP-spend primitive, the pure
offer-generation + session core, and the logic-level `use` interaction that opens
a session for the held item. It is the table core + session + payment — not the
DOM `EnchantingPanel` (deferred change) or persisted-schema changes.

- `src/inventory/ItemRegistry.ts` (EDIT) — ids `LapisLazuli=28, Book=29,
  Bookshelf=30, EnchantingTable=31`; optional `enchantability?: number` on
  `ItemTypeDefinition`; seeded on `WoodenPickaxe`(15), `StonePickaxe`(5),
  `WoodenAxe`(15), `Book`(1); `ItemTypeDefinition` entries for the four items
  (bookshelf + enchanting_table carry `placeBlock`).
- `src/world/BlockRegistry.ts` (EDIT) — block ids `EnchantingTable=32,
  Bookshelf=33` placed **beyond** the item-id range `1..31` to avoid colliding
  with the shared legacy numeric id space (a collision with `StonePickaxe=21` /
  `WoodenAxe=22` was caught and fixed). `dropItem` links, no `lootTable`.
- `src/player/ExperienceSystem.ts` (EDIT) — `spendLevels(n)` removes
  `min(n, level)` levels, preserves the in-level progress fraction via
  `computeXpToNext`, and is a no-op on non-integer/negative/`n<=0`/insufficient.
- `src/inventory/EnchantingTable.ts` (NEW) — `slotCost` (bounds 1..255),
  `generateEnchantments` (applicable + level∈[1,max] + pairwise non-conflict +
  valid resource id; `[]` for non-enchantable), `enchantCosts` (xp==lapis==
  clamp 1..30), `createSession` (single `SeedRng` seeded from world seed +
  `'enchanting_table'` stream + item/bookshelf/level; 3 offers),
  `EnchantingTableSession.apply` (atomic; `'empty'` reason when offer
  enchantments are `[]`).
- `src/inventory/Inventory.ts` (EDIT) — `setSelectedStack(stack)` for write-back.
- `src/player/PlayerInteraction.ts` (EDIT) — `InteractionAction` gains `'use'`;
  right-click on `BlockId.EnchantingTable` emits `'use'` instead of placing.
- `src/engine/Game.ts` (EDIT) — `openEnchanting()` builds the session (clamped
  bookshelf count via `countBookshelves` 5×5×2 shell scan, capped 15),
  `getEnchantingSession()`, `applyEnchantingOffer(index)` (writes the enchanted
  stack back to the selected slot, removes the spent lapis).
- Tests: `tests/unit/EnchantingTable.test.ts` (NEW, 14),
  `tests/unit/ItemRegistry.test.ts` (NEW, 4), and extensions in
  `ExperienceSystem.test.ts` (+4), `BlockRegistry.test.ts` (+1),
  `PlayerInteraction.test.ts` (+2), `BlockItemSeparation.test.ts` (id-table
  update). 25 new unit tests total.

## Validation evidence (120)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1501/1501 (prior 1476 + 25: EnchantingTable 14, ItemRegistry 4,
  ExperienceSystem 4, BlockRegistry 1, PlayerInteraction 2)
- production build: PASS (`tsc --noEmit && vite build`, 68 modules)
- E2E: PASS 21/21

## Advancement decision

Change 120 is **VERIFIED** at 5/5 task groups (100%). All gates are green:
typecheck, lint, the 1501-unit suite, production build, and the required E2E
suite (21/21). No advancement exception was needed. The DOM `EnchantingPanel` is
an explicit non-goal of 120 (deferred change) and consumes the
`EnchantingTableSession` produced here; no persisted-schema change was required.
Advance to 121.

## What 121 implemented

Change 121 adds the status-effect runtime: a per-entity `StatusEffectManager` that
owns the set of active effects and reflects them into the existing 012 attribute
model via an effect→attribute hook table. It is the ticking/stacking/hook/serialize
core — not a gameplay consumer (movement/damage/rendering wiring is a downstream
change), and it leaves the 012/014 contracts unchanged.

- `src/data/StatusEffectManager.ts` (NEW) — `EffectAttributeHook` interface and
  `DEFAULT_EFFECT_ATTRIBUTE_HOOKS` (speed→movement_speed ×1.2/amp, slowness→
  movement_speed ×0.85/amp, strength→attack_damage +3/amp, weakness→attack_damage
  −4/amp, health_boost→max_health +4/amp, haste→attack_speed ×1.1/amp,
  mining_fatigue→attack_speed ×0.9/amp). `StatusEffectManager`:
  - strict type resolution (`add` throws on an unregistered id);
  - duration clamped to `maxDuration`, amplifier clamped to `maxAmplifier`
    (non-finite/negative sanitized to 0 before instance construction);
  - one instance per type; stacking rule `amplifier = max(cur, incoming)`, and
    when the incoming amplifier is strictly stronger the duration is replaced,
    otherwise the longer duration is kept;
  - `applyHook`/`removeHook` keyed on the effect-type `ResourceId` (unique modifier
    id; `removeHook` runs before re-apply so 012 `addModifier` never hits a
    duplicate);
  - `tick(dt)` ignores non-finite/negative `dt`, decrements, removes + unhooks
    expired, returns the expired list (INSTANT effects surface here on first tick);
  - `serialize`/`deserialize` (atomic: validate-all-then-clear+re-add);
  - `clear`/`get`/`getAll`/`remove`/`getAttribute`/`attributes`.

## Validation evidence (121)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1522/1522 (prior 1501 + 21 new `StatusEffectManager.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 68 modules)
- E2E: PASS 21/21

## Advancement decision

Change 121 is **VERIFIED** at 6/6 task groups (100%). All gates are green:
typecheck, lint, the 1522-unit suite, production build, and the required E2E
suite (21/21). No advancement exception was needed. Gameplay consumers of the
manager (player movement speed, attack damage, etc.) are an explicit non-goal of
121 (downstream change) and 012/014 are unmodified. Advance to 122.

## What 122 implemented

Change 122 adds the potion item data layer: a serializable `potion_contents` stack
component and pure primitives that turn potion contents into consume/splash payloads.
It is data + payload only — not brewing (123), consume-on-eat (124), or any
throwable-entity wiring; those are downstream. The 119/121 contracts are unchanged.

- `src/data/PotionItemData.ts` (NEW) — `PotionKind` (`NORMAL | SPLASH | LINGERING`),
  `PotionEffectData` (`{ typeId, duration, amplifier }`, `typeId` stored as a
  `minecraft:effect/<key>` string), `PotionContents`, `PotionConsumePayload`,
  `PotionSplashPayload`; `POTION_CONTENTS_COMPONENT` (`minecraft:potion_contents`,
  registered ResourceId); strict `createPotionContents` factory (rejects empty
  effects, unknown kind, non-string/negative/non-finite duration, negative/non-finite
  amplifier, duplicate `typeId`, non-string `base`; floors fractional amplifier;
  defaults `kind` to `NORMAL`); `potionContentsComponentType` (validate-on-write guard
  used by `StackComponentMap`); `getEffectiveEffects`, `buildConsumePayload`,
  `buildSplashPayload` (splash radius `4.0` for SPLASH/LINGERING, `0` for NORMAL).
- `src/inventory/StackDataComponents.ts` (EDIT) — imports and registers
  `potionContentsComponentType` in `createDefaultStackComponentRegistry` (now 3 types).

## Validation evidence (122)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1545/1545 (prior 1522 + 23 new `PotionItemData.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 68 modules)
- E2E: PASS 21/21

## Advancement decision

Change 122 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck,
lint, the 1545-unit suite, production build, and the required E2E suite (21/21). No
advancement exception was needed. Gameplay application of the payloads (drink/splash)
is an explicit non-goal of 122 (downstream changes 123/124 and a throwable-entity
change) and 119/121 are unmodified. Advance to 123.

## What 123 implemented

Change 123 adds the brewing-stand block entity: a deterministic, immutable, per-tick
state machine that brews one bottle from an ingredient using blaze-powder fuel and
persists its progress. It is the engine + recipe context + fuel/timing + persistence —
not block placement, `Game` tick wiring, or a menu UI (downstream). The 109/122
contracts are unchanged.

- `src/inventory/BrewingRecipes.ts` (NEW) — `BrewingContext` (`match`/`fuelBurnTicks`/
  `brewTicks`), `BrewingRecipeOutput` (`{ base?, customEffects? }`), and
  `createDefaultBrewingContext` with the starter recipe table: water+nether_wart→awkward
  (empty effects); awkward+redstone→`speed 1×480`; awkward+glowstone→`speed 1×120, amp 2`;
  awkward+fermented_spider_eye→mundane; awkward+speed/strength/healing reagents; blaze
  powder fuel `1200` ticks; `brewTicks()` `400`. Unknown `(base, ingredient)` pairs return
  `null`. Exports item/base constants.
- `src/world/BrewingStandBlockEntity.ts` (NEW) — `BrewingState` (`bottle`/`fuel`/
  `ingredient` slots + `brewTime`/`brewTimeTotal`/`fuelBurnTime`/`fuelBurnTimeTotal`),
  `validateBrewingState` (rejects out-of-range timers, malformed slots/components),
  `createBrewingState`, pure immutable `tickBrewing(state, ctx, ticks)` (fuel-light gated on
  `canBrew`, active fuel always burns down, brew timer advances to `brewTicks()`, on
  completion applies the recipe into `bottle.components['minecraft:potion_contents']` via
  `createPotionContents` and consumes one ingredient, resetting timers; a recipe that cannot
  form a valid potion is caught defensively and pauses), `serializeBrewingState`/
  `deserializeBrewingState` (lossless, re-validating), `BlockEntityInstance` factory/read/
  update (`BREWING_STAND_TYPE_KEY`), and progress helpers `brewingIsLit`/
  `brewingBrewProgress`/`brewingFuelFraction`.
- `src/inventory/MenuTransaction.ts` (EDIT) — `MenuSlot` gains an optional additive
  `components?: Readonly<Record<string, unknown>>`, carried by the slot parser and validated
  when present. No existing call site changes; 109/122 suites stay green.

## Validation evidence (123)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1568/1568 (prior 1545 + 23 new: BrewingRecipes 9, BrewingStandBlockEntity 14)
- production build: PASS (`tsc --noEmit && vite build`, 69 modules)
- E2E: PASS 21/21 (no Game/stack integration touched beyond MenuSlot)

## Advancement decision

Change 123 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck, lint,
the 1568-unit suite, production build, and the required E2E suite (21/21). No advancement
exception was needed. Block placement / `Game` tick wiring / menu UI are explicit non-goals
of 123 (downstream changes) and 109/122 are unmodified. Advance to 124.

## What 124 implemented

Change 124 adds the food-component runtime: a `FoodComponentRuntime` that derives
hunger restoration, saturation, and status-effect payloads from `ItemTypeDefinition`
data, plus the `Game` wiring that consumes the **selected** hotbar item and applies
its effects through the 121 `StatusEffectManager`. It is the consume runtime — not
beverage/potion drinking (no potion item exists yet; `applyConsumeEffects` is reusable
for it downstream) and not effect persistence (effects are session-transient by design,
documented as out-of-scope).

- `src/inventory/ItemRegistry.ts` (EDIT) — `FoodEffectData` interface and
  `foodHunger?` / `foodSaturation?` / `foodEffects?: readonly FoodEffectData[]` on
  `ItemTypeDefinition` (defaults 0 when absent).
- `src/player/FoodComponentRuntime.ts` (NEW) — `resolveFoodConsume(def)` returns
  `null` for non-food defs and otherwise `{ hunger, saturation, effects }` clamped/defaulted
  from `foodHunger`/`foodSaturation`, filtering malformed `foodEffects` rows;
  `applyConsumeEffects(manager, effects)` parses each `typeId` via `tryParseResourceId`,
  and calls `manager.add` inside try/catch (defensive skip of unregistered typeIds).
- `src/engine/Game.ts` (EDIT) — constructs `StatusEffectManager` from the 121
  defaults; ticks it each frame (`this.playerEffects.tick(dt)`); replaces the hard-coded
  apple bump with `tryEatSelected()` that reads the selected slot, resolves nutrition from
  the `ItemTypeDefinition`, calls `survival.eat`, and on success runs `consumeSelected()`
  + `applyConsumeEffects(this.playerEffects, consume.effects)`; `respawnPlayer()` clears
  effects (`this.playerEffects.clear()`) after `consumeDeath()`.
- `tests/unit/FoodComponentRuntime.test.ts` (NEW, 11) — null for non-food, clamp/default
  nutrition, malformed-effect filtering, effect application + skip of unregistered typeId.
- `tests/e2e/game.spec.ts` (EDIT) — appetite test now places the apple in the selected
  slot (change 124 eats the **selected** item) before pressing the eat key; expects
  hunger 10→14 and apple count 1→0.

## Validation evidence (124)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1579/1579 (prior 1568 + 11 new `FoodComponentRuntime.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 73 modules)
- E2E: PASS 21/21 (updated `shows survival status and food in the hotbar`)

## Advancement decision

Change 124 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck,
lint, the 1579-unit suite, production build, and the required E2E suite (21/21). No
advancement exception was needed. Effect persistence across sessions is an explicit
non-goal (transient by design); potion drinking is deferred until a potion item exists.
Advance to 125.

## What 125 implemented

Change 125 adds crop growth: Wheat with an `age` (0..7) block-property state, deterministic
random-tick growth through the 050 block-behavior dispatch + 048 `RandomTickSelector`, and
age-aware crop drops via the 011 loot path. It is crop growth only — not farmland hydration/
trampling (126) or bonemeal (127), and crop `age` is intentionally session-transient (not
persisted to the localStorage edit snapshot).

- `src/world/BlockRegistry.ts` (EDIT) — `BlockId.Wheat = 34`; `WHEAT_SCHEMA` integer `age` 0..7;
  Wheat def with `propertySchema`/`defaultState {age:0}` and `lootTable: loot/wheat`.
- `src/inventory/ItemRegistry.ts` (EDIT) — `WheatSeeds = 32` (with `placeBlock` → wheat at age 0)
  and `Wheat = 33` items; cross-ref validation passes.
- `src/world/CropGrowth.ts` (NEW) — `MAX_AGE = 7`, `isMature(age)`, `nextCropAge(age)` (clamped).
- `src/simulation/CropBehavior.ts` (NEW) — `CropBlockBehavior` with `onRandomTick` that reads the
  current age from the block state, and when not mature writes `age+1` via `ctx.world.setBlockState`
  (defensive try/catch on malformed/missing capability).
- `src/simulation/WorldBlockAccess.ts` (NEW) — `BlockWorldAccess` adapter over `World`
  (`getBlockId`/`setBlockId`/`getBlockState`/`setBlockState`).
- `src/simulation/BlockBehavior.ts` (EDIT) — optional `getBlockState`/`setBlockState` on the access.
- `src/world/WorldAccess.ts` + `src/world/World.ts` (EDIT) — `setBlockState(x,y,z,blockId,props)`
  /`getBlockState(x,y,z)` resolving via `BlockStateRegistry` (`lookup`/`getDefaultState`), writing the
  `BlockStateId`; `setBlock` clears any stale state override; state overlay survives chunk unload/reload
  and is cleared on `dispose`.
- `src/inventory/LootTable.ts` (EDIT) — `LootContext.properties?` (additive); `buildCurrentLootTables`
  adds a `loot/wheat` table: seeds always, wheat only when `age === '7'`.
- `src/player/PlayerInteraction.ts` (EDIT) — `finishBreak` passes block-state `properties` into the
  loot context so crop drops are age-aware.
- `src/engine/Game.ts` (EDIT) — builds `BlockStateRegistry`, `BlockBehaviorRegistry` (wheat →
  `CropBlockBehavior`), and `RandomTickSelector`; new `simTick`/`tickRandomBlocks` invokes
  `selectEligible` over loaded sections and dispatches `onRandomTick`.
- Tests: `CropGrowth.test.ts` (5), `CropBehavior.test.ts` (5), `CropRandomTick.test.ts` (3),
  `WorldBlockState.test.ts` (5), `WheatLoot.test.ts` (4); updates to `BlockRegistry`/`BlockStateRegistry`/
  `BlockPropertySchema`/`BlockItemSeparation` tests.

## Validation evidence (125)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1601/1601 (prior 1579 + 22 new: CropGrowth 5, CropBehavior 5, CropRandomTick 3,
  WorldBlockState 5, WheatLoot 4)
- production build: PASS (`tsc --noEmit && vite build`, 80 modules)
- E2E: PASS 21/21 (break/place/craft/harvest paths unaffected)

## Advancement decision

Change 125 is **VERIFIED** at 7/7 task groups (100%). All gates are green: typecheck, lint,
the 1601-unit suite, production build, and the required E2E suite (21/21). No advancement
exception was needed. Farmland hydration/trampling (126), bonemeal (127), and persisting crop
`age` across page reload are explicit non-goals (documented). Advance to 126.

## What 126 implemented

Change 126 adds farmland moisture: a Farmland block with a `moisture` (0..7) state, deterministic
hydration detection, moisture dynamics, reversion-to-dirt rules, trampling, and crop-support growth.
It is farmland only — not bonemeal (127), hoe tilling, or a weather/rain system (which 126 treats as
absent); crop `age` persistence remains session-transient.

- `src/world/BlockRegistry.ts` (EDIT) — `BlockId.Farmland = 35`; `FARMLAND_SCHEMA` integer `moisture` 0..7;
  Farmland def (solid/opaque/breakable, Shovel, `dropItem: dirt`, `lootTable: loot/dirt`, default `{moisture:0}`).
- `src/simulation/FarmlandBehavior.ts` (NEW) — pure `isFarmlandHydrated(x,y,z,world)` (water within
  `|dx|<=4`, `|dz|<=4`, `dy in {-1,0}`), `nextMoisture`, `parseMoisture`, `isCropAbove`,
  `hasSolidCoverAbove`, `shouldRevertToDirt`, `trampleFarmland`; `FarmlandBlockBehavior.onRandomTick`
  (moisten when hydrated / dry when not; revert to dirt when dry+uncovered or solid-covered) and
  `onNeighborChanged` (solid-cover reversion).
- `src/simulation/CropBehavior.ts` (EDIT) — extracted/shared `growCropAt` growth step; `onRandomTick`
  delegates to it; hydrated farmland triggers an extra growth tick.
- `src/player/PlayerPhysics.ts` (EDIT) — on a downward (landing) Y collision, calls
  `trampleFarmland(world, x, y, z)` so the player reverts farmland to dirt when landing on it.
- `src/engine/Game.ts` (EDIT) — registers `FarmlandBlockBehavior`; `isRandomTickEligible` now also
  matches farmland for random-tick dispatch.
- Tests: `FarmlandBehavior.test.ts` (24), `FarmlandMoistureState.test.ts` (6); updates to
  `BlockRegistry`/`BlockStateRegistry`/`BlockPropertySchema`/`BlockItemSeparation` tests.

## Validation evidence (126)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1631/1631 (prior 1601 + 30 new: FarmlandBehavior 24, FarmlandMoistureState 6)
- production build: PASS (`tsc --noEmit && vite build`, 81 modules)
- E2E: PASS 21/21 (break/place/craft/harvest/trample paths unaffected)

## Advancement decision

Change 126 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck, lint,
the 1631-unit suite, production build, and the required E2E suite (21/21). No advancement
exception was needed. Bonemeal (127), hoe tilling, and a rain/weather hook are explicit non-goals
(documented). Advance to 127.

## What 140 implemented

Change 140 adds the hostile analog to 139's baseline: target acquisition and chase. It is the
behaviors only — no obstacle-aware pathfinding, no line-of-sight checks, no actual attack/damage, and
no `Game`/mob-spawning wiring.

- `src/simulation/HostileTargetAI.ts` (NEW) — `TargetAcquisitionGoal` (`Target`-flagged; `canUse`
  acquires a target within `detectionRadius` via an injected `findNearestTarget` callback;
  `canContinueToUse` re-queries the callback every call, updating `getTarget()` to the live position
  and dropping the target once it's `null` or beyond `forgetRadius`, which defaults larger than
  `detectionRadius` for acquire/drop hysteresis) and `ChaseGoal` (`Move`-flagged; depends purely on
  `targetSource.getTarget()`; `tick` steers `vx`/`vz` toward the target scaled by `speed` while
  farther than `attackRange`, or zeroes horizontal velocity within range — handing off to a future
  attack goal — never touching `vy`).
- Tests: `tests/unit/HostileTargetAI.test.ts` (NEW, 10) — detection-radius in/out-of-range
  acquisition; live tracking of a moving target; both drop paths (beyond forget radius, callback
  returns `null`); `ChaseGoal` requiring a real acquired target from a wired `TargetAcquisitionGoal`;
  steer vs. stop-in-range (`vy` untouched in both); full determinism across independent instances.

## Validation evidence (140)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1808/1808 (prior 1798 + 10 new `HostileTargetAI.test.ts`). The session's machine hit
  transient heavy CPU load causing unrelated, pre-existing compute-heavy tests (terrain generation,
  cave carving, greedy meshing, coordinate sweeps) to intermittently exceed vitest's default 5000ms
  timeout across two full runs; isolating those files individually passed every time, and a full run
  with `--testTimeout=30000` passed cleanly at 1808/1808 — confirmed environmental, not a regression.
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 140 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1808-unit suite (confirmed clean after ruling out transient environmental timeout contention),
production build, and the required E2E suite (21/21). No advancement exception was needed.
Obstacle-aware pathfinding, line-of-sight, actual attack/damage, and `Game`/mob-spawning wiring are
explicit non-goals (documented, deferred to 141+). Advance to 141.

## What 139 implemented

Change 139 adds the first two concrete 136 `Goal` implementations. It is the behaviors only — no
pathfinding-through-obstacles, no terrain-following target search, and no `Game`/mob-spawning wiring.

- `src/simulation/PassiveWanderAI.ts` (NEW) — `WanderGoal` (`Move`-flagged; `canUse` gates on a
  random per-tick start chance then searches up to 10 attempts for a target column around the
  entity's current position at its current rounded `y` that is not `Water` (134 `classifyNode`) and
  passes `canStandAt`; `tick` steers `vx`/`vz` toward the cached target scaled by `speed`, never
  touching `vy`; `canContinueToUse` is `false` at arrival (within `arrivalRadius`), at
  `maxDurationTicks`, or when the entity is gone; `stop` zeroes horizontal velocity) and `LookGoal`
  (`Look`-flagged filler; `tick` applies a new random yaw at a per-tick `changeChance`, touching
  nothing else). Both consume randomness only through an injected 054 `SeedRng`.
- Tests: `tests/unit/PassiveWanderAI.test.ts` (NEW, 9) — an all-water world never yields a target
  (20 repeated `canUse()` calls); an open area always yields one; a missing entity fails `canUse`;
  steering leaves `vy` untouched; a `radius: 0` target collapses to the entity's own column for a
  clean arrival/stop test; a `maxDurationTicks` timeout; `LookGoal`'s `changeChance: 1`/`0`
  branches (exploiting `nextFloat()`'s `[0, 1)` range for deterministic branch selection); and full
  determinism across two independently-seeded-identically instances.

## Validation evidence (139)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`; fixed an empty-interface lint error by using a type alias for
  `ResolvedWanderOptions`)
- unit: PASS 1798/1798 (prior 1789 + 9 new `PassiveWanderAI.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 139 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1798-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Pathfinding-through-obstacles, terrain-following search, and `Game`/mob-spawning wiring are
explicit non-goals (documented, deferred to 145+). Advance to 140.

## What 138 implemented

Change 138 adds per-category live counting, deterministic in-chunk candidate selection, and a
bounded per-chunk spawn cycle composing 137's `canSpawn` with 129's `EntityManager`. It is the cycle
orchestration only — no per-biome spawn tables, no `Game`/tick-loop wiring, and no despawning.

- `src/simulation/MobSpawnCycle.ts` (NEW) — `SpawnCategoryConfig` (`category`, `typeId`, `cap`,
  `attemptsPerChunk`, optional `height`); `countLiveByCategory` (`ACTIVE` entities via 129
  `EntityManager.getAll()` whose 017 registered type matches the category); `selectSpawnCandidate`
  (048 `hash32`-derived deterministic in-chunk `{x, z}`, always within the chunk's 16-wide
  footprint, verified for negative chunk coordinates too); `runSpawnCycleForChunk` (per config: skip
  entirely if already at `cap`; else up to `attemptsPerChunk` deterministic candidates, each
  validated through `canSpawn` before `manager.spawn` places it at the block center, stopping that
  config's attempts as soon as `cap` is reached mid-cycle).
- Tests: `tests/unit/MobSpawnCycle.test.ts` (NEW, 7) — mixed-category/removed counting; candidate
  determinism + footprint bounds; already-at-cap zero attempts; mid-cycle cap cutoff; a successful
  spawn's exact placement verified against `selectSpawnCandidate`'s own output; an entirely
  ineligible world spawning nothing without error.

## Validation evidence (138)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1789/1789 (prior 1782 + 7 new `MobSpawnCycle.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 138 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1789-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Per-biome spawn tables, `Game`/tick-loop wiring, and despawning are explicit non-goals
(documented, deferred). This completes the mob-spawning arc (137-138); advance to 139, which begins
concrete mob AI (goal implementations on 136's `GoalSelector`).

## What 137 implemented

Change 137 adds spawn-eligibility predicates combining light, biome, block/clearance, distance, and
017 `EntityCategory`. It is the predicate library only — no spawn cycle/caps (138), no mob
instantiation, and no `Game`/`World` wiring.

- `src/simulation/MobSpawnRules.ts` (NEW) — `SpawnWorld` (extends 134's `NavigationWorld` +
  `getSkyLight`/`getBlockLight`); `lightLevelAt` (clamped `max(sky, block)`); constants
  `MONSTER_MAX_LIGHT=7`/`CREATURE_MIN_LIGHT=9`/`MIN_SPAWN_DISTANCE=24`/`MAX_SPAWN_DISTANCE=128`;
  `isValidSpawnDistance` (inclusive range); `isValidSpawnBiome` (water categories require
  `OCEAN`/`RIVER`, land categories require non-water, else `false`); `isValidSpawnLight` (monster/
  ambient `<=7`, creature `>=9`, water-independent, else `false`); `isValidSpawnBlock` (land
  categories delegate to 134's `canStandAt`, water categories require an actual water block, else
  `false`); `canSpawn` (the exact conjunction of all four).
- Tests: `tests/unit/MobSpawnRules.test.ts` (NEW, 14) — light clamping/combination; distance
  boundaries; biome water/land/`OTHER`/`PROJECTILE` partitioning; light thresholds per category;
  block delegation to `canStandAt` plus the water-block requirement; `canSpawn`'s single-failure and
  all-pass conjunction cases.

## Validation evidence (137)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1782/1782 (prior 1768 + 14 new `MobSpawnRules.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 137 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1782-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Spawn cycle/caps, mob instantiation, and `Game`/`World` wiring are explicit non-goals
(documented, deferred to 138+). Advance to 138.

## What 136 implemented

Change 136 adds a generic, prioritized, interruptible AI goal scheduler — the framework a future mob
uses to decide what to do each tick. It is the scheduler only — no concrete goal implementations
(wander/attack/etc., 139/140's scope) and no `Game`/mob wiring.

- `src/simulation/GoalSelector.ts` (NEW) — `GoalFlag` (`Move`/`Look`/`Jump`/`Target`); `Goal`
  interface (`flags`, `canUse()`, optional `canContinueToUse()`/`start()`/`tick()`/`stop()`);
  `GoalSelector`: `addGoal(priority, goal)` (kept sorted by ascending priority, ties by insertion
  order), `removeGoal(goal)` (stops if running, removes from future selection), `tick()` (evaluates
  goals in priority order; a goal is selected only if it wants to run — `canContinueToUse()` when
  already running, else `canUse()` — and none of its flags were already claimed by an
  earlier-evaluated selected goal this tick, so a higher-priority goal interrupts a running
  lower-priority one sharing a flag; every dropped goal's `stop()` runs before any newly selected
  goal's `start()`; every goal still running afterward gets `tick()`), `getRunning()`, `clear()`.
- Tests: `tests/unit/GoalSelector.test.ts` (NEW, 9) — single-goal start; priority interruption
  (verified via call-order `stop` before `start`); disjoint-flag simultaneous running; both
  continuation-stop paths (`canContinueToUse` and its `canUse` fallback); a stopped goal excluded
  from `tick()` the same cycle; `removeGoal`/`clear` membership management.

## Validation evidence (136)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1768/1768 (prior 1759 + 9 new `GoalSelector.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 136 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1768-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Concrete goal implementations and `Game`/mob wiring are explicit non-goals (documented,
deferred to 139/140+). Advance to 137.

## What 135 implemented

Change 135 adds bounded, deterministic, cancellable A* pathfinding over a 6-directional voxel grid,
built on 134's `NavigationGridQuery`, plus a stale-path guard. It is the search primitive only — no
diagonal/step-climb movement, no incremental/multi-tick search, and no mob AI/`Game` wiring.

- `src/simulation/AStarPathfinding.ts` (NEW) — `PathNode`/`PathfindOptions`/`PathResult`;
  `findPath(world, start, goal, options?)` (`null` exactly when `start` isn't standable; otherwise a
  linear-scan open set with a fixed `+x/-x/+z/-z/+y/-y` neighbor order and a strict insertion-sequence
  tiebreak for equal-`f` entries, guaranteeing determinism; a Manhattan-distance heuristic, admissible
  and consistent given every edge costs `>= 1`; bounded by `maxExpansions`; returns the goal path when
  reached, or a best-effort partial path toward the lowest-`h` node discovered when the budget is
  exhausted, the open set empties, or `options.isCancelled()` returns `true`);
  `isPathStale(world, path, fromIndex, height)` (true as soon as one remaining node's `movementCost`
  becomes `Infinity`, reusing the exact oracle `findPath` used).
- Tests: `tests/unit/AStarPathfinding.test.ts` (NEW, 10) — unstandable-start `null`; a simple open
  corridor reaching the goal; a walled-off room yielding a best-effort partial path (contained purely
  by `canStandAt`'s support rule, no ceiling needed); a tiny `maxExpansions` cutting off an
  otherwise-reachable goal; immediate cancellation; determinism across two identical calls; and
  `isPathStale`'s fresh/stale/before-`fromIndex` cases.

## Validation evidence (135)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1759/1759 (prior 1749 + 10 new `AStarPathfinding.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 135 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1759-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Diagonal/step-climb movement, incremental/multi-tick search, and mob AI/`Game` wiring are
explicit non-goals (documented, deferred to 136+). Advance to 136.

## What 134 implemented

Change 134 adds per-cell walkability classification and movement-cost queries for a generic
ground-walker entity profile, combining 056 `VoxelShape` collision with block-id-based hazard/fluid
detection. It is the query primitives only — no pathfinding/search (135's scope), no per-mob
movement profiles, and no `Game`/`World` wiring.

- `src/simulation/NavigationGridQuery.ts` (NEW) — `NavigationWorld` (`getCollisionShape`/
  `getBlockId`); `PathNodeType` (`Blocked`/`Open`/`Water`/`DamageFire`/`Lava`); `classifyNode`
  (non-empty collision shape always wins as `Blocked`, else block id determines
  Lava/Fire/Water/Open); `nodeCost` (`Open=0 < Water=8 < DamageFire=16 < Blocked=Lava=Infinity`,
  vanilla-inspired); `isPassable` (`true` for `Open`/`Water`/`DamageFire`); `canStandAt` (every cell
  in the occupied body height passable, plus solid ground below or the feet cell itself is `Water`);
  `movementCost` (`Infinity` unless `canStandAt`, else the feet cell's `nodeCost`).
- Tests: `tests/unit/NavigationGridQuery.test.ts` (NEW, 13) — classification of stone/lava/fire/
  water/air plus the collision-shape-priority case; the full cost-ordering and `isPassable`-partition
  invariants; `canStandAt`'s five scenarios (clear, obstructed, no-ground, water-floating,
  lava-feet); `movementCost`'s finite vs. `Infinity` outcomes.

## Validation evidence (134)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1749/1749 (prior 1736 + 13 new `NavigationGridQuery.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 134 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1749-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Pathfinding/search, per-mob movement profiles, and `Game`/`World` wiring are explicit
non-goals (documented, deferred to 135+). Advance to 135.

## What 133 implemented

Change 133 adds a generic, standalone dirty-property container mirroring real Minecraft's
`SynchedEntityData`, completing the 129-133 entity-framework foundation arc (core model → physics →
persistence → chunk tracking → data sync). It is the two reusable primitives only — no wire format
and no `EntityInstance`/`Game`/rendering wiring.

- `src/data/EntityDataTracker.ts` (NEW) — `DataAccessor<T>` (`{id, name}`, phantom `T` for type-safe
  call sites); `DataAccessorRegistry` (`define<T>(name)` assigns dense unique ids, throws on a
  duplicate name; `has`/`size`); `DataTrackerEntry`; `EntityDataTracker` (`define(accessor, initial)`
  seeds once per accessor id, throws on redefinition; `get`/`set`/`isDirty` throw for an undefined
  accessor; `set` marks dirty via `Object.is` comparison and always stores the new value, returning
  whether it changed; `getDirty()`/`getAll()` return accessor-id-ordered snapshots for incremental vs.
  full sync; `clearDirty()` flushes without touching values).
- Tests: `tests/unit/EntityDataTracker.test.ts` (NEW, 12) — dense-id assignment + duplicate-name
  rejection; define seeding + duplicate-id rejection; set's dirty-on-change/no-op-on-same-value
  (including `NaN`-equals-`NaN` `Object.is` semantics) /throws-on-undefined; the full
  getDirty/getAll/clearDirty sync contract, including dirty-again-after-clear.

## Validation evidence (133)

- typecheck: PASS (`tsc --noEmit`; required a phantom `__phantom?: T` field on `DataAccessor<T>` so
  the compile-time-only type parameter isn't flagged unused)
- lint: PASS (`eslint .`)
- unit: PASS 1736/1736 (prior 1724 + 12 new `EntityDataTracker.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (two transient `net::ERR_NETWORK_CHANGED` navigation flakes hit unrelated,
  already-existing tests on the first two runs — different test each time, same error signature, no
  change-133 code in the failure path; a third clean run passed 21/21, confirming environmental
  flakiness rather than a regression)

## Advancement decision

Change 133 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1736-unit suite, production build, and the required E2E suite (21/21, confirmed clean after ruling
out transient flakes). No advancement exception was needed. Wire format and
`EntityInstance`/`Game`/rendering wiring are explicit non-goals (documented, deferred to a future
rendering/networking consumer). Advance to 134.

## What 132 implemented

Change 132 adds chunk-scoped activation/deactivation and a ticking-set selector for 129
`EntityInstance`s. It is the eviction/activation/selection primitives only — no `Game` wiring, no
automatic loaded/unloaded chunk-diffing loop, and no hard dependency on either
`ChunkTicketManager` (031) or `RenderSimulationDistance` (032, the mechanism `World` actually uses
for block random-tick gating).

- `src/simulation/EntityManager.ts` (EDIT, additive) — `forgetChunk(cx, cz): number` permanently
  evicts every entity (any lifecycle state, `ACTIVE` or retained `REMOVED`) whose transform's chunk
  equals `(cx, cz)` from the id map and insertion-order list, freeing their ids for reuse — distinct
  from `remove()` (129), which deliberately retains a `REMOVED` record to block id reuse. After
  `forgetChunk`, a `spawn`/`deserializeChunk` with that same explicit id succeeds.
- `src/simulation/EntityChunkTracking.ts` (NEW) — `selectTickingEntities(manager, isChunkTicking)`
  filters `getAll()` to entities whose chunk satisfies a caller-supplied `(cx, cz) => boolean`
  predicate (decoupled from any specific chunk-liveness mechanism); `deactivateChunk(manager, cx, cz)`
  composes `serializeChunk` (131) then `forgetChunk` into the "unload" step, returning the persistent
  records for a caller to save; `activateChunk(manager, cx, cz, records)` is a thin, symmetric alias
  for `deserializeChunk` (131), kept for the activate/deactivate naming pair.
- Tests: `tests/unit/EntityManager.test.ts` (+3 `forgetChunk` cases) and
  `tests/unit/EntityChunkTracking.test.ts` (NEW, 8) — predicate filtering/purity/propagation,
  persist-then-forget behavior, `activateChunk`'s exact `deserializeChunk` contract, and a full
  deactivate→activate round trip preserving identity/state.

## Validation evidence (132)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1724/1724 (prior 1713 + 11 new: `EntityManager.forgetChunk` 3, `EntityChunkTracking` 8)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched beyond the extended test file; nothing consumes the new
  methods)

## Advancement decision

Change 132 is **VERIFIED** at 7/7 task groups (100%). All gates are green: typecheck, lint, the
1724-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. `Game` wiring, automatic chunk-diffing, and coupling to `ChunkTicketManager`/
`RenderSimulationDistance` are explicit non-goals (documented, deferred). Advance to 133.

## What 131 implemented

Change 131 bridges live 129 `EntityInstance`s to the already-generic 037/038 persistence store:
`EntityRepository` and `DirtySaveQueue`/`RepositorySaveSink` already handle an `'entities'`
`SaveUnitKind` of `SerializedEntity[]`; nothing could produce or consume that shape from a live
`EntityManager` until now. It is the manager-side bridge only — no `Game`/chunk-lifecycle wiring
(132's scope) and no edits to `EntityRepository`/`DirtySaveQueue`/`RepositorySaveSink`.

- `src/simulation/EntityManager.ts` (EDIT, additive methods) —
  `serializeChunk(cx, cz): SerializedEntity[]` filters `getAll()` to `ACTIVE` entities whose
  registered type has `isPersistent === true` (017) and whose transform's chunk
  (`sectionIndex(x)`/`sectionIndex(z)`, 021) equals `(cx, cz)`, mapping each to
  `{ schemaVersion: ENTITY_RECORD_VERSION, typeKey: resourceIdToString(typeId), x/y/z: floored,
  data: { id, dimension, transform, velocity } }` (floor-for-position mirrors `ItemEntityManager`'s
  existing convention). `deserializeChunk(cx, cz, entities: unknown[]): number` validates the whole
  batch first — 037 envelope, chunk membership, registered `typeKey`, well-formed
  `dimension`/`transform`/`velocity`, no duplicate id (within the batch or against the manager,
  `ACTIVE` or retained `REMOVED`) — before spawning any entity; throws (manager unchanged) on the
  first invalid record.
- Tests: `tests/unit/EntityManager.test.ts` (EXTENDED, +11) — active+persistent+in-chunk filtering
  and exclusion (removed/non-persistent/out-of-chunk); full round-trip identity/state preservation
  into a fresh manager; chunk-membership mismatch rejection; four malformed-payload rejections
  (unregistered typeKey, malformed dimension, non-finite transform/velocity field); two duplicate-id
  rejections (within batch, against a live entity), both confirmed atomic.

## Validation evidence (131)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1713/1713 (prior 1702 + 11 new `EntityManager.test.ts` cases)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched beyond the extended test file; nothing consumes the new
  methods)

## Advancement decision

Change 131 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1713-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. `Game`/chunk-lifecycle wiring and any change to `EntityRepository`/`DirtySaveQueue`/
`RepositorySaveSink` are explicit non-goals (documented, deferred to 132+). Advance to 132.

## What 130 implemented

Change 130 adds gravity + shape-aware collision movement for non-player entities, built on the
057 `CollisionResolver`/056 `VoxelShape` primitive and the 129 `EntityManager`. It is the physics
step + a thin manager wrapper only — no `PlayerPhysics` migration, no per-type bounding box on the
017 `EntityRegistry`, no sub-stepping, no fluid physics, and no `Game` tick-loop wiring.

- `src/simulation/EntityPhysics.ts` (NEW) — `EntityPhysicsBox` (`width/height/depth`),
  `EntityPhysicsOptions` (`gravity?`, `terminalVelocity?`), `DEFAULT_GRAVITY=26.0`,
  `DEFAULT_TERMINAL_VELOCITY=54.0` (duplicated from `CONFIG.player`'s values, not imported, to keep
  non-player physics decoupled from the player config namespace); `computeEntityPhysicsStep` (pure:
  applies gravity to `vy` with a terminal-velocity clamp, converts the entity's center/feet
  `EntityTransform` to a `CollisionBox`, calls `CollisionResolver.move`, converts back, zeroes any
  collided axis's velocity, and reports `onGround` — true only for a downward Y collision);
  `tickEntityPhysics` (reads one entity via `EntityManager.get`, no-ops on a missing/`REMOVED` id or
  non-positive/non-finite `dt`, else runs the step and writes back via `setTransform`/`setVelocity`).
- Tests: `tests/unit/EntityPhysics.test.ts` (NEW, 8) — free-fall gravity/terminal-velocity clamp,
  purity, floor landing (`onGround`, vy zeroed, swept-path clamp to the face), horizontal wall
  collision (only that axis zeroed), ceiling collision (vy zeroed, not grounded), and
  `tickEntityPhysics`'s no-op/persist contract.

## Validation evidence (130)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1702/1702 (prior 1694 + 8 new `EntityPhysics.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, no consumer yet)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new module)

## Advancement decision

Change 130 is **VERIFIED** at 5/5 task groups (100%). All gates are green: typecheck, lint, the
1702-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. `PlayerPhysics` migration, per-type bounding-box storage, sub-stepping, fluid physics, and
`Game` tick-loop wiring are explicit non-goals (documented, deferred). Advance to 131.

## What 129 implemented

Change 129 adds a general, minimal runtime entity model shared by future entity kinds: transform,
velocity, registered 017 type, lifecycle, and dimension ownership, plus a manager that mints ids and
validates/mutates instances. It is the data/runtime substrate only — no physics/collision (130), no
persistence wiring (131), no chunk-based activation (132), no dirty-property tracker (133), and no
migration of `ItemEntityManager`/`XpOrbManager` onto it.

- `src/world/Entity.ts` (NEW) — `EntityTransform` (`x,y,z,yaw,pitch`), `EntityVelocity`
  (`vx,vy,vz`), `ZERO_VELOCITY`, `EntityLifecycleState` (`'ACTIVE'|'REMOVED'`), `EntityInstance`
  (`id`, `typeId`, `transform`, `velocity`, `dimension`, `state`), and pure validators
  `isValidTransform`/`isValidVelocity` (every field a finite number).
- `src/simulation/EntityManager.ts` (NEW) — bound to one `EntityRegistry`; mirrors the
  `ItemEntityManager` id-minting/insertion-order idiom:
  - `spawn(typeId, dimension, transform, opts?)` — atomic: throws (no mutation) on an unregistered
    type, a non-finite transform/velocity field, or an explicit `opts.id` colliding with any existing
    record (`ACTIVE` or retained `REMOVED`); on success stores defensive copies and returns a new
    `ACTIVE` instance.
  - `get(id)` — resolves regardless of lifecycle state; `undefined` only if never spawned.
  - `getAll()` / `getInDimension(dimension)` — `ACTIVE`-only, insertion order; dimension compared by
    resource-id string value, not reference.
  - `setTransform`/`setVelocity`/`changeDimension` — pure mutators; `false` no-op on an unknown/
    `REMOVED` id or (for the two setters) a non-finite field; `true` + defensive-copy write on
    success.
  - `remove(id)` — idempotent `ACTIVE → REMOVED` transition (never reverses); `size`/`clear()`.
- Tests: `tests/unit/EntityManager.test.ts` (NEW, 20) covering valid spawn, every atomic-rejection
  case, id-collision (active + removed), lifecycle-filtered queries, mutator no-ops/rejections, and
  remove idempotency.

## Validation evidence (129)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1694/1694 (prior 1674 + 20 new `EntityManager.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules — unchanged, since nothing yet
  imports the new modules)
- E2E: PASS 21/21 (no existing file touched; nothing consumes the new modules)

## Advancement decision

Change 129 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck, lint, the
1694-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. Physics/collision integration, persistence, chunk-based activation, the dirty-property
tracker, and migrating `ItemEntityManager`/`XpOrbManager` onto this model are explicit non-goals
(documented, deferred to 130-133+). Advance to 130.

## What 128 implemented

Change 128 adds the Fire block and a deterministic fire simulation: ignition, aging, environmental
extinguish, burning its flammable support at end of life, and bounded seeded spread. It is the fire
block + behavior — not a Flint & Steel tool item, not `ScheduledTickQueue` wiring (not yet integrated
into the `Game` tick loop), and not player/entity damage, light, particles, or sound.

- `src/world/BlockRegistry.ts` (EDIT) — `BlockId.Fire = 36`; `FIRE_SCHEMA` (integer `age` 0..15); a
  fire definition in `createDefaultBlockRegistry` (non-solid, non-opaque, non-breakable, transparent,
  no `dropItem`, `defaultState { age: 0 }`).
- `src/simulation/BlockBehavior.ts` (EDIT) — `BlockBehaviorContext.seed?: number` (additive/optional)
  so behaviors can derive deterministic per-cell randomness from the world seed.
- `src/simulation/FireBehavior.ts` (NEW) — `FIRE_AGE_PROPERTY='age'`, `MAX_FIRE_AGE=15`,
  `SPREAD_PROBABILITY=0.5`, `MAX_SPREAD_PER_TICK=2`; `isFlammable` (Wood/Leaves/Planks only);
  `parseFireAge` (invalid → 0); `canIgnite`/`ignite` (air over flammable support only, never throws);
  `isAdjacentToWater` (6 orthogonal neighbors); `spreadRoll` (pure `hash32`-derived `[0,1)`);
  `spreadFire` (≤ 2 ignitions among 6 fixed neighbors, roll-gated); `FireBlockBehavior.onRandomTick`
  (extinguish unsupported/water-adjacent without burning; else advance age, and at end-of-life
  extinguish AND burn the flammable support to Air; live fire attempts bounded spread). Safe on a
  non-fire cell, a throwing state read, and a state-less access.
- `src/engine/Game.ts` (EDIT) — imports/constructs `FireBlockBehavior`, registers it against the fire
  block key, and passes `seed: this.seed` in the random-tick `BlockBehaviorContext`.
- Tests: `tests/unit/FireBehavior.test.ts` (NEW, 20) plus updates to four pre-existing hard-coded-count
  tests discovered during the gate run: `BlockRegistry.test.ts` (`all()` length 24→25 + fire row),
  `BlockPropertySchema.test.ts` (fire added to the non-empty-schema exclusion list),
  `BlockItemSeparation.test.ts` (row `[36, 'fire', null]`), `BlockStateRegistry.test.ts` (state-count
  formula `-2+8+8` → `-3+8+8+16` + fire enumeration branch).

## Validation evidence (128)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1674/1674 (prior 1654 + 20 new `FireBehavior.test.ts`)
- production build: PASS (`tsc --noEmit && vite build`, 83 modules)
- E2E: PASS 21/21 (fire never spawns in current terrain/worldgen/crafting paths; no interaction with
  existing flows)

## Advancement decision

Change 128 is **VERIFIED** at 8/8 task groups (100%). All gates are green: typecheck, lint, the
1674-unit suite, production build, and the required E2E suite (21/21). No advancement exception was
needed. A Flint & Steel tool item, `ScheduledTickQueue` game-loop wiring, and player/entity
damage/light/particles are explicit non-goals (documented, deferred). Advance to 129.

## What 127 implemented

Change 127 adds the bonemeal (fertilization) interface and the first crop bonemeal behavior. It is the
fertilization plumbing + Wheat bonemeal — not a sapling/tree bonemeal behavior (deferred: no Sapling
block exists in the catalog; `FertilizerRegistry` is the documented extension point for it), and not
redstone/item-stack persistence of bone meal.

- `src/inventory/ItemRegistry.ts` (EDIT) — `ItemId.BoneMeal = 34` with a definition (stack 64, icon tile,
  no `placeBlock`/food/tool/enchantment).
- `src/simulation/Bonemeal.ts` (NEW) — `WHEAT_GROW_STEP = 2`, `bonemealNextAge`, `fertilizeWheat`,
  `FertilizerRegistry`, `createDefaultFertilizerRegistry` (wheat → `fertilizeWheat`), `applyBonemeal`,
  `bonemealTarget`. Wheat growth is deterministic: age advances by `WHEAT_GROW_STEP`, clamped at
  `MAX_AGE` (7); mature/non-fertilizable/air are no-ops returning false.
- `src/player/PlayerInteraction.ts` (EDIT) — bone-meal `'use'` branch (blocks placement, mirrors the
  enchanting-table `'use'` path).
- `src/engine/Game.ts` (EDIT) — `isBonemealSelected`, `useBonemeal`, and `onInteractionAction('use')`
  branching that calls `applyBonemeal` at the targeted block and consumes one bone meal on success.
- Tests: `Bonemeal.test.ts` (21) + `PlayerInteraction.test.ts` (+2 `'use'`-emission tests).

## Validation evidence (127)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1654/1654 (prior 1631 + 23 new: Bonemeal 21, PlayerInteraction 2)
- production build: PASS (`tsc --noEmit && vite build`, 82 modules)
- E2E: PASS 21/21 (use/place/harvest paths unaffected)

## Advancement decision

Change 127 is **VERIFIED** at 6/6 task groups (100%). All gates are green: typecheck, lint,
the 1654-unit suite, production build, and the required E2E suite (21/21). No advancement
exception was needed. Sapling/tree bonemeal is an explicit non-goal (deferred; no Sapling block
exists) and the `FertilizerRegistry` extension point is documented. Advance to 128.

## Next change: 141 (pending artifacts)

`141-melee-combat-cooldown` is named in `CHANGE_SEQUENCE.md` with scope "Java-like attack cooldown,
damage, knockback, invulnerability frames." Per `AGENTS.md`, a change lacking full artifacts is
a hard pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 140
verification. Change 141 is the next change; its artifacts must be authored and
validated before implementation begins.
