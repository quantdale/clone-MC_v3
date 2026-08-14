# Proposal: 023-chunk-section-storage

## Problem

Vertical world and chunk storage (024+) need a `ChunkSection`: a 16×16×16 block-state holder.
It must store 4096 block states compactly and serialize deterministically, reusing the 022 paletted
container and the 007 block-state runtime ids rather than allocating per-block objects.

## Goals

- Provide a `ChunkSection` that stores block states via a paletted container keyed by `BlockStateId`.
- Default to air; expose get/set by local slot and by in-section local coordinates.
- Provide an empty-section fast path (single-entry palette, no scan) and `isEmpty`/`nonAirCount`.
- Serialize/deserialize deterministically by reusing 022.

## Non-goals

- No chunk column / multiple sections (that is 024).
- No world access, heightmaps, or light (later changes).
- No block-state enumeration changes (007 already canonical).

## Preconditions

022 is VERIFIED. Depends on 021 (`SectionCoordinate.localIndex`) and 007 (`BlockStateRegistry`).

## Dependencies

- `src/math/SectionCoordinate.ts`
- `src/data/PalettedContainer.ts` (022)
- `src/world/BlockStateRegistry.ts` (007) and `src/world/BlockRegistry.ts` (`BlockId.Air`)

## Proposed change

Add `src/world/ChunkSection.ts` wrapping a `PalettedContainer<BlockStateId>` (default = air state id),
with coordinate-aware get/set, `fill`, `isEmpty`, `nonAirCount`, and deterministic
serialize/deserialize. Gameplay-free.

## Compatibility and migration

No existing code or persisted data changes. Additive world-storage primitive.

## Risks

- Wrong `airId` at deserialize time silently corrupts states. Mitigated by requiring the same
  `airId` and round-trip tests.
- Coordinate off-by-one. Mitigated by boundary-coordinate tests (15,15,15).

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact (024 not yet implemented).

## Definition of Done

`ChunkSection` block-state storage, coordinate API, empty fast path, and serialization are complete;
full regression gate is green.

## Advancement gate

024 starts only after 023 is 100% complete and VERIFIED.
