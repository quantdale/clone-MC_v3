# Tasks: 101-small-structure-baseline

> VERIFIED. Entry gate confirmed (100 VERIFIED; baseline 1119 unit / 19 e2e green).

- [x] 1. Confirm entry gate (100 VERIFIED; baseline 1119 unit / 19 e2e green).
- [x] 2. Add `src/worldgen/StructureGenerator.ts` (`StructureGenerator` with fail-fast templateKey checks, `maxExtent`, `startAt`, deterministic `blocksForChunk` with window `±ceil(maxExtent/16)`, registration-order placements and overwrite-on-overlap; `createDefaultStructureTemplates` ruined_well 5x3x5 dry cobble ring (24+16+16, hollow center); `createDefaultStructurePlacements` ruined_well spacing 12/separation 4/salt 40101/biomeKeys plains+forest+taiga/minSurfaceHeight 33; `createDefaultStructureGenerator`).
- [x] 3. Wire `src/world/TerrainGenerator.ts` (optional structures param defaulting to the seed's generator; write structure blocks after trees with overwrite semantics); add `tests/unit/StructureGenerator.test.ts` (defaults exactness, fail-fast, startAt, exact world blocks with rotation, neighbor-chunk slicing via a wide template, determinism, overwrite order, TerrainGenerator end-to-end integration).
- [x] 4. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
