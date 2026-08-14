# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **092-cave-carver-system — VERIFIED 100%**
- Active implementation change: **092-cave-carver-system — VERIFIED**
- Next change: **093-aquifer-system — NOT YET ACTIVE (artifacts pending)**
- 092 task ledger: **5 total tasks, 5 completed**
- 092 completion: **100%**
- 092 mandatory cave-carver-system requirements: **PASS**
- 092 required-test gate: **PASS — unit 1030/1030, E2E 19/19**
- 092 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `13cff430f0a14cee738f3a7bc35f3a54644589fb`
- Next exact action: **Advance to 093-aquifer-system. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (093 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement underground water/lava aquifer decisions (deterministic; 076 fluids + 092 carved space), verify full gate, commit + push, advance program state.**

## What 092 implemented

Change 092 adds the configurable 3D cave-carving stage independent of terrain density.

- `src/worldgen/CaveCarver.ts` (NEW) — `CaveCarverConfig` (seed, threshold 0.05, minY -64,
  maxY 320); `carveValue(seed, x, y, z)` (documented two-noise formula: wide fbm4 at 0.02 scale
  minus 0.4 × detail fbm3 at 0.09 scale, seed-derived noise instances); `CarvedColumn` (sparse
  mask, `has`/`size`); `carveColumn(seed, columnX, columnZ, config?)` (cells with
  `carveValue > threshold`, confined to `[minY, maxY)`); `applyCarving(column, carved)` (pure:
  returns a new 088 `TerrainColumn` with exactly the carved cells removed).
- `src/worldgen/OverworldTerrain.ts` — added `TerrainColumn.removeCell` (additive).
- `tests/unit/CaveCarver.test.ts` (NEW) — 8 tests: carveValue determinism/bounds, exhaustive
  mask determinism and seed sensitivity (32-layer windows for speed), nonzero-carve fixture,
  y-window confinement, applyCarving removal + purity, config validation, removeCell behavior.

## Validation evidence (092)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1030/1030 (prior 1022 + 8 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 092 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 092 suites,
the full unit suite (1030/1030, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 093 (pending artifacts)

`093-aquifer-system` is named in `CHANGE_SEQUENCE.md` with scope "Underground water/lava aquifer
decisions." Per `AGENTS.md`, a change lacking full artifacts is a hard pre-implementation block.
Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 092 verification.
Change 093 is the next change; its artifacts must be authored and validated before implementation
begins.
