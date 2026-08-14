# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **089-climate-sampler — VERIFIED 100%**
- Active implementation change: **089-climate-sampler — VERIFIED**
- Next change: **090-biome-source — NOT YET ACTIVE (artifacts pending)**
- 089 task ledger: **4 total tasks, 4 completed**
- 089 completion: **100%**
- 089 mandatory climate-sampler requirements: **PASS**
- 089 required-test gate: **PASS — unit 1007/1007, E2E 19/19**
- 089 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `e78d3d74b6990ad85974e30da882aec5226d335b`
- Next exact action: **Advance to 090-biome-source. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (090 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement registry-driven biome selection from climate samples (016 biomes + 089 sampler + distance metric), verify full gate, commit + push, advance program state.**

## What 089 implemented

Change 089 adds deterministic five-field climate sampling.

- `src/worldgen/ClimateSampler.ts` (NEW) — `ClimateSample` (temperature, humidity,
  continentalness, erosion, weirdness, each in [-1, 1]); `ClimateSampler(worldSeed)` sampling at
  (x, z) with per-field 087 noise instances derived from the seed via distinct XOR offsets and
  documented scales (0.002/0.003/0.001/0.005/0.007), fbm defaults 4/2/0.5, clamped to [-1, 1];
  `validateClimateSample` (strict, field-naming errors); `climateDistance` (Euclidean over the
  five fields — the 090 biome-matching metric). Pure 2D sampling.
- `tests/unit/ClimateSampler.test.ts` (NEW) — 8 tests: determinism (cross-instance), 121-point
  range grid, seed sensitivity, positional variation, validation matrix, distance metric
  (identity/symmetry/hand-computed 3-4-5).

## Validation evidence (089)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1007/1007 (prior 999 + 8 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 089 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 089 suites,
the full unit suite (1007/1007, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 090 (pending artifacts)

`090-biome-source` is named in `CHANGE_SEQUENCE.md` with scope "Registry-driven biome selection
from climate samples." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 089 verification.
Change 090 is the next change; its artifacts must be authored and validated before implementation
begins.
