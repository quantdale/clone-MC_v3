# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **099-structure-template-format — VERIFIED 100%**
- Active implementation change: **099-structure-template-format — VERIFIED**
- Next change: **100-structure-placement-core — NOT YET ACTIVE (artifacts pending)**
- 099 task ledger: **4 total tasks, 4 completed**
- 099 completion: **100%**
- 099 mandatory structure-template-format requirements: **PASS**
- 099 required-test gate: **PASS — unit 1108/1108, E2E 19/19**
- 099 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `a55ad8d1da19556ff5723ec591c40eb5b3e4c343`
- Next exact action: **Advance to 100-structure-placement-core. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (100 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement seeded spacing/separation/biome/terrain-aware placement of 099 templates, verify full gate, commit + push, advance program state.**

## What 099 implemented

Change 099 adds the structure template format: blocks, entities, connectors, and transforms.

- `src/worldgen/StructureTemplate.ts` (NEW) — `Direction` (north = -z, south = +z, east = +x,
  west = -x, up, down), `StructureSize`/`StructureBlock`/`StructureEntity`/
  `StructureConnector`/`StructureTemplate`; `validateStructureTemplate` (non-empty key,
  positive integer extents ≤ `MAX_TEMPLATE_EXTENT` 64, in-bounds integer coordinates, unique
  block positions and connector keys, non-negative block ids, non-empty entity keys, six
  documented facings); `StructureTransform` (rotation 0/90/180/270, mirror none/x/z) +
  `validateStructureTransform`; `applyStructureTransform` (mirror first, then clockwise Y
  rotation about the origin corner; 90/270 transpose the footprint to depth × height × width;
  facing rotation north→east→south→west, x-mirror swaps east↔west, z-mirror swaps
  north↔south); `TransformedStructure`; `StructureTemplateRegistry` (003 pattern, atomic
  rejection).
- `tests/unit/StructureTemplate.test.ts` (NEW) — 13 tests: validation matrix, exact transform
  vectors for every rotation/mirror and their composition, determinism, registry
  lifecycle/atomicity.

## Validation evidence (099)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1108/1108 (prior 1095 + 13 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 099 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 099 suites,
the full unit suite (1108/1108, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 100 (pending artifacts)

`100-structure-placement-core` is named in `CHANGE_SEQUENCE.md` with scope "Seeded
spacing/separation/biome/terrain-aware placement." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 099 verification.
Change 100 is the next change; its artifacts must be authored and validated before implementation
begins.
