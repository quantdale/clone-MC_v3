# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **110-furnace-recipes-and-fuels — VERIFIED 100%**
- Active implementation change: **110-furnace-recipes-and-fuels — VERIFIED**
- Next change: **111-item-entity-drops — NOT YET ACTIVE (artifacts pending)**
- 110 task ledger: **6 total tasks, 6 completed**
- 110 completion: **100%**
- 110 mandatory furnace-recipes-and-fuels requirements: **PASS**
- 110 required-test gate: **PASS — unit 1267/1267, E2E 19/19**
- 110 advancement allowed: **Yes**
- Session-start head: `e715b661b40b252baf64d7abe190eee40eb4836f`
- Validated head: `e715b661b40b252baf64d7abe190eee40eb4836f`
- Next exact action: **Advance to 111-item-entity-drops. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (111 artifacts must be authored before implementation), validate, implement world item entity spawning for block/entity drops, verify full gate, commit + push, advance program state.**

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
