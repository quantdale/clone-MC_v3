# Proposal: 096-ore-generation

## Problem

094/095 provide configured and placed feature cores, but no ore features exist and there is no
tag mechanism to drive which blocks an ore may replace.

## Goals

- Extend the 094 `ConfiguredFeatureConfig` union with an `ore` type
  (`blockId`, `size`, `discardChanceOnAirExposure`, `targetTags`) — the documented extension
  point, as declared in 094's design.
- A worldgen-local block-id tag registry (003 pattern) driving ore targets: tags are ordered,
  deduplicated, non-empty numeric block-id sets.
- `resolveOreTargetBlockIds` resolves an ore config's tags deterministically (tag order, member
  order, first-occurrence dedupe) and rejects unknown tags.
- Deterministic defaults: default ore tags, default ore configured features (coal/iron) and
  default ore placed features (over 095 modifiers).

## Non-goals

- Executing ore veins / writing blocks into columns (later wiring).
- Deepslate or additional ore types (vocabulary stays extensible).
- Biome-restricted ore placement (biomeFilter chains come with later wiring).

## Preconditions

- Change 095 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 095 baseline (1061 unit / 19 e2e).

## Dependencies

- 094 `ConfiguredFeatureConfig` union (extension point), 095 `PlacedFeature`/modifiers,
  003 registry patterns.

## Proposed change

- `src/worldgen/ConfiguredFeature.ts` (MODIFIED): add `ore` to the config union and its
  validator.
- `src/worldgen/OreFeature.ts` (NEW): `OreBlockTag`, `validateOreBlockTag`, `OreBlockTagRegistry`,
  `resolveOreTargetBlockIds`, `createDefaultOreBlockTags`, `createDefaultOreConfiguredFeatures`,
  `createDefaultOrePlacedFeatures`.
- `tests/unit/ConfiguredFeature.test.ts` (MODIFIED): the unknown-type assertion that used
  `{ type: 'ore' }` moves to a genuinely unknown type (`portal`), since `ore` is now valid.
- `tests/unit/OreFeature.test.ts` (NEW).

## Compatibility and migration

Additive union member; existing configs and 094 defaults unchanged. The 094 test assertion that
used `ore` as an unknown-type stand-in is updated because `ore` became a real type (documented
union extension, per 094 design).

## Risks

- Unknown-tag errors must surface at resolution time, not silently produce empty target sets.
- Tag/feature defaults must stay in sync with `BlockId` vocabulary (stone=3, dirt=2, gravel=11,
  sand=4, coal_ore=14, iron_ore=15) for the later wiring change.

## Rollback strategy

Revert the commit; additive (one updated test assertion).

## Definition of Done

- `ore` configs validate strictly; malformed configs throw descriptive errors.
- The tag registry stores only validated tags with atomic rejection; resolution is deterministic
  and rejects unknown tags.
- Defaults register without error, are deterministic, and their tag references resolve.
- Full gate green; 096 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 096 suite; E2E stays 19/19.
