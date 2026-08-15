# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **106-container-menu-transaction-core — VERIFIED 100%**
- Active implementation change: **106-container-menu-transaction-core — VERIFIED**
- Next change: **107-chest-block-entity — NOT YET ACTIVE (artifacts pending)**
- 106 task ledger: **4 total tasks, 4 completed**
- 106 completion: **100%**
- 106 mandatory container-menu-transaction-core requirements: **PASS**
- 106 required-test gate: **PASS — unit 1192/1192, E2E 19/19**
- 106 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `758745df325fd890b4c7e3948f35dad130701ed8`
- Next exact action: **Advance to 107-chest-block-entity. Read `src/world/BlockRegistry.ts` (BlockId enum; block 13 reserved for crafting table; confirm ids 15-18 assignment) and `src/player/PlayerInteraction.ts` interaction conventions; author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (107 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement single chest inventory persistence and interaction (27-slot inventory, open/close, block placement), verify full gate, commit + push, advance program state.**

## What 106 implemented

Change 106 adds the reusable container-menu slot and transaction core.

- `src/inventory/MenuTransaction.ts` (NEW) — `MenuSlot` (`item`, `count`, `maxStack`
  bounded to [1,64]); `MenuCursor` (`item`, `count` in [0,64], empty allowed); `ContainerMenu`
  (1+ slots, `playerSlotStart` in `(0, len)`, optional cursor); `createContainerMenu` /
  `validateContainerMenu` (strict construction and bounds validation, never throws on valid
  input); `MenuTransaction` union `leftClick` / `rightClick` / `placeOne` / `quickMove`;
  `applyMenuTransaction` (deterministic, immutable: leftClick pick-up / merge / swap;
  rightClick same-item split-half pick-up with `ceil(count/2)` or place-one onto an empty /
  mergeable non-full slot; placeOne drops exactly 1; quickMove first-fit merge-then-empty
  across regions with the remainder left in the source slot); out-of-bounds slot indices
  throw.
- `tests/unit/MenuTransaction.test.ts` (NEW) — 20 tests: construction matrix (maxStack/count/
  playerSlotStart bounds, 1-slot menu), per-transaction vectors for all four transaction
  kinds, split-half rounding, immutability (inputs unchanged after apply), out-of-bounds
  throws, determinism.

## Validation evidence (106)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1192/1192 (prior 1172 + 20 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 106 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 106
suites, the full unit suite (1192/1192, stable across two runs), production build, and the
required E2E suite (19/19). No advancement exception was needed.

## Next change: 107 (pending artifacts)

`107-chest-block-entity` is named in `CHANGE_SEQUENCE.md` with scope "Single chest inventory
persistence and interaction." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code. The 106 `MenuTransaction` core is the
intended interaction layer for the chest screen.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 106 verification.
Change 107 is the next change; its artifacts must be authored and validated before implementation
begins.
