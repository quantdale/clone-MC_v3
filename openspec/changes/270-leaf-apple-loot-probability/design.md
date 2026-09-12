# Design: 270-leaf-apple-loot-probability

## Context/current state

Leaf breaks yield a guaranteed apple through two stacked mechanisms:

1. `buildCurrentLootTables` (`src/inventory/LootTable.ts:305-351`): the
   leaves table has pool 1 (1× leaves block, unconditional) plus pool 2
   (1× apple, unconditional). Header comments at lines 10-13 and 298-303
   document "the deterministic apple drop from leaves" as intended
   behavior preservation.
2. `PlayerInteraction.finishBreak`
   (`src/player/PlayerInteraction.ts:437-491`): after evaluating the block's
   loot table with `this.rng ?? Math.random`, lines 488-490 push a second
   unconditional `{ item: ItemId.Apple, count: 1 }` for `BlockId.Leaves`.

Net effect when the loot registry is composed: leaves → leaves block +
2 apples, every time. Without the registry (fallback path, lines 482-487):
leaves → leaves block + 1 apple.

Downstream modifiers run after the drop list is built and are unaffected
in structure:

- Silk touch (lines 498-506): replaces the whole stack list with the block
  item — already strips every apple. No shears item exists in
  `src/inventory/ItemRegistry.ts` (grep `shear` over `src/` is empty), so
  there is no shears branch to preserve; the requirement reduces to "do
  not add an apple anywhere on the silk path", which holds.
- Fortune (lines 507-513): adds bonus count to `stacks[0]` (the leaves
  block). Untouched.
- Creative clean-break (lines 516-518): clears all stacks. Untouched.
- No sapling or stick item/block exists in the registries as a leaf drop
  (grep `sapling|stick` yields no drop wiring); nothing to preserve beyond
  not inventing new drops.

The loot evaluator (`evaluate`, lines 156-178) is pure over
`(table, ctx, rng, itemRegistry)`: pool conditions are pure over `ctx`
only, weighted entry choice consumes `rng()`, quantity sampling consumes
`rng()`. A single-entry pool consumes **zero** rng draws today
(`pickEntry` early-returns). There is currently no "maybe" primitive —
that is the gap this change fills.

Risk register R-2
(`openspec/hardening/2026-08-23-exhaustive-repository-certification/risk-register.md:8`):
open MEDIUM parity debt, revisit trigger "product decision on food
economy". The 2026-09-12 standing order is that decision.

## Target state

- `LootPool` gains optional `chance?: number` (0 < chance ≤ 1; absent =
  1). `evaluate()` performs exactly one `rng()` draw per chance-gated
  pool before its rolls loop and skips the whole pool when
  `draw >= chance`. Draw order is fully specified: pools in order; per
  pool, the chance draw (if any) first, then per-roll entry choice and
  quantity draws exactly as today.
- `LEAF_APPLE_CHANCE = 0.005` exported from `LootTable.ts`. The leaves
  table keeps pool 1 (leaves block, no chance field) and pool 2 becomes
  `{ rolls: 1, chance: LEAF_APPLE_CHANCE, entries: [1× apple] }`.
- `PlayerInteraction.finishBreak` deletes the unconditional apple push;
  the loot table is the sole apple authority. Fallback path unchanged
  (block item only — no apple).
- Silk-touch leaf break yields exactly the block item (proves no forced
  apple); normal leaf break yields leaves always + apple iff the injected
  rng draw hits the 0.5% gate.
- R-2 reads CLOSED by Change 270; `PARITY_MATRIX.md` gains C270 `exact`.

## Invariants

- I1: Pure loot evaluation never calls `Math.random`; all randomness
  comes from the caller-provided `RandomSource`.
- I2: A pool without `chance` behaves byte-identically to today (zero
  extra draws, same outputs for the same inputs).
- I3: A chance-gated pool consumes exactly one rng draw per `evaluate()`
  call regardless of `rolls`, then proceeds exactly as an ungated pool
  when the draw hits.
