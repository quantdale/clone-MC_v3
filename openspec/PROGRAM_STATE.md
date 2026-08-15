# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **109-furnace-block-entity — VERIFIED 100%**
- Active implementation change: **109-furnace-block-entity — VERIFIED**
- Next change: **110-furnace-recipes-and-fuels — NOT YET ACTIVE (artifacts pending)**
- 109 task ledger: **5 total tasks, 5 completed**
- 109 completion: **100%**
- 109 mandatory furnace-block-entity requirements: **PASS**
- 109 required-test gate: **PASS — unit 1253/1253, E2E 19/19**
- 109 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `8e6070dd45b747d60ddc5b93d87005e48eb2d500`
- Next exact action: **Advance to 110-furnace-recipes-and-fuels. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (110 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement smelting recipes, fuel values, XP output, and transactional behavior (a default `FurnaceContext` consumed by 109's `tickFurnace`; XP accumulation and output transaction semantics), verify full gate, commit + push, advance program state.**

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
