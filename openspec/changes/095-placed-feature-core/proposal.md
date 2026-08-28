# Proposal: 095-placed-feature-core

## Problem

094 provides data-driven configured feature definitions, but nothing decides where or how many
times a feature is placed. 096 ore and 097 tree generation need placement control: counts,
rarity, height ranges, biome and survival filters.

## Goals

- A validated `PlacedFeature` model: key + referenced configured feature key + ordered
  `PlacementModifier` chain.
- Modifier vocabulary: `count`, `rarity`, `heightRange`, `biomeFilter`, `survivalFilter`.
- `placeFeature` applies the chain deterministically and returns placement positions.
- `PlacedFeatureRegistry` (003 pattern): register/get/has/size/clear, atomic rejection, strict
  validation.

## Non-goals

- Executing configured features / writing blocks into columns (later wiring).
- Ore/tree feature types (096/097 extend the 094 config vocabulary).
- World wiring of placed features into the generation pipeline.

## Preconditions

- Change 094 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 094 baseline (1044 unit / 19 e2e).

## Dependencies

- 094 `ConfiguredFeature` (the `featureKey` reference target), 003 registry patterns,
  054 `SeedRng` (production rng draws), 059-style validation conventions.

## Proposed change

- `src/worldgen/PlacedFeature.ts` (NEW): `PlacementModifier` union, `PlacedFeature`,
  `PlacementContext`, `placeFeature`, `validatePlacementModifier`/`validatePlacedFeature`,
  `PlacedFeatureRegistry`.
- `tests/unit/PlacedFeature.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- RNG draw ordering must be pinned: identical contexts must produce identical positions. The
  modifier chain evaluation order is the contract, documented and tested.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Validation accepts exactly the documented modifiers and feature shape and rejects malformed
  ones with descriptive errors.
- `placeFeature` is deterministic given a context; all five modifiers behave per their documented
  semantics; chains apply in data order.
- The registry rejects duplicates and invalid definitions without partial state.
- Full gate green; 095 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 095 suite; E2E stays 19/19.
