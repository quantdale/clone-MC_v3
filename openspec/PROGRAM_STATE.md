# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **090-biome-source — VERIFIED 100%**
- Active implementation change: **090-biome-source — VERIFIED**
- Next change: **091-surface-rule-engine — NOT YET ACTIVE (artifacts pending)**
- 090 task ledger: **4 total tasks, 4 completed**
- 090 completion: **100%**
- 090 mandatory biome-source requirements: **PASS**
- 090 required-test gate: **PASS — unit 1013/1013, E2E 19/19**
- 090 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `239e0f80a92ef2eb1b6e2cda828535812395c59a`
- Next exact action: **Advance to 091-surface-rule-engine. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (091 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement layered biome/height/noise-driven surface replacement rules (deterministic; consumes 088 columns + 090 biomes), verify full gate, commit + push, advance program state.**

## What 090 implemented

Change 090 adds registry-driven biome selection from climate samples.

- `src/worldgen/BiomeSource.ts` (NEW) — `biomeClimateTargets(biome)`: deterministic derivation of
  a five-field climate target from the 016 definition (temperature `clamp(t / 2.5, -1, 1)`;
  humidity/continentalness/erosion from documented category tables; weirdness 0).
  `BiomeSource(seed, registry, sampler?)`: nearest-target selection via 089 `climateDistance`,
  ties broken by lowest registration order; injectable sampler for exact tests; `getBiome`/
  `getBiomeKey`; targets cached at construction. Registry-bound by construction.
- `tests/unit/BiomeSource.test.ts` (NEW) — 6 tests: hand-computed target mappings (temperature
  formula, category tables), exact-target selection, symmetric-midway tie-break (registration
  order) and temperature-nudge flip, determinism with the real sampler, 121-position registry
  bound scan.

## Validation evidence (090)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1013/1013 (prior 1007 + 6 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 090 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 090 suites,
the full unit suite (1013/1013, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 091 (pending artifacts)

`091-surface-rule-engine` is named in `CHANGE_SEQUENCE.md` with scope "Layered biome/height/
noise-driven surface replacement rules." Per `AGENTS.md`, a change lacking full artifacts is a
hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 090 verification.
Change 091 is the next change; its artifacts must be authored and validated before implementation
begins.
