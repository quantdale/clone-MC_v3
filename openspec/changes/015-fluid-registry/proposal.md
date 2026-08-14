# Proposal: 015-fluid-registry

## Problem

Water and lava currently exist only as blocks (`minecraft:block/water`,
`minecraft:block/lava`) with their fluid nature implied by player physics and rendering
special-cases. There is no first-class notion of a *fluid* distinct from a block, so future
flow simulation, fluid-aware placement, and fluid/block separation have no shared type.

## Goals

- Define a ResourceId-identified `FluidType` data model with category and flags.
- Provide a `FluidRegistry` built on the 003 generic `Registry` core.
- Provide `createDefaultFluidRegistry()` with water (source/flowing) and lava
  (source/flowing) fluid types.
- Validate finite, bounded fluid parameters and known flags/categories.

## Non-goals

- No world/chunk storage migration (blocks remain the current representation).
- No flow simulation, no replacing `water`/`lava` blocks with fluid references in terrain.
- No player physics or rendering changes.

## Preconditions

014 is VERIFIED. The 003 `Registry` and 002 `ResourceId` foundations are available.

## Dependencies

- `src/data/Registry.ts` (003)
- `src/data/ResourceId.ts` (002)

## Proposed change

Add `src/data/Fluid.ts` with `FluidCategory`, `FluidFlag`, `FluidTypeDefinition`,
`FluidRegistry`, and `createDefaultFluidRegistry()`. Gameplay-free: no consumer is
migrated; the current `water`/`lava` blocks remain.

## Compatibility and migration

No existing code or persisted data changes. Purely additive data.

## Risks

- Over-scoping into world/fluid-structure migration. Mitigated by the explicit non-goal
  of not changing block storage.

## Rollback strategy

Additive data module; reverting the commit removes it with no downstream impact.

## Definition of Done

Fluid-type registry, defaults, validation, and tests are complete; full regression gate is
green.

## Advancement gate

016 starts only after 015 is 100% complete and VERIFIED.
