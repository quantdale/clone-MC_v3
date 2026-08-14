# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **063-template-partial-block-meshing — VERIFIED 100%**
- Active implementation change: **063-template-partial-block-meshing — VERIFIED**
- Next change: **064-worker-job-protocol — NOT YET ACTIVE (artifacts pending)**
- 063 task ledger: **4 total tasks, 4 completed**
- 063 completion: **100%**
- 063 mandatory template-partial-block-meshing requirements: **PASS**
- 063 required-test gate: **PASS — unit 724/724, E2E 19/19**
- 063 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `8fe4e07d2243626c1b96939af45f507e512ea100`
- Next exact action: **Advance to 064-worker-job-protocol. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (064 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement a versioned transferable worker request/result protocol with stale result rejection, verify full gate, commit + push, advance program state.**

## What 063 implemented

Change 063 adds template (partial-block) meshing.

- `src/rendering/TemplateMesher.ts` (NEW) — `meshBlockModel(model, blockId, x, y, z, isOpaqueCell)`
  converts a 059 `BlockModel` into world-unit `OpaqueFaceQuad`s: per element, per face, quad planes
  from `from/16`/`to/16` with `(to - from)/16` extents; boundary faces (local 0/1) culled against
  opaque outward neighbors; interior faces never culled; deterministic element/face order.
  `isFullCubeModel` detects the canonical full cube.
- `tests/unit/TemplateMesher.test.ts` (NEW) — 7 tests: isolated/buried full cube, slab planes +
  neighbor culling, multi-element stair-like model, interior-face non-culling, and full-cube
  detection.

## Validation evidence (063)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 724/724 (prior 717 + 7 new TemplateMesher tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 063 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 063 suite
(7/7), the full unit suite (724/724, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 064 (pending artifacts)

`064-worker-job-protocol` is named in `CHANGE_SEQUENCE.md` with scope "Versioned transferable worker
request/result protocol with stale result rejection." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 063 verification.
Change 064 is the next change; its artifacts must be authored and validated before implementation
begins.
