# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **107-chest-block-entity — VERIFIED 100%**
- Active implementation change: **107-chest-block-entity — VERIFIED**
- Next change: **108-double-chest-composition — NOT YET ACTIVE (artifacts pending)**
- 107 task ledger: **5 total tasks, 5 completed**
- 107 completion: **100%**
- 107 mandatory chest-block-entity requirements: **PASS**
- 107 required-test gate: **PASS — unit 1216/1216, E2E 19/19**
- 107 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `7ea32b9122c49125832a96a6a36d7bc99a3349f7`
- Next exact action: **Advance to 108-double-chest-composition. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (108 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement deterministic adjacent chest pairing/unpairing over the 107 `ChestInventory` model, verify full gate, commit + push, advance program state.**

## What 107 implemented

Change 107 adds the single-chest block-entity core and its registry data.

- `src/world/ChestBlockEntity.ts` (NEW) — constants (`CHEST_BLOCK_ID 19`, `CHEST_ITEM_ID 25`,
  `CHEST_TYPE_KEY 'chest'`, `CHEST_INVENTORY_SIZE 27`, `PLAYER_INVENTORY_SIZE 36`,
  `CHEST_MENU_SLOT_COUNT 63`, `CHEST_PLAYER_SLOT_START 27`, `DEFAULT_SLOT_MAX_STACK 64`);
  `ChestInventory` (exactly 27 validated `MenuSlot`s); `createChestInventory` /
  `validateChestInventory` (strict, throws on malformed shapes/slots); lossless
  `serializeChestInventory` / `deserializeChestInventory` (036 opaque payload, round-trip
  exact); the 106 menu bridge `createChestMenu` (63 slots, `playerSlotStart` 27) /
  `applyChestMenuTransaction` / `extractChestInventory` / `extractPlayerSlots`; the 052
  entity lifecycle `createChestBlockEntity` / `readChestEntity` (rejects wrong type keys and
  malformed payloads) / `updateChestEntityInventory` (immutable); `chestEntityContents` /
  `chestInstanceContents` (ordered non-empty stacks for the 111 drop integration).
- `src/world/BlockRegistry.ts` — chest block id 19 (solid, opaque, breakable, hardness 2.5,
  axe-preferred, drops `minecraft:chest`, auto `loot/chest` table).
- `src/inventory/ItemRegistry.ts` — chest item id 25 (iconTile 27, stackSize 64, places the
  chest block).
- `src/rendering/TextureAtlas.ts` — original procedural chest tile (index 27): plank base,
  dark frame, lid seam band, latch.
- `tests/unit/ChestBlockEntity.test.ts` (NEW) — 24 tests: construction/validation matrix,
  serialization round-trips and rejects, menu transaction vectors across the chest/player
  boundary (pickup/merge/swap/split-half/placeOne/quickMove with remainder), immutability,
  out-of-bounds throws, entity lifecycle, wrong-type and malformed-payload rejects, contents
  extraction, 052 manager chunk round-trip, registry cross-references. The legacy-id
  separation and block-registry enumeration tests were updated for the new block.

## Validation evidence (107)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1216/1216 (prior 1192 + 24 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 107 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 107
suites, the full unit suite (1216/1216, stable across two runs), production build, and the
required E2E suite (19/19). No advancement exception was needed.

## Next change: 108 (pending artifacts)

`108-double-chest-composition` is named in `CHANGE_SEQUENCE.md` with scope "Deterministic
adjacent chest pairing/unpairing." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code. It composes the 107 `ChestInventory`
model.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 107 verification.
Change 108 is the next change; its artifacts must be authored and validated before implementation
begins.
