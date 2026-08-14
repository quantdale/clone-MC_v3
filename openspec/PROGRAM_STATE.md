# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **101-small-structure-baseline — VERIFIED 100%**
- Active implementation change: **101-small-structure-baseline — VERIFIED**
- Next change: **102-worldgen-golden-seeds — NOT YET ACTIVE (artifacts pending)**
- 101 task ledger: **4 total tasks, 4 completed**
- 101 completion: **100%**
- 101 mandatory small-structure-baseline requirements: **PASS**
- 101 required-test gate: **PASS — unit 1130/1130, E2E 19/19**
- 101 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `64c8235760e3fd5e6b7aa5871b13046dc08892ba`
- Next exact action: **Advance to 102-worldgen-golden-seeds. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (102 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement golden seed/hash/landmark regression fixtures across coordinates and versions, verify full gate, commit + push, advance program state.**

## What 101 implemented

Change 101 delivers the first generated structure end-to-end through the template system.

- `src/worldgen/StructureGenerator.ts` (NEW) — `StructureGenerator` (composes 099 templates +
  100 placements + seed; construction fails fast when a placement references a missing
  template; `maxExtent`; `startAt`; `blocksForChunk`: windowed start queries
  `±ceil(maxExtent / 16)`, transforms applied, origin Y = `surfaceY` at the start center,
  world-coordinate blocks filtered to the chunk's 16x16 footprint, placements in registration
  order with later-overwrites-earlier); `createDefaultStructureTemplates` (ruined well 5x3x5,
  56 cobblestone blocks, hollow center — dry by design so water never appears above sea
  level); `createDefaultStructurePlacements` (spacing 12, separation 4, salt 40101,
  plains/forest/taiga, minSurfaceHeight 33); `createDefaultStructureGenerator(seed)`.
- `src/worldgen/StructureTemplate.ts` / `StructurePlacement.ts` (MODIFIED) — additive `all()`
  enumerators on both registries (101 extension).
- `src/world/TerrainGenerator.ts` (MODIFIED) — optional `structures` constructor parameter
  (defaults to the seed's default generator); `generateChunk` writes structure blocks after
  trees with overwrite semantics.
- `tests/unit/StructureGenerator.test.ts` (NEW) — 11 tests: defaults exactness, fail-fast
  construction, startAt vectors, exact rotated world blocks, neighbor-chunk slicing with a
  20-wide template, overwrite order, determinism, and an end-to-end test that a generated
  chunk contains the well's cobblestone at a computed start.

## Validation evidence (101)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1130/1130 (prior 1119 + 11 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 101 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 101
suites, the full unit suite (1130/1130, stable), production build, and the required E2E suite
(19/19). No advancement exception was needed.

## Next change: 102 (pending artifacts)

`102-worldgen-golden-seeds` is named in `CHANGE_SEQUENCE.md` with scope "Golden seed/hash/
landmark regression fixtures across coordinates and versions." Per `AGENTS.md`, a change
lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts
via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 101 verification.
Change 102 is the next change; its artifacts must be authored and validated before implementation
begins.
