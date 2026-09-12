# Spec: leaf-apple-loot

## Contract

Leaf-block breaks resolve their apple drop exclusively through the block
loot table evaluated with the caller's injected random source. The leaves
block itself always drops (subject to the existing harvest gate); the apple
drops with probability 0.005 per break and never by any unconditional code
path. Silk-touch leaf breaks yield the block item only. This contract
closes certification debt R-2.

## Definitions

- **Leaf break**: a `finishBreak` completion for `BlockId.Leaves` with
  `canHarvest === true` and clean-break (creative) off.
- **Lucky draw**: an injected-rng value `v` with `v < LEAF_APPLE_CHANCE`.
- **Unlucky draw**: an injected-rng value `v` with `v >= LEAF_APPLE_CHANCE`.
- **Apple gate**: the single `rng()` draw guarding the leaves apple pool.
- **Block-drop semantics**: exactly one stack of the block's own item and
  zero apples.

## Invariants

- Pure loot evaluation calls no global RNG; every random bit comes from
  the injected `RandomSource`.
- Ungated pools consume and emit exactly as before this change.
- A gated pool consumes exactly one rng draw per evaluation.

## Requirements

### Requirement: APPLE-1 — No guaranteed apple

Leaves MUST NOT always drop an apple. No unconditional apple code path
SHALL remain on the leaf-break path.

#### Scenario: APPLE-1.1 — Unlucky leaf break yields no apple

- **GIVEN** the production leaves loot table and a fixed rng of `0.999`
- **WHEN** the table is evaluated for a leaf break
- **THEN** the output is exactly `[{ leaves, 1 }]` with no apple stack.

#### Scenario: APPLE-1.2 — No unconditional push in interaction

- **GIVEN** a leaf break routed through `PlayerInteraction` with injected
  loot tables and an unlucky rng
- **WHEN** the break completes
- **THEN** the spawned entities contain exactly one leaves item and zero
  apples (proving no second authority re-adds the apple).

### Requirement: APPLE-2 — Probabilistic apple at 1/200 via loot path

The leaves table SHALL carry the apple in a pool gated at
`LEAF_APPLE_CHANCE = 0.005`, evaluated with the injected rng. A lucky draw
SHALL yield exactly 1 apple alongside the leaves block.

#### Scenario: APPLE-2.1 — Lucky leaf break yields one apple

- **GIVEN** the production leaves loot table and a fixed rng of `0.0`
- **WHEN** the table is evaluated for a leaf break
- **THEN** the output is exactly `[{ leaves, 1 }, { apple, 1 }]`.

#### Scenario: APPLE-2.2 — Gate probability is 0.005

- **GIVEN** `LEAF_APPLE_CHANCE`
- **WHEN** read by any consumer
- **THEN** it equals `0.005` (about 1/200, vanilla-like).

#### Scenario: APPLE-2.3 — Statistical shape

- **GIVEN** a deterministic rng alternating `0.004` (hit) and `0.006`
  (miss)
- **WHEN** the leaves table is evaluated 2000 times
- **THEN** exactly 1000 evaluations contain an apple and 1000 do not.

### Requirement: APPLE-3 — Deterministicrng hook and draw order

The apple gate SHALL consume exactly one `rng()` draw per evaluation from
the caller-injected source, before the pool's rolls; pool order and
per-roll entry/quantity semantics SHALL be unchanged.

#### Scenario: APPLE-3.1 — One gate draw then roll draws

- **GIVEN** a table with a gated pool (`chance: 0.5`, 1 roll, ranged
  quantity 1..3) and the draw sequence `[0.25, 0.0]`
- **WHEN** evaluated
- **THEN** the gate consumes `0.25` (hit), the quantity consumes `0.0`
  (count 1), and output is exactly one stack of count 1.

#### Scenario: APPLE-3.2 — Miss consumes only the gate draw

- **GIVEN** the same table and the draw sequence `[0.75, 0.0]`
- **WHEN** evaluated
- **THEN** output is empty and a second evaluation with the remaining
  sequence behaves as specified (no hidden extra consumption).

#### Scenario: APPLE-3.3 — Boundary misses

- **GIVEN** a gated pool with `chance: 0.5`
- **WHEN** the gate draw is exactly `0.5`
- **THEN** the pool is skipped (strict `<`).

