# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **111-item-entity-drops — VERIFIED 100%**
- Active implementation change: **111-item-entity-drops — VERIFIED**
- Next change: **112-item-pickup-and-despawn — NOT YET ACTIVE (artifacts pending)**
- 111 task ledger: **6 total tasks, 6 completed**
- 111 completion: **100%**
- 111 mandatory item-entity-drops requirements: **PASS**
- 111 required-test gate: **PASS — unit 1290/1290, E2E 20/20**
- 111 advancement allowed: **Yes**
- Session-start head: `e715b661b40b252baf64d7abe190eee40eb4836f`
- Validated head: `6154ef48997de9a3e2aff0421b36811a26312240` (pre-111 baseline; updated to 111 head after push)
- Next exact action: **Advance to 112-item-pickup-and-despawn. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (112 artifacts must be authored before implementation), validate, implement item pickup + despawn/merge, verify full gate, commit + push, advance program state.**

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

## What 109 implemented

Change 109 adds the furnace block-entity core and its registry data.

- `src/world/FurnaceBlockEntity.ts` (NEW) — constants (`FURNACE_BLOCK_ID 20`,
  `FURNACE_ITEM_ID 26`, `FURNACE_TYPE_KEY 'furnace'`, `FURNACE_SLOT_COUNT 3`,
  `FURNACE_MENU_SLOT_COUNT 39`, `FURNACE_PLAYER_SLOT_START 3`, slot indices); `FurnaceState`
  (input/fuel/output slots + `burnTime`/`burnTimeTotal`/`smeltTime`/`smeltTimeTotal`) with
  strict validation and time invariants (`time <= total`, total 0 implies time 0);
  `createFurnaceState` / `validateFurnaceState`; the deterministic immutable tick engine
  `tickFurnace` over an injected `FurnaceContext` (`fuelBurnTicks`/`cookTicks`/`resultOf`;
  110 supplies real values): fuel consumed only while smelting can progress, lit =
  `burnTime > 0`, blocked output pauses everything, input removal resets smelt progress,
  cook completion consumes one input and merges the result; `furnaceIsLit`; lossless
  036-envelope `serializeFurnaceState`/`deserializeFurnaceState`; the 39-slot menu bridge
  `createFurnaceMenu` (input 0, fuel 1, output 2, player 3-38) / `applyFurnaceMenuTransaction`
  / `extractFurnaceSlots` / `extractFurnacePlayerSlots` / `withFurnaceSlots`; the 052 entity
  lifecycle `createFurnaceBlockEntity` (tickable true) / `readFurnaceState` /
  `updateFurnaceState`; `furnaceTickProgress` / `furnaceBurnFraction`.
- `src/world/BlockRegistry.ts` — furnace block id 20 (tile 28, hardness 3.5, pickaxe-
  preferred, drops `minecraft:furnace`, auto `loot/furnace` table).
- `src/inventory/ItemRegistry.ts` — furnace item id 26 (iconTile 28, stackSize 64, places
  the furnace block).
- `src/rendering/TextureAtlas.ts` — original procedural furnace tile (index 28): stone base
  with a dark rimmed mouth and ember glow.
- `tests/unit/FurnaceBlockEntity.test.ts` (NEW) — 24 tests: state validation matrix, envelope
  round-trips and rejects, tick vectors (burn start/fuel consumption, no fuel, non-fuel
  items, blocked-output pause, input-removal reset, cook completion with near-full output
  merge, full fuel run 8 smelts, multi-tick determinism, invalid tick counts, immutability),
  menu bridge and extraction, timer-preserving slot updates, entity lifecycle, manager chunk
  round-trip, registry cross-references. Registry enumeration and separation tests updated
  for the new block.

## Validation evidence (109)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1253/1253 (prior 1229 + 24 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 109 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 109
suites, the full unit suite (1253/1253, stable across repeated runs), production build, and the
required E2E suite (19/19). No advancement exception was needed.

## Next change: 110 (pending artifacts)

`110-furnace-recipes-and-fuels` is named in `CHANGE_SEQUENCE.md` with scope "Smelting recipes,
fuel values, XP output, transactional behavior." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code. It supplies the real `FurnaceContext`
values consumed by 109's tick engine.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 109 verification.
Change 110 is the next change; its artifacts must be authored and validated before implementation
begins.
