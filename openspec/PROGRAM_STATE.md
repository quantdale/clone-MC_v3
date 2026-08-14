# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **069-incremental-light-updates — VERIFIED 100%**
- Active implementation change: **069-incremental-light-updates — VERIFIED**
- Next change: **070-light-aware-meshing — NOT YET ACTIVE (artifacts pending)**
- 069 task ledger: **4 total tasks, 4 completed**
- 069 completion: **100%**
- 069 mandatory incremental-light-updates requirements: **PASS**
- 069 required-test gate: **PASS — unit 779/779, E2E 19/19**
- 069 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `321a591fde1a8a589afffecd1b975a31c24057fe`
- Next exact action: **Advance to 070-light-aware-meshing. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (070 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement per-vertex light sampling in section meshing (opaque faces sample sky/block light at face centers per 067/068 LightStorage; deterministic), verify full gate, commit + push, advance program state.**

## What 069 implemented

Change 069 adds incremental light updates after block edits.

- `src/rendering/LightUpdateEngine.ts` (NEW) — `LightUpdateWorld` and `updateLightAfterEdit(world, x, y, z)`:
  per light type (sky, block) a removal BFS from the edited cell zeroes cells strictly darker than the
  removed path's level without crossing opaque cells; then block sources are re-seeded
  (`getLuminance`, clamped to 15) and a re-add BFS propagates from every surviving lit cell (value `v`
  raises non-opaque neighbors to `v - 1`). Fixed neighbor order (`-x, +x, -y, +y, -z, +z`) and FIFO
  queues make every phase deterministic. Result equals a full recompute (067 `computeSkyLight` + 068
  `computeBlockLight`) of the edited world.
- `tests/unit/LightUpdateEngine.test.ts` (NEW) — 25 tests: 14-fixture equivalence matrix (placement,
  breaking, torch place/remove, glowstone, opaque emitter, wall, block-above-torch, compound 4-edit
  sequence, world edges/corners, negative-Y cave/basement, no-op break), plus behavioral tests:
  placement darkens, breaking lights up, basement pit lighting, source propagation/removal, opaque
  source emission, light bending around corners, independent light paths surviving, sealed-cave no-op,
  place-then-break restore, and determinism.

## Validation evidence (069)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 779/779 (prior 754 + 25 new LightUpdateEngine tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 069 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 069 suite
(25/25), the full unit suite (779/779, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 070 (pending artifacts)

`070-light-aware-meshing` is named in `CHANGE_SEQUENCE.md` with scope "Per-vertex light in section
meshing." Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block. Author
and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 069 verification.
Change 070 is the next change; its artifacts must be authored and validated before implementation
begins.
