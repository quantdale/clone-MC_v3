# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **098-vegetation-features — VERIFIED 100%**
- Active implementation change: **098-vegetation-features — VERIFIED**
- Next change: **099-structure-template-format — NOT YET ACTIVE (artifacts pending)**
- 098 task ledger: **4 total tasks, 4 completed**
- 098 completion: **100%**
- 098 mandatory vegetation-features requirements: **PASS**
- 098 required-test gate: **PASS — unit 1095/1095, E2E 19/19**
- 098 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `22add1909e7295da1a6c973ad571c29f59c8990d`
- Next exact action: **Advance to 099-structure-template-format. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (099 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement original structure template blocks/entities/connectors with transforms, verify full gate, commit + push, advance program state.**

## What 098 implemented

Change 098 adds the `surfaceHeight` placement primitive and grass/flowers/mushrooms/simple
vegetation feature defaults.

- `src/worldgen/PlacedFeature.ts` (MODIFIED) — the 095 modifier union gains
  `{ type: 'surfaceHeight' }` (sets each candidate's y to `ctx.surfaceY(x, z)`, no rng draw);
  `PlacementContext` gains a required `surfaceY(x, z): number`; the survival invariant accepts a
  preceding `heightRange` OR `surfaceHeight`; validator and `placeFeature` extended.
- `src/worldgen/VegetationFeature.ts` (NEW) — documented vegetation id vocabulary
  (`VEGETATION_BLOCK_IDS`: short grass 19, poppy 20, dandelion 21, red mushroom 22, brown
  mushroom 23, reserved for the block expansion); `createDefaultVegetationConfiguredFeatures`
  (five blockPatch defaults: short_grass 19/16/4/1, poppy 20/6/3/1, dandelion 21/6/3/1,
  red_mushroom 22/3/2/1, brown_mushroom 23/3/2/1); `createDefaultVegetationPlacedFeatures`
  (five count(+rarity)+surfaceHeight+survivalFilter chains).
- `tests/unit/PlacedFeature.test.ts` (MODIFIED) — context helper gains `surfaceY`
  (mechanical).
- `tests/unit/VegetationFeature.test.ts` (NEW) — 9 tests: surfaceHeight behavior (y from
  callback, zero draws, chain order, surface probes, invariant accept/reject), defaults exact
  values and determinism, all chains re-validated.
- `openspec/changes/095-placed-feature-core/specs/placed-feature-core/spec.md` (MODIFIED) —
  survival invariant line amended (documented 098 extension).

## Validation evidence (098)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1095/1095 (prior 1086 + 9 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 098 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 098 suites,
the full unit suite (1095/1095, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 099 (pending artifacts)

`099-structure-template-format` is named in `CHANGE_SEQUENCE.md` with scope "Original structure
template blocks/entities/connectors with transforms." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 098 verification.
Change 099 is the next change; its artifacts must be authored and validated before implementation
begins.
