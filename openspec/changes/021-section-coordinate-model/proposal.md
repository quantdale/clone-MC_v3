# Proposal: 021-section-coordinate-model

## Problem

Vertical-world and chunk-section work requires converting world coordinates to 16×16×16 section
coordinates and in-section local indices. Naive integer math (`coord / 16` and `coord % 16`) breaks
for negative coordinates, producing off-by-one section ids and negative local indices that corrupt
storage and neighbor lookups.

## Goals

- Provide a deterministic `SectionCoordinate` model for 16×16×16 sections.
- Implement correct world↔section and world↔local conversion that handles negative X/Y/Z.
- Provide a stable in-section local index and its inverse.
- Cover the conversion math with exhaustive round-trip and negative-coordinate tests.

## Non-goals

- No chunk/section storage implementation (that is 023/024).
- No rendering or world-access changes.

## Preconditions

020 is VERIFIED. Pure TypeScript; depends only on the coordinate foundations.

## Dependencies

- `src/math` coordinate utilities (existing).

## Proposed change

Add `src/math/SectionCoordinate.ts` with section-size constants, world↔section/local conversion,
local index packing/unpacking, and a small `SectionCoord` value type. Gameplay-free and
storage-free.

## Compatibility and migration

No existing code or persisted data changes. Purely additive math.

## Risks

- Off-by-one in negative conversion. Mitigated by exhaustive round-trip tests across negative,
  zero, and positive coordinates.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact.

## Definition of Done

Section coordinate model, conversions, index packing, and tests are complete; full regression gate
is green.

## Advancement gate

022 starts only after 021 is 100% complete and VERIFIED.
