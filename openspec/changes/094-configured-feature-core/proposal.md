# Proposal: 094-configured-feature-core

## Problem

096 ore and 097 tree generation need data-driven worldgen feature definitions. No configured
feature model or registry exists.

## Goals

- A validated `ConfiguredFeature` model: key + typed config, with the core vocabulary
  (`simpleBlock`, `blockPatch`) and documented configs.
- `ConfiguredFeatureRegistry` (003 pattern): register/get/has/size/clear with duplicate rejection
  and strict validation; deterministic defaults.

## Non-goals

- Placement modifiers/counts/rarity (095-placed-feature-core).
- Ore/tree feature types (096/097 extend the vocabulary).
- Feature execution/placement into columns (later wiring).

## Preconditions

- Change 093 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 093 baseline (1038 unit / 19 e2e).

## Dependencies

- 003 registry patterns; 059-style validation conventions.

## Proposed change

- `src/worldgen/ConfiguredFeature.ts` (NEW): `ConfiguredFeatureConfig` (union),
  `ConfiguredFeature`, `validateConfiguredFeatureConfig`, `validateConfiguredFeature`,
  `ConfiguredFeatureRegistry`, `createDefaultConfiguredFeatures`.
- `tests/unit/ConfiguredFeature.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- The type vocabulary must stay extensible for 096/097; the union + strict validator is the
  single extension point (documented).

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Validation accepts exactly the documented configs (positive integers where required) and
  rejects malformed ones with descriptive errors.
- The registry rejects duplicates and invalid definitions without partial state.
- Defaults register without error and are deterministic.
- Full gate green; 094 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 094 suite; E2E stays 19/19.
