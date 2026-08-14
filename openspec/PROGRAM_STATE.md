# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **011-loot-table-data-model — VERIFIED 100%**
- Active implementation change: **011-loot-table-data-model — VERIFIED (ready to advance)**
- Next change: **012-attribute-registry — NOT ACTIVE**
- 011 task ledger: **21 total tasks, 21 completed**
- 011 completion: **100%**
- 011 mandatory loot-table requirements: **PASS**
- 011 required-test gate: **PASS — unit 270/270, E2E 19/19**
- 011 advancement allowed: **Yes**
- Session-start head: `7de37f6d70fdc3c5e3cca6e99a1232435628016c`
- Validated head: `816f047b9486d7434aed3bcbfebdbe020430979b`
- Next exact action: **Advance to 012-attribute-registry: read its artifacts, run baseline, implement typed attributes and modifiers with deterministic stacking rules, verify full gate, commit + push, advance program state.**

## What 011 implemented

Change 011 introduced deterministic, immutable loot-table primitives and routed all current block drops through them:

- `src/inventory/LootTable.ts` — `LootTable` / `LootPool` / `LootEntry` / `LootStack` identified by `ResourceId`; `LootCondition` pure predicates over a typed `LootContext`; `evaluate` resolves eligible entries (weighted via the injected `RandomSource`, or directly when a single entry is eligible), samples an inclusive quantity range, and returns `LootStack[]` without mutating inventory/world/context. `LootTableRegistry` validates every table (unique id, resolvable items, finite positive weights/rolls within `MAX_ROLLS`, inclusive quantity ranges within item stack size, and a finite `MAX_TABLE_OUTPUT` bound) before finalizing on the 003 generic registry core (O(1) lookup). `buildCurrentLootTables` produces one table per current breakable block — a single fixed drop of its `dropItem`, plus an apple pool for leaves — reproducing current output exactly.
- `src/world/BlockRegistry.ts` — adds a `lootTable` ResourceId reference to every breakable block (`minecraft:loot/<blockKey>`). `dropItem` is retained because `validateItemBlockCrossReferences` still requires it.
- `src/player/PlayerInteraction.ts` — `finishBreak` resolves the block's `lootTable` from an injected `LootTableRegistry` and inserts each evaluated `LootStack` via `selector.addItem`, removing the direct `dropItem`/Leaves special-case. The injected `RandomSource` defaults to `Math.random` for callers that do not supply one.
- `src/engine/Game.ts` — constructs the `LootTableRegistry` from `buildCurrentLootTables` and injects it plus `Math.random` into `PlayerInteraction`.
- `tests/unit/LootTable.test.ts` — 19 tests covering unique identity/duplicate rejection, fixed output, multiple pools in deterministic order, weighted deterministic choice with a fake random source, inclusive quantity-range endpoints, condition suppression (pool and entry, including fully-ineligible pools), pure/non-mutating evaluation, invalid references/weights/rolls/ranges/output bounds, and full current block-output equivalence (stone/coal_ore/leaves/every breakable block).

## Validation evidence (011)

- typecheck: PASS
- lint: PASS
- unit: PASS 270/270 (prior 251 + 19 new LootTable tests)
- production build: PASS as the Playwright webServer prerequisite
- E2E: PASS 19/19

## Advancement decision

Change 011 is **VERIFIED** at 21/21 (100%). All gates are green: typecheck, lint, full unit suite (270/270), production build, and the required E2E suite (19/19). No advancement exception was needed. The migration is behavior-preserving (every current block drop reproduced exactly; leaves still also drop an apple) and no gameplay wiring beyond `Game.ts`/`PlayerInteraction` changed.

**Change 012 is authorized to begin.** It is fully specified (proposal, design, tasks, specs, verification) and may start once its entry gate confirms this state.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 011 verification. Change 012 is the active change; begin at its task 1 and do not migrate 013+ scope.
