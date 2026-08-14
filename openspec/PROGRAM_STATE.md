# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **095-placed-feature-core — VERIFIED 100%**
- Active implementation change: **095-placed-feature-core — VERIFIED**
- Next change: **096-ore-generation — NOT YET ACTIVE (artifacts pending)**
- 095 task ledger: **4 total tasks, 4 completed**
- 095 completion: **100%**
- 095 mandatory placed-feature-core requirements: **PASS**
- 095 required-test gate: **PASS — unit 1061/1061, E2E 19/19**
- 095 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `5d9a36142e898d1d19be63914e04e6adb30e2c69`
- Next exact action: **Advance to 096-ore-generation. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (096 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement registry/tag-driven ore configured/placed features (extend the 094 config union with an ore type and register ore placed features over 095 modifiers; deterministic; 054 RNG), verify full gate, commit + push, advance program state.**

## What 095 implemented

Change 095 adds the placement core: modifiers, counts, rarity, height, biome and survival filters.

- `src/worldgen/PlacedFeature.ts` (NEW) — `PlacementModifier` union (`count { tries }`,
  `rarity { chance }`, `heightRange { minY; maxY }`, `biomeFilter { biomeKeys }`,
  `survivalFilter {}` with strict validation: positive integers for tries/chance, integer
  minY/maxY with minY <= maxY, non-empty string biomeKeys); `PlacedFeature` (key + featureKey
  referencing a 094 configured feature + ordered modifier chain with the invariants "at most one
  count" and "survivalFilter requires a preceding heightRange"); `PlacementContext` (biomeKey,
  isSolid probe, nextFloat rng — `SeedRng` from 054 satisfies it); `placeFeature` (deterministic
  chain application in data order with pinned rng draw order; uniform inclusive height sampling;
  candidates without heightRange report y = 0); `validatePlacementModifier`/
  `validatePlacedFeature`; `PlacedFeatureRegistry` (003 pattern: atomic duplicate/invalid
  rejection, register/get/has/size/clear).
- `tests/unit/PlacedFeature.test.ts` (NEW) — 17 tests: modifier matrix, chain order with a
  scripted rng, inclusive height bounds, rarity boundary (draw < 1/chance), biome and survival
  filters, full-chain draw accounting, determinism with a fixed-seed `SeedRng`, validation
  matrix incl. chain invariants, registry lifecycle and atomicity.

## Validation evidence (095)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1061/1061 (prior 1044 + 17 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 095 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 095 suites,
the full unit suite (1061/1061, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 096 (pending artifacts)

`096-ore-generation` is named in `CHANGE_SEQUENCE.md` with scope "Registry/tag-driven ore
configured/placed features." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 095 verification.
Change 096 is the next change; its artifacts must be authored and validated before implementation
begins.
