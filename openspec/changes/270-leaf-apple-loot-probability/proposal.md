# Proposal: 270-leaf-apple-loot-probability

## Problem

Certification debt **R-2** is open: leaves always drop an apple with no
probability roll (finding RND-5, `MEDIUM parity`). The acceptance rationale
was "likely deliberate early-game food economy … without product sign-off",
with revisit trigger "product decision on food economy". The standing owner
order of 2026-09-12 IS that product decision: leaves MUST NOT always drop
an apple.

The guarantee lives in two places, so a leaf break currently yields an
apple deterministically (twice when the loot-table path is composed):

- `buildCurrentLootTables` (`src/inventory/LootTable.ts:321-325`) adds an
  unconditional apple pool to the leaves table;
- `PlayerInteraction.finishBreak` (`src/player/PlayerInteraction.ts:488-490`)
  pushes an unconditional apple for `BlockId.Leaves` on top of the evaluated
  table.

## Goals

- Leaves MUST NOT always drop an apple.
- Route the apple through the existing loot-table path
  (`src/inventory/LootTable.ts`) with the deterministic injected-RNG hook
  already used by loot — no raw `Math.random` in pure loot evaluation.
- Target roughly vanilla-like rarity: about **1/200 (0.5%)** chance of
  1 apple per leaf break.
- Keep shears/silk-touch leaf drops (where already special-cased) as
  block-drop semantics without forcing an apple; keep sapling/stick behavior
  as currently specified (no such drops exist today; none are added).
- Update unit tests/fixtures that assumed the guaranteed apple; add
  fixed-rng proof tests (both outcomes + statistical shape).
- Close R-2; add `PARITY_MATRIX.md` C270 row.

## Non-goals

- No unrelated economy redesign (no new foods, no hunger retune, no
  sapling/stick system, no fortune-on-leaves redesign beyond what exists).
- No 258 headed work: no FPS measurement, no GPU evidence, 258 stays BLOCKED.
- Reopening 259–269 is forbidden unless a leaf-loot regression blocks the
  270 loot path.
- No loot-table architecture expansion (no new entry kinds, no
  condition-signature change, no network/save format change).

## Preconditions

- 258 stays **BLOCKED** at 40/100 (headed hardware-WebGL certification
  deferred by owner decision 2026-09-11).
- 259–269 stand **VERIFIED**; 270 is the sole ACTIVE implementation change
  (CHANGE_SEQUENCE_OVERRIDES.md authorization 2026-09-12).
- Session start `f9007bc6f8458eb2d1d09d2188280922c69384bc` (fetched; local
  HEAD equals `origin/main`).

## Dependencies

- `src/inventory/LootTable.ts` (011 primitives: `evaluate` with injected
  `RandomSource`, `LootTableRegistry` validation, `buildCurrentLootTables`).
- `src/player/PlayerInteraction.ts` (`finishBreak` loot routing with
  injected `lootTables` + `rng`, silk-touch replacement, fortune bonus).
- `tests/unit/LootTable.test.ts` (equivalence suite assuming guaranteed
  apple — must be updated, not deleted).
- `tests/unit/ItemEntityManager.test.ts` (leaves+apple routing comment).

## Proposed change

1. Add an optional per-pool `chance` (0 < chance ≤ 1, default 1) to the
   loot-table model, gated on the injected `RandomSource` inside the pure
   `evaluate()`: one deterministic draw per chance-gated pool, pool skipped
   when the draw misses. Validation rejects non-finite/out-of-range chance
   with a named `LootTableError` reason.
2. Set the leaves apple pool to `chance: LEAF_APPLE_CHANCE` (0.005 = 1/200,
   exported constant); the leaves-block pool stays unconditional.
3. Delete the unconditional apple push in `PlayerInteraction.finishBreak`
   so the loot table is the sole apple authority (this also removes the
   double-apple composition).
4. Silk-touch keeps current semantics automatically (stack replacement with
   the block item runs after loot evaluation); the no-registry fallback
   keeps yielding the block item only. No shears item exists in the
   registries, so no shears branch is added.
5. Tests: update the leaves equivalence tests to fixed-rng both-outcome
   proofs, add chance-validation tests, add a statistical-shape test over a
   deterministic sequence, add leaf-break interaction tests (lucky/unlucky
   rng + silk-touch leaves yields block only), fix the ItemEntityManager
   comment.
6. Close R-2 with evidence pointer; add `PARITY_MATRIX.md` C270 row.

## Compatibility and migration

No stored, network, or public API data changes. `chance` is optional
(default 1 = current behavior for every existing table except leaves).
World saves, loot registries built by older code, and all non-leaf tables
evaluate byte-identically. Drop-rate change is gameplay-intended per the
owner decision, not a migration.

## Risks

- Existing worlds/farms relying on guaranteed apples yield ~200x fewer
  apples. Accepted explicitly by the standing owner order; documented in
  the spec and verification.
- A chance-gated pool consumes one rng draw per evaluation, shifting
  downstream draws in shared sequences. Mitigation: draw order is
  specified (chance roll before the pool's rolls, pool order preserved)
  and pinned by tests; leaves is the only chance-gated production table.
- Over-generalizing the loot model. Mitigation: `chance` is a single
  optional scalar; entry/condition signatures untouched.

## Rollback strategy

Revert the 270 commits; leaves return to guaranteed apple(s) with R-2
reopened. No migration to unwind.

## Definition of Done

- Breaking leaves without silk touch yields the leaves block always and
  1 apple with probability 0.005 driven by the injected rng — never a
  guaranteed apple, never raw `Math.random` inside pure loot evaluation.
- Breaking leaves with silk touch yields the block item only (no apple).
- No unconditional apple code path remains on the leaf-break path.
- Updated + new tests prove both apple outcomes with fixed rng, reject
  invalid chance, and pin draw-consumption order.
- R-2 reads CLOSED by Change 270.
- Full baseline gate green: `validate-state`, `typecheck`, `lint`,
  unit `test`, `build`, `test:e2e` (full suite as regression; no new e2e —
  loot proof is headless-deterministic).

## Advancement gate

Target 100% task completion plus all MUST/SHALL verified and required
tests green. Floor 90% only via an explicit Advancement Exception proving
every incomplete task is non-blocking and implements/verifies no
MUST/SHALL requirement. 258 MUST NOT be marked VERIFIED by this track.
