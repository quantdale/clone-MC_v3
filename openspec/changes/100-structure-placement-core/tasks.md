# Tasks: 100-structure-placement-core

> VERIFIED. Entry gate confirmed (099 VERIFIED; baseline 1108 unit / 19 e2e green).

- [x] 1. Confirm entry gate (099 VERIFIED; baseline 1108 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/StructurePlacement.ts` (`StructurePlacementConfig` + strict validation, `StructurePlacementContext` biomeKey/surfaceY, `StructureStart`, deterministic `structureStartAtChunk` with region floor-division, seeded offsets in [0, spacing - separation) drawn in fixed order (offsetX, offsetZ, rotation) from SeedRng(hash3(regionX, salt, regionZ, seed)), biome and terrain gates, `StructurePlacementRegistry` with atomic rejection).
- [x] 3. Add `tests/unit/StructurePlacement.test.ts` (validation matrix, determinism, exact offset/rotation vectors, boundary and negative regions, separation across adjacent regions, biome/terrain gates, registry lifecycle/atomicity).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
