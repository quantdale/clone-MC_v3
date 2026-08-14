# Proposal: 100-structure-placement-core

## Problem

099 provides transformable structure templates, but nothing decides where a structure spawns.
101 needs deterministic, seeded, biome- and terrain-aware structure placement.

## Goals

- `StructurePlacementConfig`: key + template key + spacing (region size in chunks) +
  separation (minimum distance in chunks) + salt + allowed biome keys + minimum surface
  height.
- Deterministic `structureStartAtChunk`: per-chunk query returns the structure start when the
  chunk is the start chunk of its region (seeded offsets within `[0, spacing - separation)`),
  the biome at the start matches, and the terrain surface clears the height gate. The start
  carries a deterministic rotation (0/90/180/270).
- `StructurePlacementRegistry` (003 pattern): atomic duplicate/invalid rejection,
  register/get/has/size/clear.

## Non-goals

- Placing template blocks into columns (101 end-to-end / wiring).
- Default structures (101).
- Connector-based chaining (later structure changes).

## Preconditions

- Change 099 is VERIFIED.
- `npm test` / `npm run test:e2e` green at the 099 baseline (1108 unit / 19 e2e).

## Dependencies

- 099 `StructureRotation`/`StructureMirror`, 054 `SeedRng`, `hash3` from `math/PRNG`,
  003 registry patterns.

## Proposed change

- `src/worldgen/StructurePlacement.ts` (NEW): `StructurePlacementConfig`,
  `validateStructurePlacementConfig`, `StructurePlacementContext`, `StructureStart`,
  `structureStartAtChunk`, `StructurePlacementRegistry`.
- `tests/unit/StructurePlacement.test.ts` (NEW).

## Compatibility and migration

Additive; no existing module changes.

## Risks

- Region/offset math must handle negative chunk coordinates (`floor` division); exact vectors
  cover boundary and negative regions.

## Rollback strategy

Revert the commit; additive, no consumers yet.

## Definition of Done

- Validation accepts exactly the documented config shape and rejects malformed ones with
  descriptive errors.
- `structureStartAtChunk` is deterministic: same (config, ctx, chunk, seed) -> same result;
  offsets and rotation drawn in a fixed order from a region-seeded rng; biome and terrain
  gates enforced; separation holds across adjacent regions; negative regions work.
- The registry rejects duplicates and invalid configs atomically.
- Full gate green; 100 tasks 100%.

## Advancement gate

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` must pass.
Unit count grows by the 100 suite; E2E stays 19/19.
