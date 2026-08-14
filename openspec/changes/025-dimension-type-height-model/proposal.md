# Proposal: 025-dimension-type-height-model

## Problem

Vertical chunks (024) take `sectionCount` and `minSectionY` from the caller, with no shared notion of a
dimension's vertical extent. Without a dimension height model, storage and generation cannot agree on
how many sections exist or where the bottom is (overworld starts at Y=-64), and skylight behavior is
undefined.

## Goals

- Provide a `DimensionType` height model: `minY`, `height`, `logicalHeight`, `hasSkylight`, and derived
  `minSectionY` / `sectionCount` / `maxSectionY` / `maxY`.
- Validate the vertical extent so downstream storage cannot be misconfigured.
- Provide a `DimensionTypeRegistry` with overworld/nether/end defaults.

## Non-goals

- No world/dimension runtime or loading (174+). No chunk generation (085+).
- No skylight propagation yet (067+); only the metadata flag.

## Preconditions

024 is VERIFIED. Depends on 002 (`ResourceId`) and 003 (`Registry`).

## Dependencies

- `src/data/ResourceId.ts` (002)
- `src/data/Registry.ts` (003)

## Proposed change

Add `src/data/DimensionType.ts` with `DimensionTypeDefinition`, `DimensionType` (validating constructor
+ derived section math), `DimensionTypeRegistry` (on 003 `Registry`), and
`createDefaultDimensionTypeRegistry` (overworld minY -64/height 384, nether 0/128, end 0/256).
Gameplay-free data model.

## Compatibility and migration

No existing code or persisted data changes. Additive data model.

## Risks

- Misderived section counts corrupt storage. Mitigated by explicit derived-field tests and validation
  that rejects non-positive/non-integer heights and out-of-range logicalHeight.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact (026 not yet implemented).

## Definition of Done

Dimension height model, validation, derived section math, and default registry are complete; full
regression gate is green.

## Advancement gate

026 starts only after 025 is 100% complete and VERIFIED.
