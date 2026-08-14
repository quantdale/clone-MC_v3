# Proposal: 048-random-tick-system

## Problem

047 schedules explicit per-position ticks, but Minecraft-style random ticks (crop growth, fire, etc.)
are *probabilistic* per sub-chunk: a fixed number of random cells in each ticking sub-chunk receive a
tick each game tick. Nothing selects those cells deterministically, so random-tick behavior cannot be
reproducible across runs.

## Goals

- Provide a `RandomTickSelector` that deterministically selects cells for random ticking per
  sub-chunk per game tick.
- Seeded: the selection is a pure function of `(seed, section coords, tick, attempt)` so identical
  worlds replay identically.
- Minecraft-like: `randomTicksPerSubChunk` (default 3) positions per sub-chunk per tick, sampled with
  replacement (as Java does), mapped to world coordinates.
- Eligibility filtering: `selectEligible` returns only cells whose block passes a caller-provided
  predicate, with bounded attempts so a full sub-chunk of ineligible blocks cannot hang the loop.

## Non-goals

- The per-block random-tick *effects* (crop growth, fire spread — later changes 125/128 consume this).
- Wiring into the world/chunk ticking loop (a later consumer change; 048 is the selection primitive).
- Random streams for other systems (054 is the general seeded-RNG change).

## Preconditions

- Change 047 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 047 baseline (619 unit / 19 e2e).

## Dependencies

- 021 `SectionCoordinate.localFromIndex` for local-index → world-coordinate mapping.

## Proposed change

- `src/simulation/RandomTickSelector.ts` (NEW): `RANDOM_TICKS_PER_SUB_CHUNK = 3`, `hash32` (FNV-1a
  style), `RandomTickSelector` (`selectForSection(sectionX, sectionY, sectionZ, tick, seed,
  count?)` → local indices; `selectEligible(...)` → world positions passing the predicate).
- `tests/unit/RandomTickSelector.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet, no behavior changes.

## Risks

- Sampling with replacement can select the same cell twice in one tick (matches Java semantics;
  documented). Eligibility filtering may therefore return fewer than `count` positions — also matches
  Minecraft's behavior of skipping ineligible blocks.
- The hash must be stable across runs/platforms; FNV-1a over integer inputs is deterministic by
  construction.

## Rollback strategy

Revert the commit; the selector is additive.

## Definition of Done

- `selectForSection` returns exactly `count` local indices in `[0, 4096)`, deterministic for identical
  inputs.
- Different seed/tick/section inputs produce (with high probability) different selections; identical
  inputs always produce identical selections (verified by exact equality).
- `selectEligible` returns only positions passing the predicate, with bounded attempts.
- Unit tests cover determinism, bounds, per-tick/per-seed variation, eligibility filtering, and
  attempt bounding.
- Full gate green; 048 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 048 suite; E2E stays 19/19.
