# Proposal: 016-biome-registry

## Problem

Biomes currently have no first-class, ResourceId-identified data model. World generation,
coloring, and future climate/weather consumers have no shared type for a biome's category,
temperature, precipitation, or grass/foliage/water colors. Each downstream system must invent
its own ad-hoc constants.

## Goals

- Define a ResourceId-identified `BiomeType` data model with category, temperature,
  precipitation, and grass/foliage/water/fog colors.
- Provide a `BiomeRegistry` built on the 003 generic `Registry` core.
- Provide `createDefaultBiomeRegistry()` with a representative set of vanilla-like biomes.
- Validate finite, bounded biome parameters and known categories/precipitation/colors.

## Non-goals

- No world/chunk storage migration (no terrain generation changes).
- No weather, climate simulation, or rendering changes.
- No migrating existing per-biome color constants to the registry.

## Preconditions

015 is VERIFIED. The 003 `Registry` and 002 `ResourceId` foundations are available.

## Dependencies

- `src/data/Registry.ts` (003)
- `src/data/ResourceId.ts` (002)

## Proposed change

Add `src/data/Biome.ts` with `BiomeCategory`, `BiomePrecipitation`, `BiomeTypeDefinition`,
`BiomeRegistry`, `BiomeError`, and `createDefaultBiomeRegistry()`. Gameplay-free: no consumer
is migrated.

## Compatibility and migration

No existing code or persisted data changes. Purely additive data.

## Risks

- Over-scoping into terrain generation or weather. Mitigated by the explicit non-goal of not
  changing world/storage.

## Rollback strategy

Additive data module; reverting the commit removes it with no downstream impact.

## Definition of Done

Biome-type registry, defaults, validation, and tests are complete; full regression gate is
green.

## Advancement gate

017 starts only after 016 is 100% complete and VERIFIED.
