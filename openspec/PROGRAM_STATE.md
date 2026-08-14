# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **071-ambient-occlusion — VERIFIED 100%**
- Active implementation change: **071-ambient-occlusion — VERIFIED**
- Next change: **072-biome-tint-rendering — NOT YET ACTIVE (artifacts pending)**
- 071 task ledger: **6 total tasks, 6 completed**
- 071 completion: **100%**
- 071 mandatory ambient-occlusion requirements: **PASS**
- 071 required-test gate: **PASS — unit 804/804, E2E 19/19**
- 071 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `2f4b637a4648286515774d212fb51010a24a8950`
- Next exact action: **Advance to 072-biome-tint-rendering. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (072 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement biome-controlled tint attributes for grass/foliage/water-like surfaces (deterministic, orthogonal to 070 light and 071 AO), verify full gate, commit + push, advance program state.**

## What 071 implemented

Change 071 adds Minecraft-like per-vertex ambient occlusion to generated meshes.

- `src/rendering/AmbientOcclusion.ts` (NEW) — `AOLevel` (0-3), `sampleCornerAO`, `quadVertexAO`:
  the classic Minecraft 0-3 table over the 3-cell neighborhood in the outward layer
  (`side1 = (fu-1, fv)`, `side2 = (fu, fv-1)`, `corner = (fu-1, fv-1)` with `fu = floor(u)`); the
  front cell `(fu, fv)` is never consulted; out-of-section cells never occlude; fractional corners
  snap with `floor()`.
- `src/rendering/GreedyMesher.ts` — `AOLevel` and required `OpaqueFaceQuad.vertexAO` (4-tuple in
  070 corner order); `greedyMergeOpaqueFaces`/`enumerateOpaqueFacesNaive` emit AO alongside light
  via a shared `withVertexShading` helper.
- `src/rendering/TemplateMesher.ts` — `meshBlockModel` emits `vertexAO` (fractional extents
  supported).
- Worker pipeline inherits AO automatically (no payload change — opacity already travels in
  `cells`/`opaqueIds`).
- `tests/unit/AmbientOcclusion.test.ts` (NEW) — 10 tests: all five table cases, front-cell
  exclusion, out-of-section non-occlusion, floor-snap fractional corners, corner order,
  determinism. GreedyMesher/TemplateMesher/WorkerMeshing tests updated (12 new tests total).

## Validation evidence (071)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 804/804 (prior 792 + 12 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 071 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, the new 071 suites,
the full unit suite (804/804, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 072 (pending artifacts)

`072-biome-tint-rendering` is named in `CHANGE_SEQUENCE.md` with scope "Biome-controlled tint
attributes for grass/foliage/water-like surfaces." Per `AGENTS.md`, a change lacking full artifacts
is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 071 verification.
Change 072 is the next change; its artifacts must be authored and validated before implementation
begins.