- I4: Every leaf break without silk touch yields exactly 1 leaves block
  (harvest-gated as today); apple count is 0 or 1, never more.
- I5: Silk-touch leaf break yields exactly the block item and zero apples
  for every rng sequence.
- I6: `chance` outside (0, 1] (including NaN/±Infinity/non-finite) fails
  table construction with a named error before any table is evaluable.

## API and data model

```typescript
// src/inventory/LootTable.ts
export const LEAF_APPLE_CHANCE = 0.005; // ~1/200, vanilla-like

export interface LootPool {
  readonly rolls: number;
  readonly entries: readonly LootEntry[];
  readonly conditions?: LootCondition[];
  /** Optional probability gate in (0, 1]; absent = 1 (always). */
  readonly chance?: number;
}

export type LootTableErrorReason =
  | 'DUPLICATE_ID' | 'MISSING_ITEM' | 'MISSING_TABLE'
  | 'INVALID_WEIGHT' | 'INVALID_ROLLS' | 'INVALID_RANGE'
  | 'INVALID_OUTPUT' | 'INVALID_CHANCE';
```

`evaluate()` pool loop becomes:

```typescript
for (const pool of table.pools) {
  if (!conditionsPass(pool.conditions, ctx)) continue;
  if (pool.chance !== undefined && !(rng() < pool.chance)) continue;
  for (let roll = 0; roll < pool.rolls; roll++) { /* unchanged */ }
}
```

`LootTableRegistry.validate` checks each pool's `chance` when present:
finite number, 0 < chance ≤ 1, else `INVALID_CHANCE` naming the table id.
`MAX_TABLE_OUTPUT` accounting is unchanged (chance does not alter the
theoretical max).

No changes to `LootEntry`, `LootCondition` (still `(ctx) => boolean`),
`LootContext`, `LootStack`, `RandomSource`, or any consumer signature.
`PlayerInteraction` loses 3 lines (the apple push); nothing else there
changes.

## Control/data flow

Leaf break (normal tool/hand, harvest passes):

1. `finishBreak` builds `ctx` (blockId, toolItemId, itemRegistry,
   properties) and calls `evaluate(leavesTable, ctx, this.rng ??
   Math.random, itemRegistry)`.
2. Pool 1: no conditions, no chance → emits 1× leaves (zero rng draws,
   single-entry fast path).
3. Pool 2: no conditions, `chance: 0.005` → one `rng()` draw; emits 1×
   apple iff draw < 0.005 (single-entry fast path, zero further draws).
4. Silk-touch check: if active, stacks reset to 1× block item. Fortune
   otherwise adds to `stacks[0]`. Clean-break clears. Spawning proceeds.

Total rng consumption of a leaf evaluation: exactly 1 draw (the apple
gate). All other production tables consume exactly what they do today.

## Detailed behavior

- `rng() < chance` uses strict less-than; boundary draw exactly equal to
  `chance` misses. Pinned by tests (`chance: 0.5`, draws 0.499999… hit /
  0.5 miss).
- `chance: 1` is explicitly legal and means always (one wasted draw —
  documented; production tables omit the field instead).
- `chance: 0`, negatives, > 1, NaN, ±Infinity, non-numbers throw
  `INVALID_CHANCE` at registry construction; the registry finalizes
  nothing on failure (existing all-or-nothing construction preserved).
- Header + builder comments updated: "deterministic apple drop" language
  replaced with the probabilistic rule and constant reference.
- Live drop RNG remains `this.rng ?? Math.random` at the interaction
  seam (non-deterministic-by-design per the risk-register classified
  non-defect); determinism proof lives in unit tests with injected
  fixed sequences.

## Failure modes

- Invalid `chance` → construction throws `LootTableError(INVALID_CHANCE)`
  before finalization; no partial registry (same guarantee as other
  validation failures).
