# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **009-slot-data-unification — VERIFIED 100%**
- Active implementation change: **009-slot-data-unification — VERIFIED (ready to advance)**
- Next change: **010-recipe-data-model — NOT ACTIVE**
- 009 task ledger: **24 total tasks, 24 completed**
- 009 completion: **100%**
- 009 mandatory slot-data requirements: **PASS**
- 009 required-test gate: **PASS — unit 235/235, E2E 19/19**
- 009 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `57df42ddddbeb9a9096fd19fd4a5344bba21149e`
- Next exact action: **Advance to 010-recipe-data-model: read its artifacts, run baseline, implement registry-backed recipe schema, verify full gate, commit + push, advance program state.**

## What 009 implemented

Change 009 migrated the in-memory inventory model to a unified component-based `ItemStack`:

- `src/inventory/Inventory.ts` — unified `ItemStack { id, count, components? }` for hotbar (9) + storage (≤27); per-stack wear moved from the parallel `durability` array into the 008 `DAMAGE_COMPONENT` map; `getSlotDurability` = `max - damage`; `damageSelectedItem` accumulates damage and breaks (count 0, components cleared) at zero; component-aware merge via `componentsCompatible` (empty-components identity); item-specific max stack via `ItemTypeRegistry.stackSize` (all currently 64, behavior-preserving); atomic malformed-snapshot rejection. Legacy snapshot export shape (`slots`/`counts`/`durability`/`storage`/`selected`) preserved; `durability` derived from accumulated damage and decoded back on `restore`.
- `src/inventory/Hotbar.ts` — reads `stack.id` in `buildSlots` and `render`.
- `src/ui/CraftingPanel.ts` — reads `stack.id` (line 94).
- `tests/unit/Inventory.test.ts` — full rewrite covering unified stacks, component-aware merge, wear, snapshot round-trip, legacy restore, atomic rejection.
- `tests/unit/BlockItemSeparation.test.ts` — updated to restored-snapshot shape.

## Validation evidence (009)

- typecheck: PASS
- lint: PASS
- unit: PASS 235/235 (prior 229 + 6 new Inventory tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 009 is **VERIFIED** at 24/24 (100%). All gates are green: typecheck, lint, full unit suite (235/235), production build, and the required E2E suite (19/19). No advancement exception was needed. The migration preserves behavior (all stack sizes 64, snapshot shape unchanged) and leaves the 008 component framework intact.

**Change 010 is authorized to begin.** It is fully specified (proposal, design, tasks, specs, verification) and may start once its entry gate confirms this state.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 009 verification. Change 010 is the active change; begin at its task 1.1 and do not migrate 011+ scope.
