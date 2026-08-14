# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **062-greedy-opaque-meshing — VERIFIED 100%**
- Active implementation change: **062-greedy-opaque-meshing — VERIFIED**
- Next change: **063-template-partial-block-meshing — NOT YET ACTIVE (artifacts pending)**
- 062 task ledger: **4 total tasks, 4 completed**
- 062 completion: **100%**
- 062 mandatory greedy-opaque-meshing requirements: **PASS**
- 062 required-test gate: **PASS — unit 717/717, E2E 19/19**
- 062 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `e4ec55eebf745070c46076f8aec94f8ed1cd416f`
- Next exact action: **Advance to 063-template-partial-block-meshing. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (063 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement meshing of slabs/stairs/panes/other model templates without full-cube assumptions, verify full gate, commit + push, advance program state.**

## What 062 implemented

Change 062 adds greedy opaque face merging.

- `src/rendering/GreedyMesher.ts` (NEW) — `OpaqueFaceQuad`, `FaceCellSampler`, `OpaquePredicate`,
  `FaceKeyFn`, `greedyMergeOpaqueFaces` (per-face/slice visibility grids over a 16³ section; exposed =
  opaque cell with a non-opaque outward neighbor, out-of-section neighbors exposed; row-major maximal
  rectangles merged only under an equal `faceKey`; deterministic output), and
  `enumerateOpaqueFacesNaive` (one quad per exposed face) for regression equivalence.
- `tests/unit/GreedyMesher.test.ts` (NEW) — 6 tests: empty section, single cube (6 quads, correct
  planes), 2×1×1 slab merging (6 quads covering 10 faces), key separation, full-plain single-quad
  merge, and an equivalence matrix (merged area == naive area, count ≤, determinism).

## Validation evidence (062)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 717/717 (prior 711 + 6 new GreedyMesher tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 062 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 062 suite
(6/6), the full unit suite (717/717, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 063 (pending artifacts)

`063-template-partial-block-meshing` is named in `CHANGE_SEQUENCE.md` with scope "Mesh
slabs/stairs/panes/other model templates without full-cube assumptions." Per `AGENTS.md`, a change
lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 062 verification.
Change 063 is the next change; its artifacts must be authored and validated before implementation
begins.
