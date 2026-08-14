# Proposal: 024-chunk-column-storage

## Problem

Vertical-world storage needs to group the 16×16×16 sections (023) into a vertical column at a fixed
(chunkX, chunkZ). A column must allocate sections lazily (untouched sections are air and cost nothing),
route get/set to the correct section via the 021 coordinate math, and track which sections changed for
dirty saving.

## Goals

- Provide a `ChunkColumn` grouping `sectionCount` `ChunkSection`s by (chunkX, chunkZ).
- Route block get/set from local chunk coords + world Y to the correct section and local Y.
- Allocate air sections lazily so empty columns stay cheap.
- Track dirty sections for incremental persistence.
- Serialize/deserialize deterministically (per-section paletted data).

## Non-goals

- No dimension height model (025); section count is supplied by the caller.
- No heightmaps/light (029/066+); no world-level access (026).

## Preconditions

023 is VERIFIED. Depends on 021 (`sectionIndex`/`localCoord`), 022 (`PalettedContainer`), 023 (`ChunkSection`).

## Dependencies

- `src/math/SectionCoordinate.ts`
- `src/data/PalettedContainer.ts` (022)
- `src/world/ChunkSection.ts` (023), `src/world/BlockStateRegistry.ts` (007)

## Proposed change

Add `src/world/ChunkColumn.ts` holding a sparse map of in-column section index → `ChunkSection`,
with `getBlockState`/`setBlockState` (routing via 021), lazy `getSection`, dirty tracking via a
`Set<number>`, and deterministic serialize/deserialize. Gameplay-free.

## Compatibility and migration

No existing code or persisted data changes. Additive world-storage primitive.

## Risks

- Wrong `minSectionY` offsets sections vertically. Mitigated by cross-section set/get tests.
- Unbounded section count misuse. Mitigated by `RangeError` on out-of-range world Y.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact (025 not yet implemented).

## Definition of Done

`ChunkColumn` grouping, coordinate routing, lazy allocation, dirty tracking, and serialization are
complete; full regression gate is green.

## Advancement gate

025 starts only after 024 is 100% complete and VERIFIED.
