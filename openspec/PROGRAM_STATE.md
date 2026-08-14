# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **100-structure-placement-core — VERIFIED 100%**
- Active implementation change: **100-structure-placement-core — VERIFIED**
- Next change: **101-small-structure-baseline — NOT YET ACTIVE (artifacts pending)**
- 100 task ledger: **4 total tasks, 4 completed**
- 100 completion: **100%**
- 100 mandatory structure-placement-core requirements: **PASS**
- 100 required-test gate: **PASS — unit 1119/1119, E2E 19/19**
- 100 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `a63b599df35bed3a04e63ef8d76991996796905c`
- Next exact action: **Advance to 101-small-structure-baseline. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (101 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement the first simple generated structure end-to-end using the template system (099 template + 100 placement; deterministic writing into chunks), verify full gate, commit + push, advance program state.**

## What 100 implemented

Change 100 adds seeded spacing/separation/biome/terrain-aware structure placement.

- `src/worldgen/StructurePlacement.ts` (NEW) — `StructurePlacementConfig` (key, templateKey,
  spacing positive, separation in `[0, spacing)`, salt non-negative, non-empty biomeKeys,
  integer minSurfaceHeight) with strict validation; `StructurePlacementContext`
  (`biomeKey(x, z)`, `surfaceY(x, z)`); `StructureStart` (configKey, templateKey, start chunk,
  rotation, mirror 'none'); deterministic `structureStartAtChunk`: floor-division regions,
  region rng `SeedRng(hash3(regionX, salt, regionZ, seed))`, fixed draw order (offsetX,
  offsetZ, rotation), biome gate then terrain gate at the start chunk center
  `(chunkX * 16 + 8, chunkZ * 16 + 8)`; `StructurePlacementRegistry` (003 pattern, atomic
  rejection).
- `tests/unit/StructurePlacement.test.ts` (NEW) — 11 tests: validation matrix, determinism,
  exact region vectors ((0,0) -> start (3,0) rot 180; (1,0) -> (8,2) rot 90; (-1,-1) ->
  (-4,-8) rot 270; (2,3) -> (19,28) rot 0), exactly-one-start per region with offsets in
  `[0, spacing - separation)`, negative regions, separation across adjacent regions, biome
  and terrain gates at exact probe coordinates, registry lifecycle/atomicity.

## Validation evidence (100)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1119/1119 (prior 1108 + 11 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 100 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 100
suites, the full unit suite (1119/1119, stable), production build, and the required E2E suite
(19/19). No advancement exception was needed.

## Next change: 101 (pending artifacts)

`101-small-structure-baseline` is named in `CHANGE_SEQUENCE.md` with scope "First simple
generated structure end-to-end using the template system." Per `AGENTS.md`, a change lacking
full artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 100 verification.
Change 101 is the next change; its artifacts must be authored and validated before implementation
begins.
