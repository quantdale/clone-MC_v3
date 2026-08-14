# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **057-shape-aware-player-collision — VERIFIED 100%**
- Active implementation change: **057-shape-aware-player-collision — VERIFIED**
- Next change: **058-shape-aware-raycast — NOT YET ACTIVE (artifacts pending)**
- 057 task ledger: **4 total tasks, 4 completed**
- 057 completion: **100%**
- 057 mandatory shape-aware-player-collision requirements: **PASS**
- 057 required-test gate: **PASS — unit 688/688, E2E 19/19**
- 057 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `8f2b2aa3b1983beb6277b450fd0d2cde283eb6ea`
- Next exact action: **Advance to 058-shape-aware-raycast. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (058 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement selection/interactions raycasting against selection shapes, verify full gate, commit + push, advance program state.**

## What 057 implemented

Change 057 adds shape-aware, axis-separated collision resolution.

- `src/world/CollisionResolver.ts` (NEW) — `ShapeWorld` (cell → 056 `VoxelShape`), `CollisionBox`,
  `MovementResult`, and `CollisionResolver`: `move` resolves X → Y → Z with swept-path cell scanning
  and face snapping (a collided axis clamps to the shape face and is flagged; other axes keep their
  deltas); `collides` is boundary-inclusive; deterministic, epsilon-toleranced, no tunneling.
- `tests/unit/CollisionResolver.test.ts` (NEW) — 7 tests: full-cube wall stop, floor landing,
  slab landing at y = 0.5 (shape-aware, not full-cube), axis separation on a diagonal move, free
  movement in empty space, boundary-inclusive `collides`, and degenerate-box rejection.

## Validation evidence (057)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 688/688 (prior 681 + 7 new CollisionResolver tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 057 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 057 suite
(7/7), the full unit suite (688/688, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 058 (pending artifacts)

`058-shape-aware-raycast` is named in `CHANGE_SEQUENCE.md` with scope "Selection/interactions raycast
against selection shapes." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before
any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 057 verification.
Change 058 is the next change; its artifacts must be authored and validated before implementation
begins.
