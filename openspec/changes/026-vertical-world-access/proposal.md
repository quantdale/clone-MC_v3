# Proposal: 026-vertical-world-access

## Problem

024 `ChunkColumn` and 025 `DimensionType` provide full vertical storage and a per-dimension section
layout, but nothing stitches them into a world that accepts a full `(x, y, z)` coordinate. The legacy
streaming `World.ts` still clamps `y` to `[0, CHUNK_HEIGHT)` (a single 0–63 slab), so negative and
high Y (overworld −64…319) cannot be read or written through a dimension-aware path.

## Goals

- Provide a gameplay-free `VerticalWorldAccess` facade that owns a map of `(chunkX, chunkZ)` →
  `ChunkColumn` and routes full-world `(x, y, z)` reads/writes to the correct column and section.
- Derive `minSectionY` / `sectionCount` from the active `DimensionType` so the accessible range is the
  dimension's actual `[minY, maxY]`, not a fixed 0–63 slab.
- Return air for empty coordinates and silently no-op writes outside the dimension's vertical range or
  for non-integer coordinates (matching existing `World` guard semantics, minus the slab clamp).

## Non-goals

- No streaming/generation/unloading pipeline (that is the existing `World.ts`, refit in a later change).
- No chunk meshing, lighting, or player interactions (028+, 067+).
- No dimension manager / multi-dimension selection (174+); exactly one active `DimensionType`.

## Preconditions

025 is VERIFIED. Depends on 021 (section-coordinate math), 024 (`ChunkColumn`), 025 (`DimensionType`),
and 007/003 (`BlockStateRegistry`, `Registry`).

## Dependencies

- `src/math/SectionCoordinate.ts` (021)
- `src/world/ChunkColumn.ts` (024)
- `src/data/DimensionType.ts` (025)
- `src/world/BlockStateRegistry.ts` (007)

## Proposed change

Add `src/world/VerticalWorldAccess.ts` with a `VerticalWorldAccess` class:

- Constructed from a `DimensionType`, a `BlockStateRegistry`, and an optional `airId` (defaults to
  `registry.getDefaultState(0).id`).
- Holds `Map<string, ChunkColumn>` keyed by `chunkX,chunkZ`; columns are lazily created on first write
  (mirroring 024 `ChunkColumn` lazy section allocation).
- `getBlockState(x, y, z)` and `setBlockState(x, y, z, state)` compute `chunkX = floorDiv(x, 16)`,
  `localX = floorMod(x, 16)`, `chunkZ = floorDiv(z, 16)`, `localZ = floorMod(z, 16)`, keep `worldY = y`,
  and delegate to the column's `getBlockState(localX, y, localZ) / setBlockState(...)`.
- `getBlockState` returns air when no column exists or `!dimension.containsY(y)`; `setBlockState` no-ops
  for non-integer coords or `!dimension.containsY(y)`.
- `hasColumn` / `getColumn` / `ensureColumn` / `removeColumn` / `size` / `columns()` column management.
- `isDirty` / `dirtyColumns()` / `clearDirty()` aggregate dirty state across columns.
- `serialize()` / `static deserialize()` round-trip the column set (reuse 024 `ChunkColumn` I/O).

## Compatibility and migration

Additive module; no call-site or persisted-data changes. The legacy `World.ts` slab path is untouched.

## Risks

- A coordinate routed with the wrong horizontal size would corrupt chunk assignment. Mitigated by using
  the 021 `sectionIndex`/`localCoord` (16-wide) helpers for X and Z, and passing `worldY` straight to
  the column, which already does correct vertical routing.
- Storing a block above the dimension `maxY` would throw in the column. Mitigated by the
  `dimension.containsY` guard before delegating.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact (027 not yet implemented).

## Definition of Done

`VerticalWorldAccess` provides full `[minY, maxY]` access with no 0–63 clamp, air defaults, lazy column
creation, dirty aggregation, and serialization; the full regression gate is green.

## Advancement gate

027 starts only after 026 is 100% complete and VERIFIED.
