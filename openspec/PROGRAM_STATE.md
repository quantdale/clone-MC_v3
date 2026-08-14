# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **083-fluid-surface-meshing — VERIFIED 100%**
- Active implementation change: **083-fluid-surface-meshing — VERIFIED**
- Next change: **084-fluid-regression-suite — NOT YET ACTIVE (artifacts pending)**
- 083 task ledger: **4 total tasks, 4 completed**
- 083 completion: **100%**
- 083 mandatory fluid-surface-meshing requirements: **PASS**
- 083 required-test gate: **PASS — unit 945/945, E2E 19/19**
- 083 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `430c49a387edcc5dcf9eb444d38060c4cc399f57`
- Next exact action: **Advance to 084-fluid-regression-suite. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (084 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement deterministic fixtures for fluid flow, boundaries, unload/reload, and performance (integration-level over 076-083), verify full gate, commit + push, advance program state.**

## What 083 implemented

Change 083 adds level-aware fluid surface geometry and side heights.

- `src/rendering/FluidSurfaceMesher.ts` (NEW) — `FluidSurfaceWorld`,
  `meshFluidSurface(world, fluidId, light, x, y, z)` and `meshFluidSurfaces` (batch, input order):
  top face at `y + fluidSurfaceHeight(level)` (076: 1 for source/falling, `(8-level)/8` for
  flowing) emitted only when the cell above is not the same fluid; side faces — full depth
  against air/blocks/different fluids, step height `[neighborTop, ownTop]` against lower
  same-fluid surfaces, none against equal/higher same-fluid; zero-height sides skipped. Quads
  reuse the 062 shape with `blockId = fluidId` and 070/071 corner light/AO. Per-cell emission
  order: up, then `-x, +x, -z, +z`.
- `tests/unit/FluidSurfaceMesher.test.ts` (NEW) — 10 tests: top-face presence and plane across
  all level classes, side scenarios (air/block/different fluid/lower-step/equal-higher/removal),
  identity checks, light/AO attachment, order and batch determinism.

## Validation evidence (083)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 945/945 (prior 935 + 10 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 083 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 083 suites,
the full unit suite (945/945, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 084 (pending artifacts)

`084-fluid-regression-suite` is named in `CHANGE_SEQUENCE.md` with scope "Deterministic fixtures
for flow, boundaries, unload/reload, and performance." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 083 verification.
Change 084 is the next change; its artifacts must be authored and validated before implementation
begins.
