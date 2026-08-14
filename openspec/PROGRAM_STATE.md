# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **056-voxel-shape-core — VERIFIED 100%**
- Active implementation change: **056-voxel-shape-core — VERIFIED**
- Next change: **057-shape-aware-player-collision — NOT YET ACTIVE (artifacts pending)**
- 056 task ledger: **4 total tasks, 4 completed**
- 056 completion: **100%**
- 056 mandatory voxel-shape-core requirements: **PASS**
- 056 required-test gate: **PASS — unit 681/681, E2E 19/19**
- 056 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `9cc8f10d03ec61bdd40719539158a0db564c80d3`
- Next exact action: **Advance to 057-shape-aware-player-collision. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (057 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement player collision queries against block collision shapes rather than full-cube assumptions, verify full gate, commit + push, advance program state.**

## What 056 implemented

Change 056 adds the immutable voxel shape core, starting the block geometry/rendering section.

- `src/world/VoxelShape.ts` (NEW) — `Aabb` and `VoxelShape`: `of` copies/validates/freezes boxes
  (finite coordinates, `min ≤ max`); `EMPTY`/`FULL_CUBE` constants; `isEmpty`/`boxes`; `union`
  composes without mutating inputs; `intersects`/`contains` are boundary-inclusive; `maxY()` returns
  the highest box top.
- `tests/unit/VoxelShape.test.ts` (NEW) — 7 tests: constants, construction validation, immutability
  under input mutation, union composition, intersects (inside/disjoint/boundary), contains
  (inside/outside/boundary), and maxY.

## Validation evidence (056)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 681/681 (prior 674 + 7 new VoxelShape tests), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 056 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 056 suite
(7/7), the full unit suite (681/681, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 057 (pending artifacts)

`057-shape-aware-player-collision` is named in `CHANGE_SEQUENCE.md` with scope "Player collision
queries use block collision shapes rather than full-cube assumptions." Per `AGENTS.md`, a change
lacking full artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 056 verification.
Change 057 is the next change; its artifacts must be authored and validated before implementation
begins.