- Unknown-table lookup, missing-item entries, bad rolls/weights/ranges:
  unchanged behavior.
- rng returning out-of-[0,1) values (test doubles): chance comparison
  still total (`rng() < chance` is well-defined for any number; NaN
  misses, matching "no apple" safely). No new throw path.
- Unharvestable leaves (tool-gated): no drops at all, as today.

## Compatibility/migration

No save/network/registry-id changes. `chance` is additive-optional; all
existing tables except leaves evaluate identically. The drop-rate change
itself is the owner-authorized product decision, recorded as intended
behavior change, not a migration.

## Performance/resource constraints

One extra function call + float comparison per chance-gated pool per
break; leaves is the only such pool. No allocation, no hot-path impact
(block breaking is input-rate, not frame-rate). No benchmark needed
beyond the existing gate (typecheck/lint/unit/build/e2e).

## Testing seams

- `evaluate(table, ctx, rngSeq, items)` with fixed `seq()` doubles
  (existing pattern in `LootTable.test.ts`).
- `new LootTableRegistry(buildCurrentLootTables(blocks, items), items)`
  for production-table proofs.
- `PlayerInteraction` with injected `lootTables` + `rng` + mutable world
  + `ItemEntityManager` (existing `mineUntilBroken` harness), asserting
  spawned entities for lucky/unlucky/silk cases.

## Observability/debugging

No new logging. Behavior is observable through drop entities and
covered by unit assertions on exact stack lists per fixed rng.

## Affected files/symbols

- `src/inventory/LootTable.ts`: `LootPool.chance`, `LEAF_APPLE_CHANCE`,
  `LootTableErrorReason.INVALID_CHANCE`, `evaluate` gate, `validate`
  check, `buildCurrentLootTables` leaves pool, header comments.
- `src/player/PlayerInteraction.ts`: delete unconditional apple push
  (lines 488-490); `ItemId` import stays (used elsewhere — verify).
- `tests/unit/LootTable.test.ts`: update leaves tests, add
  chance-validation + consumption-order + statistical-shape tests.
- `tests/unit/PlayerInteraction.test.ts` (or new
  `tests/unit/LeafAppleLoot.test.ts`): leaf-break lucky/unlucky +
  silk-touch-no-apple tests. Decision at implementation: extend
  `PlayerInteraction.test.ts` if the harness composes cleanly, else a
  focused new file. (Done: new focused file — see tasks.)
- `tests/unit/ItemEntityManager.test.ts`: comment fix only.
- `openspec/hardening/.../risk-register.md`: R-2 CLOSED.
- `PARITY_MATRIX.md`: C270 row + counts + post-terminal note.
- Change package + `PROGRAM_STATE.*` (control plane, already activated).

## Rejected alternatives

- **Weighted apple-vs-nothing entries**: entries must resolve to real
  items; inventing a null/air item pollutes the item registry and breaks
  the `MAX_TABLE_OUTPUT`/stack-size validation story. Rejected.
- **rng-aware `LootCondition(ctx, rng)`**: changes the condition
  signature for every table and consumer (wheat, mob loot) for a
  single-pool need; wider blast radius than an optional scalar. Rejected.
- **Probability in `PlayerInteraction` instead of loot**: reintroduces a
  second apple authority and bypasses the loot-table path the owner order
  explicitly requires ("via the existing loot-table path"). Rejected.
- **Fortune-boosted apple rate / decaying leaves / shears branch**:
  economy redesign beyond the order ("no unrelated economy redesign";
  no shears/sapling systems exist). Rejected.

## Downstream dependencies

- `MobDropLoot.ts` calls `evaluate` — unaffected (no chance fields on
  mob tables; ungated path byte-identical).
- Wheat/crop tables — untouched.
- E2E suites asserting apple counts from leaf breaks: grep shows none
  (apple e2e usage is eating/hunger and creative grants, not leaf
  farming). Full `test:e2e` runs as regression confirmation.
