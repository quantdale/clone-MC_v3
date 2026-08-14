# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **082-fluid-collision-movement — VERIFIED 100%**
- Active implementation change: **082-fluid-collision-movement — VERIFIED**
- Next change: **083-fluid-surface-meshing — NOT YET ACTIVE (artifacts pending)**
- 082 task ledger: **4 total tasks, 4 completed**
- 082 completion: **100%**
- 082 mandatory fluid-collision-movement requirements: **PASS**
- 082 required-test gate: **PASS — unit 935/935, E2E 19/19**
- 082 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `216ae5f32e5c154fee65c67146f65ee7ffb7ee99`
- Next exact action: **Advance to 083-fluid-surface-meshing. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (083 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement level-aware fluid surface geometry and side heights (deterministic; 076 levels + 062/070/071 quad pipeline), verify full gate, commit + push, advance program state.**

## What 082 implemented

Change 082 adds fluid immersion, movement drag, buoyancy, and eye-fluid state derived from fluid
data.

- `src/simulation/FluidMovement.ts` (NEW) — `FluidMovementWorld` (fluid reads + 015 density
  lookup), `FluidImmersion`; `fluidDragFactor(d) = clamp(1.1 - 0.3 * d, 0, 1)` (water 0.8, lava
  0.5); `applyFluidDrag(velocity, density, tickDelta)` scales each axis by `factor ^ tickDelta`
  (input untouched); `buoyancyAcceleration(fd, ed, g) = g * max(0, 1 - ed / fd)` (neutral at equal
  densities, upward on denser fluids); `eyeFluid` (fluid id at a point, null in air);
  `fluidHeightAt` (topmost fluid top in a column window; falling water counts);
  `submergedFraction` (clamped [0, 1]); `isFullySubmerged`; `immersion` report. Invalid
  densities/tick deltas throw. Pure and deterministic.
- `tests/unit/FluidMovement.test.ts` (NEW) — 19 tests: drag factors/clamp/validation, drag
  compounding and identity, buoyancy cases, eye-fluid, height scans, submersion none/partial/full
  + clamping, determinism.

## Validation evidence (082)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 935/935 (prior 916 + 19 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 082 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 082 suites,
the full unit suite (935/935, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 083 (pending artifacts)

`083-fluid-surface-meshing` is named in `CHANGE_SEQUENCE.md` with scope "Level-aware fluid surface
geometry and side heights." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 082 verification.
Change 083 is the next change; its artifacts must be authored and validated before implementation
begins.
