# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **087-density-noise-router — VERIFIED 100%**
- Active implementation change: **087-density-noise-router — VERIFIED**
- Next change: **088-overworld-density-terrain — NOT YET ACTIVE (artifacts pending)**
- 087 task ledger: **5 total tasks, 5 completed**
- 087 completion: **100%**
- 087 mandatory density-noise-router requirements: **PASS**
- 087 required-test gate: **PASS — unit 990/990, E2E 19/19**
- 087 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `1ad6e0923700c0f4d54382fac644ec057f843b82`
- Next exact action: **Advance to 088-overworld-density-terrain. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (088 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement modern-height terrain from density functions preserving deterministic seeds (087 primitives + 054 seeded RNG), verify full gate, commit + push, advance program state.**

## What 087 implemented

Change 087 adds reusable deterministic 3D density/noise composition primitives.

- `src/worldgen/DensityNoise.ts` (NEW) — `hashNoise3D` (FNV-1a over integer coordinates + seed,
  [0, 1)); `smoothstep`/`lerp`; `ValueNoise3D` (periodic lattice of hash values, default period
  256, smoothstep trilinear sampling into [-1, 1], exact lattice values at integer coordinates,
  exact period wrap); `fbm3D` (octave sum, defaults 4 octaves / lacunarity 2 / gain 0.5, bounded
  by the amplitude sum).
- `src/worldgen/DensityComposition.ts` (NEW) — `DensityNode` union (constant, yGradient, noise,
  add, multiply, scale, offset, min, max, clamp), `DensityContext`, `evaluateDensity` (pure,
  fixed child order a-then-b, scalars after children), `validateDensityNode` (strict, 64-depth
  cap, non-finite scalar rejection).
- Tests (NEW) — `DensityNoise.test.ts` (7) and `DensityComposition.test.ts` (7): hash
  range/determinism/variation, lattice exactness, period wrap, range checks, fbm bounds,
  per-node hand-computed fixtures, nested trees, validation matrix, purity.

## Validation evidence (087)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 990/990 (prior 975 + 15 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 087 is **VERIFIED** at 5/5 (100%). All gates are green: typecheck, lint, the new 087 suites,
the full unit suite (990/990, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 088 (pending artifacts)

`088-overworld-density-terrain` is named in `CHANGE_SEQUENCE.md` with scope "Modern-height terrain
from density functions, preserving deterministic seeds." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 087 verification.
Change 088 is the next change; its artifacts must be authored and validated before implementation
begins.
