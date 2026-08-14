# Proposal: 022-paletted-container

## Problem

Chunk sections (planned 023/024) store thousands of block states compactly. A naive
array of full state objects wastes memory and cannot be serialized deterministically.
Minecraft uses a paletted container: distinct values live in a small runtime palette,
and each slot stores the ordinal of its value in a bit-packed integer array whose
width grows with palette size.

## Goals

- Provide a generic `PalettedContainer<T>` storage primitive.
- De-duplicate values into a runtime palette with stable ordinals.
- Automatically widen the backing bit width as the palette grows (4..16 bits).
- Serialize/deserialize deterministically and round-trip exactly.
- Cover palette growth, de-duplication, large/negative values, and serialization with tests.

## Non-goals

- No chunk/section object (that is 023/024).
- No registry of block states; `T` is opaque to this container.
- No global-palette/registry-size coupling (palette is bounded by capacity ≤ 4096, well under 2^16).

## Preconditions

021 is VERIFIED. Pure TypeScript depending only on `src/math/SectionCoordinate` for `SECTION_VOLUME`.

## Dependencies

- `src/math/SectionCoordinate.ts` (`SECTION_VOLUME = 4096`).

## Proposed change

Add `src/data/PalettedContainer.ts` exporting `PackedIntegerArray` (bit-packed fixed-width
integer array) and `PalettedContainer<T>` (runtime-palette + bit-packed storage with automatic
width growth and deterministic serialization). Gameplay-free and storage-free beyond the primitive.

## Compatibility and migration

No existing code or persisted data changes. Purely additive.

## Risks

- Bit-packing errors at cross-word boundaries corrupt storage. Mitigated by exhaustive round-trip
  tests across capacities, bit widths, and boundary-aligned indices.
- Palette growth not updating bit width loses data. Mitigated by resize tests at each threshold.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact (023 not yet implemented).

## Definition of Done

Paletted container, palette growth, and deterministic serialization are complete; full regression
gate is green.

## Advancement gate

023 starts only after 022 is 100% complete and VERIFIED.
