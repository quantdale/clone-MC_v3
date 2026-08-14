# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **096-ore-generation — VERIFIED 100%**
- Active implementation change: **096-ore-generation — VERIFIED**
- Next change: **097-tree-feature-system — NOT YET ACTIVE (artifacts pending)**
- 096 task ledger: **4 total tasks, 4 completed**
- 096 completion: **100%**
- 096 mandatory ore-generation requirements: **PASS**
- 096 required-test gate: **PASS — unit 1075/1075, E2E 19/19**
- 096 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `6dcd5e0d70b42633ff243f6528c9347e97cfcf1e`
- Next exact action: **Advance to 097-tree-feature-system. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (097 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement configurable trunk/foliage tree features replacing hard-coded tree placement (extend the 094 config union with a tree type; trunk/foliage vocabulary over 095 placed features; deterministic; 054 RNG), verify full gate, commit + push, advance program state.**

## What 096 implemented

Change 096 adds registry/tag-driven ore configured and placed features.

- `src/worldgen/ConfiguredFeature.ts` (MODIFIED) — the config union gains the documented `ore`
  member (`blockId` non-negative integer, `size` positive integer,
  `discardChanceOnAirExposure` finite in `[0, 1]`, non-empty string `targetTags`) with strict
  validation; 094 defaults and validations unchanged.
- `src/worldgen/OreFeature.ts` (NEW) — `OreBlockTag`/`validateOreBlockTag` (non-empty key,
  non-empty deduplicated non-negative integer ids, order preserved); `OreBlockTagRegistry`
  (003 pattern: atomic duplicate/invalid rejection, register/get/has/size/clear);
  `resolveOreTargetBlockIds` (targetTags order, member order, first-occurrence dedupe, unknown
  tags throw); `createDefaultOreBlockTags` (`overworld/stone_ore_replaceables` = [3],
  `overworld/soil_ore_replaceables` = [2, 11, 4]); `createDefaultOreConfiguredFeatures`
  (`overworld/coal_ore` ore 14/17/0, `overworld/iron_ore` ore 15/9/0, both targeting both tags);
  `createDefaultOrePlacedFeatures` (coal `count 20` + `heightRange -64..192`; iron `count 9` +
  `heightRange -64..72`).
- `tests/unit/ConfiguredFeature.test.ts` (MODIFIED) — unknown-type stand-in `ore` -> `portal`
  (documented union extension).
- `tests/unit/OreFeature.test.ts` (NEW) — 14 tests: ore config validation matrix, tag
  validation matrix, registry lifecycle/atomicity, resolution order/dedupe/unknown-tag errors,
  defaults exact values and determinism, cross-check that default targetTags resolve.

## Validation evidence (096)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1075/1075 (prior 1061 + 14 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 096 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 096 suites,
the full unit suite (1075/1075, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 097 (pending artifacts)

`097-tree-feature-system` is named in `CHANGE_SEQUENCE.md` with scope "Configurable trunk/foliage
tree features replacing hard-coded tree placement." Per `AGENTS.md`, a change lacking full
artifacts is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 096 verification.
Change 097 is the next change; its artifacts must be authored and validated before implementation
begins.
