# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **094-configured-feature-core — VERIFIED 100%**
- Active implementation change: **094-configured-feature-core — VERIFIED**
- Next change: **095-placed-feature-core — NOT YET ACTIVE (artifacts pending)**
- 094 task ledger: **4 total tasks, 4 completed**
- 094 completion: **100%**
- 094 mandatory configured-feature-core requirements: **PASS**
- 094 required-test gate: **PASS — unit 1044/1044, E2E 19/19**
- 094 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `e350281a70fa9560b4144543ffe4aacdbdfc4929`
- Next exact action: **Advance to 095-placed-feature-core. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (095 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement placement modifiers, counts, rarity, height, biome and survival filters (deterministic; 094 features + 054 RNG), verify full gate, commit + push, advance program state.**

## What 094 implemented

Change 094 adds the data-driven configured-feature core.

- `src/worldgen/ConfiguredFeature.ts` (NEW) — `ConfiguredFeatureConfig` union
  (`simpleBlock { blockId }`, `blockPatch { blockId; tries; radiusXZ; radiusY }` with strict
  validation: non-negative block ids, positive integers elsewhere); `ConfiguredFeature`
  (key + config); `validateConfiguredFeatureConfig`/`validateConfiguredFeature`;
  `ConfiguredFeatureRegistry` (003 pattern: atomic duplicate/invalid rejection,
  register/get/has/size/clear); `createDefaultConfiguredFeatures` (`overworld/dirt_patch`
  blockPatch 3/64/4/3, `overworld/gravel_patch` 13/32/3/2).
- `tests/unit/ConfiguredFeature.test.ts` (NEW) — 6 tests: validation matrix, registry lifecycle
  and atomicity, defaults, determinism.

## Validation evidence (094)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1044/1044 (prior 1038 + 6 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 094 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 094 suites,
the full unit suite (1044/1044, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 095 (pending artifacts)

`095-placed-feature-core` is named in `CHANGE_SEQUENCE.md` with scope "Placement modifiers,
counts, rarity, height, biome and survival filters." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 094 verification.
Change 095 is the next change; its artifacts must be authored and validated before implementation
begins.
