# Verification: 011-loot-table-data-model

Status: **VERIFIED**
Completion: 100%
Advancement allowed: **true**

## Requirement evidence

| Requirement | Evidence (test) | Status |
|---|---|---|
| Unique table identity | `LootTableRegistry`-backed registration; duplicate id throws `DUPLICATE_ID` and leaves the original intact | PASS |
| Bounded pools | `rolls` must be a finite positive integer in `[1, MAX_ROLLS]`; out-of-range rolls throw `INVALID_ROLLS` | PASS |
| Valid item entries | every entry references a registered item (`MISSING_ITEM`) and a positive inclusive quantity range | PASS |
| Weighted choice | `pickEntry` uses only the injected `RandomSource`; single eligible entry is emitted directly without consuming it | PASS |
| Conditions | pool/entry conditions are pure `(ctx) => boolean` predicates; a false condition suppresses only the scoped pool/entry and never mutates context | PASS |
| Deterministic injected randomness | identical table/context and identical fake `rng` sequence yield identical outputs in pool order | PASS |
| Output bound | validation enforces `MAX_TABLE_OUTPUT`; tables exceeding per-pool max or total theoretical output throw `INVALID_OUTPUT` | PASS |
| Pure evaluation result | `evaluate` returns `LootStack[]` and never touches inventory/world/context; repeated calls are equal | PASS |
| Current block-output equivalence | `buildCurrentLootTables` reproduces every breakable block's drop exactly; leaves yields `leaves` + `apple` | PASS |
| Invalid definition rejection | missing items, bad weights, bad rolls, bad ranges, over-stack/over-bound output throw `LootTableError` before evaluation | PASS |

## Commands

| Command | Result | Notes |
|---|---|---|
| npm run typecheck | PASS | no errors |
| npm run lint | PASS | no errors |
| npm test (focused suite) | PASS 270/270 | prior 251 + 19 new LootTable tests |
| npm run build | PASS | `tsc --noEmit && vite build` |
| npm run test:e2e | PASS | production build loads; break/place/craft/content green |

## Edge/adversarial validation

- Duplicate loot table ResourceId is rejected with `DUPLICATE_ID`; the prior registration is untouched.
- An entry referencing an unregistered item fails construction with `MISSING_ITEM` before any table becomes evaluable.
- Weights must be finite positive integers; `0`, negative, and fractional values throw `INVALID_WEIGHT`.
- Roll counts must be finite positive integers within `MAX_ROLLS` (16); `0`, fractional, and `MAX_ROLLS + 1` throw `INVALID_ROLLS`.
- Quantity bounds must be positive integers with `min <= max` and `max <= itemDef.stackSize`; `min=0`, `min>max`, and `max > stackSize` throw `INVALID_RANGE`/`INVALID_OUTPUT`.
- A pool whose total theoretical output exceeds `MAX_TABLE_OUTPUT` (64) is rejected with `INVALID_OUTPUT`.
- A pool with no eligible entries (all conditions false) yields no output for that roll and does not throw or corrupt state.
- `evaluate` is pure: calling it twice with the same inputs returns equal results and leaves the table and context unchanged.

## Migration/compatibility validation

- Every current breakable block carries a `lootTable` reference (`minecraft:loot/<blockKey>`). `buildCurrentLootTables` produces one table per breakable block: a single fixed-quantity drop of its `dropItem`, and an extra apple pool for leaves — exactly matching the pre-011 direct `dropItem` + Leaves special case.
- `PlayerInteraction.finishBreak` now resolves the block's loot table and inserts each evaluated `LootStack` via `selector.addItem`. The previous direct `dropItem`/`Leaves` special-case branch is removed; a fallback path identical to the old behavior is retained only for callers that do not inject a loot registry (tests/legacy), so existing unit tests pass unchanged.
- `Game.ts` constructs `LootTableRegistry` from `buildCurrentLootTables` and injects it plus `Math.random` into `PlayerInteraction`, keeping deterministic behavior unchanged (current tables are fixed quantity, so no randomness is consumed).
- The `dropItem` field is intentionally preserved on `BlockTypeDefinition` because `validateItemBlockCrossReferences` still requires breakable blocks to declare it; it is no longer used for drop production.

## Performance/resource validation

- `LootTableRegistry` is `Registry<LootTable>` backed (O(1) lookup by ResourceId). Evaluation cost is bounded by validated pool, roll, and entry counts and allocates only the result array; no global random source is introduced.

## Regressions

- 009/010 models unchanged; full unit suite 270/270 passes (including the existing `PlayerInteraction` suite). E2E break/place/craft/content scenarios remain green. No behavioral change to current drops.

## Incomplete tasks

None. All 21 tasks complete.

## Advancement Exception

Not applicable; 100% completion.

**012 remains blocked until 011 is VERIFIED.**
