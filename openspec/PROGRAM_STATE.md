# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **058-shape-aware-raycast — VERIFIED 100%**
- Active implementation change: **058-shape-aware-raycast — VERIFIED**
- Next change: **059-block-model-data — NOT YET ACTIVE (artifacts pending)**
- 058 task ledger: **4 total tasks, 4 completed**
- 058 completion: **100%**
- 058 mandatory shape-aware-raycast requirements: **PASS**
- 058 required-test gate: **PASS — unit 694/694, E2E 19/19**
- 058 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `4fde1a5483089d5d57aba5eb10c0272e3c23e0e5`
- Next exact action: **Advance to 059-block-model-data. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (059 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement original block-model geometry/texture-reference schema, verify full gate, commit + push, advance program state.**

## What 058 implemented

Change 058 adds shape-aware selection raycasting.

- `src/world/ShapeRaycast.ts` (NEW) — `SelectionShapeWorld`, `ShapeRayHit` (cell, entry-face normal,
  exact point, distance), and `raycastSelection`: Amanatides & Woo DDA cell traversal (mirroring
  `raycastVoxel`) with per-box slab-method ray/AABB intersection, nearest-box-per-cell selection,
  entry-face normals pointing toward the ray origin, `maxDistance` bounding, and degenerate-input
  guards (zero-length direction, non-finite inputs, negative maxDistance → null).
- `tests/unit/ShapeRaycast.test.ts` (NEW) — 6 tests: full-cube near-face hit, shape-aware slab
  pass-through (above y = 0.5) vs slab side hit, nearest-cell selection, maxDistance limits,
  slab top-face normal, and degenerate-input guards.

## Validation evidence (058)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 694/694 (prior 688 + 6 new ShapeRaycast tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 058 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 058 suite
(6/6), the full unit suite (694/694, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 059 (pending artifacts)

`059-block-model-data` is named in `CHANGE_SEQUENCE.md` with scope "Original block-model
geometry/texture-reference schema." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 058 verification.
Change 059 is the next change; its artifacts must be authored and validated before implementation
begins.
