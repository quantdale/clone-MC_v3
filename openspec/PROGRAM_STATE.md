# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **108-double-chest-composition — VERIFIED 100%**
- Active implementation change: **108-double-chest-composition — VERIFIED**
- Next change: **109-furnace-block-entity — NOT YET ACTIVE (artifacts pending)**
- 108 task ledger: **4 total tasks, 4 completed**
- 108 completion: **100%**
- 108 mandatory double-chest-composition requirements: **PASS**
- 108 required-test gate: **PASS — unit 1229/1229, E2E 19/19**
- 108 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `f1d75084a8c46f6d961386349e676681a138b65b`
- Next exact action: **Advance to 109-furnace-block-entity. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (109 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement furnace inventory, timers, lit state, and persistence (018 furnace type tickable; 052 tick hook; 036 envelope), verify full gate, commit + push, advance program state.**

## What 108 implemented

Change 108 adds deterministic double-chest composition over the 107 model.

- `src/world/DoubleChest.ts` (NEW) — `isHorizontalAdjacent` (same Y, distinct, |dx|+|dz| == 1);
  `chestPairKey` (canonical, argument-order-independent pair identity); `doubleChestOrder`
  (`[primary, secondary]`, primary = lexicographically smaller by x then z); `ChestPosition`;
  `createDoubleChestMenu` (90 slots: primary 0-26, secondary 27-53, player 54-89,
  `playerSlotStart` 54, over the 106 transaction core); `applyDoubleChestMenuTransaction`;
  `extractDoubleChestHalves` / `extractDoubleChestPlayerSlots` (reject foreign menus);
  `unpairDoubleChest` (returns the surviving half's inventory for any argument/assignment
  order; unknown removed positions throw). Each half remains its own 107 27-slot
  `ChestInventory`, matching Minecraft's per-block-entity persistence.
- `tests/unit/DoubleChest.test.ts` (NEW) — 13 tests: adjacency matrix, pair-key/order
  determinism across argument orders, menu construction and validation, a full cross-region
  transaction vector (pickup, merge-limit, quick-move first-fit with remainder, placeOne),
  extraction round-trips, unpairing vectors, immutability/determinism, and a 052 manager
  chunk round-trip of two adjacent chest entities.

## Validation evidence (108)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1229/1229 (prior 1216 + 13 new), stable across consecutive runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 108 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 108
suites, the full unit suite (1229/1229, stable across consecutive runs), production build, and
the required E2E suite (19/19). No advancement exception was needed.

## Next change: 109 (pending artifacts)

`109-furnace-block-entity` is named in `CHANGE_SEQUENCE.md` with scope "Furnace inventory,
timers, lit state, persistence." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code. The 018 registry declares the
`furnace` block-entity type as tickable; the 052 `BlockEntityInstance` tick hook and the 036
envelope are the persistence path.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 108 verification.
Change 109 is the next change; its artifacts must be authored and validated before implementation
begins.
