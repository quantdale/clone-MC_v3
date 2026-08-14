# Proposal: 030-chunk-status-model

## Problem

029 added chunk-column heightmap primitives. The storage stack has no explicit notion of a chunk's *generation
lifecycle*: whether a column is empty, has noise/biomes, has blocks placed, is lit, or is fully generated. Status
tends to be conflated with visibility/meshing (a column can be fully generated but not yet meshed, or meshed but
still awaiting light). Without an explicit ordered status model, generation code cannot reason about what work a
column still needs, and "is it done?" is answered ad hoc.

## Goals

- Define an explicit, ordered `ChunkStatus` lifecycle independent of rendering/visibility.
- Provide pure ordering helpers (`ordinal`, `isAtLeast`, `compare`) over that lifecycle.
- Track a per-column status on `ChunkColumn` (runtime-only, monotonic) separate from mesh/dirty/heightmap state.

## Non-goals

- No generation *logic* (terrain noise, carving, feature placement) — those are later worldgen changes. This change
  only names the lifecycle and stores the current stage per column.
- No coupling to meshing or visibility; status is generation progress, not render readiness.
- No persistence of status (it is derived from, and reset by, generation; runtime-only like 028's meshVersion).

## Preconditions

029 is VERIFIED. Depends on 024 (`ChunkColumn`).

## Dependencies

- `src/world/ChunkColumn.ts` (024)
- New `src/world/ChunkStatus.ts`

## Proposed change

- `src/world/ChunkStatus.ts`: an ordered `ChunkStatus` enum (Empty → StructureStarts → StructureReferences →
  Biomes → Noise → Surface → Carvers → LiquidCarvers → Blocks → Fluids → Light → Spawn → Features → Full) with
  `chunkStatusOrdinal`, `isChunkStatusAtLeast`, `compareChunkStatus`, and name maps.
- `ChunkColumn`: a runtime-only `status` field (default `Empty`) with `getStatus()`, `setStatus(s)`, and
  `advanceStatusTo(s)` (monotonic: only moves forward). Serialization is unchanged.

## Compatibility and migration

Additive; no persisted-format or call-site changes. `ChunkColumn` API is additive. Status is not serialized.

## Risks

- Confusing status with visibility. Mitigated by keeping status purely on the generation axis and documenting it as
  independent of mesh/dirty/heightmap.
- A backward `setStatus` snapshot in tests could mask a generation bug. Mitigated by `advanceStatusTo` enforcing
  monotonicity and tests pinning that behavior.

## Rollback strategy

Additive enum + field/methods; reverting removes them with no downstream impact (031 not yet implemented).

## Definition of Done

`ChunkStatus` orders the lifecycle and helpers compare correctly; `ChunkColumn` tracks a monotonic status defaulting
to `Empty`, independent of mesh/heightmap; unit tests cover ordering, `isAtLeast`, monotonic advance, default, and
serialize non-persistence; full regression gate is green.

## Advancement gate

031 starts only after 030 is 100% complete and VERIFIED.