### Requirement: APPLE-4 — Chance validation

Pool `chance` SHALL be a finite number with 0 < chance ≤ 1. Any other
value (0, negative, > 1, NaN, ±Infinity) SHALL throw `LootTableError`
with reason `INVALID_CHANCE` at registry construction, finalizing nothing.

#### Scenario: APPLE-4.1 — Invalid chance rejected

- **GIVEN** tables with `chance` in `{0, -0.1, 1.5, NaN, Infinity}`
- **WHEN** a `LootTableRegistry` is constructed
- **THEN** each throws `LootTableError` matching `/INVALID_CHANCE/`.

#### Scenario: APPLE-4.2 — chance 1 is legal

- **GIVEN** a pool with `chance: 1` and any gate draw
- **WHEN** evaluated
- **THEN** the pool always proceeds (one draw consumed).

### Requirement: APPLE-5 — Silk-touch and fallback preserve block-drop

Silk-touch leaf breaks SHALL yield block-drop semantics (block item only,
zero apples) for every rng sequence. The no-registry fallback path SHALL
yield the block item only with no apple.

#### Scenario: APPLE-5.1 — Silk-touch leaves with lucky rng

- **GIVEN** a leaf break with an active silk-touch stack, injected loot
  tables, and a lucky rng (`0.0`)
- **WHEN** the break completes
- **THEN** spawned entities are exactly one leaves item with zero apples.

#### Scenario: APPLE-5.2 — Fallback path has no apple

- **GIVEN** a leaf break with no injected loot registry
- **WHEN** the break completes
- **THEN** the drop list holds the leaves block item only (code
  inspection + existing fallback tests; no apple literal on that path).

### Requirement: APPLE-6 — Untangled systems unchanged

Sapling/stick behavior (none exists), wheat/crop tables, mob loot tables,
fortune application to the primary drop, and creative clean-break SHALL
behave exactly as before this change.

#### Scenario: APPLE-6.1 — Non-leaf tables byte-identical

- **GIVEN** every breakable non-leaf block and fixed rng sequences
- **WHEN** evaluated through the rebuilt production tables
- **THEN** outputs equal the pre-change outputs (existing equivalence
  tests, updated only for leaves).

## Error and failure behavior

- Invalid `chance` fails closed at construction (`INVALID_CHANCE`, no
  partial finalization) — APPLE-4.1.
- All pre-existing loot error paths (duplicate id, missing item/table,
  bad weight/rolls/range, output bound) are unchanged.
- NaN rng draws miss the gate safely (no throw) — comparison is total.

## Performance and resource bounds

At most one extra float comparison + one rng call per gated pool per
evaluation; leaves is the only gated production pool. No allocation, no
hot-path (frame/tick) impact. No dedicated benchmark; the standard gate
(typecheck/lint/unit/build/e2e) is the performance guard.

## Compatibility and migration

No save, network, registry-id, or public-signature change. `chance` is
optional (absent = 1 = legacy behavior) for every table except the leaves
apple pool. The rate change itself is the authorized product decision.

## Security and integrity

No new trust boundary. The gate cannot overflow, allocate, or throw on
adversarial rng values. Deterministic replay posture unchanged (live seam
still injects `Math.random` fallback; headless proof uses fixed sources).

## Observability

Drops remain observable as world item entities. No new logging; exact
stack lists per fixed rng are asserted in unit tests.

## Verification mapping

- APPLE-1 → `tests/unit/LootTable.test.ts` (unlucky) +
  `tests/unit/LeafAppleLoot.test.ts` (interaction unlucky).
- APPLE-2 → `tests/unit/LootTable.test.ts` (lucky, constant, shape).
- APPLE-3 → `tests/unit/LootTable.test.ts` (order, miss, boundary).
- APPLE-4 → `tests/unit/LootTable.test.ts` (rejections, chance-1).
- APPLE-5 → `tests/unit/LeafAppleLoot.test.ts` (silk) + code inspection
  (fallback, recorded in verification.md).
- APPLE-6 → `tests/unit/LootTable.test.ts` (non-leaf equivalence loop).
- CERT → risk-register R-2 CLOSED + `PARITY_MATRIX.md` C270 `exact`.
- Gate → `npm run validate-state`, `npm run typecheck`, `npm run lint`,
  `npm test`, `npm run build`, `npm run test:e2e`.
