# Proposal: 066-voxel-light-storage

## Problem

Lighting (067-071) needs per-cell light values (0-15 sky, 0-15 block) stored compactly. The
canonical format is a nibble array (4 bits per cell): 4096 cells → 2048 bytes per light type. No
storage primitive exists.

## Goals

- Provide a compact `NibbleArray` (4-bit cells) with bounds-checked get/set and deterministic
  serialization.
- Provide a `SectionLightStorage` holding sky + block nibble arrays with coordinate accessors
  (`getSkyLight`/`setSkyLight`/`getBlockLight`/`setBlockLight`), `fill`, and serialization.

## Non-goals

- Light *propagation* (067/068) or removal (069) — later changes.
- Per-chunk persistence into the world database (a later wiring concern).

## Preconditions

- Change 065 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 065 baseline (736 unit / 19 e2e).

## Dependencies

- 021 `localIndex`/`SECTION_VOLUME` for coordinate mapping.

## Proposed change

- `src/rendering/LightStorage.ts` (NEW): `NibbleArray`, `SectionLightStorage`.
- `tests/unit/LightStorage.test.ts` (NEW).

## Compatibility and migration

Additive; no consumers yet.

## Risks

- Nibble packing must be stable (low nibble of each byte = even index) for serialization determinism.

## Rollback strategy

Revert the commit; the storage is additive.

## Definition of Done

- `NibbleArray` get/set round-trips all 4096 cells; out-of-range indices and values > 15 throw.
- `SectionLightStorage` exposes per-coordinate sky/block light accessors and `fill`; serialization
  round-trips exactly (byte-identical).
- Unit tests cover nibble boundaries, bounds, fill, and serialization.
- Full gate green; 066 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 066 suite; E2E stays 19/19.
