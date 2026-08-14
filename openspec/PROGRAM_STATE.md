# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **097-tree-feature-system — VERIFIED 100%**
- Active implementation change: **097-tree-feature-system — VERIFIED**
- Next change: **098-vegetation-features — NOT YET ACTIVE (artifacts pending)**
- 097 task ledger: **4 total tasks, 4 completed**
- 097 completion: **100%**
- 097 mandatory tree-feature-system requirements: **PASS**
- 097 required-test gate: **PASS — unit 1086/1086, E2E 19/19**
- 097 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `0ac810f929463d8ed2d6f784f87313c68f5b8dbe`
- Next exact action: **Advance to 098-vegetation-features. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (098 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement grass/flowers/mushrooms/simple vegetation placed features (extend the 094 config union or reuse simpleBlock/blockPatch over 095 placed features; deterministic; 054 RNG), verify full gate, commit + push, advance program state.**

## What 097 implemented

Change 097 adds configurable trunk/foliage tree features and replaces the hard-coded tree
placement.

- `src/worldgen/ConfiguredFeature.ts` (MODIFIED) — the config union gains the documented `tree`
  member (`trunk { blockId; minHeight; maxHeight }` with minHeight <= maxHeight,
  `foliage { blockId; shape: round|flatTop|spruce; radius }`) with strict validation.
- `src/worldgen/TreeFeature.ts` (NEW) — `TreeShape`, `TreeTrunkConfig`/`TreeFoliageConfig`,
  `TreeBlock`; `buildTreeBlocks` (deterministic layout: one height draw, uniform over
  [minHeight, maxHeight]; shape tables round [r, r, r-1], flatTop [r, r, r], spruce cone
  r..0; trunk-first then foliage-layer order); `createDefaultTreeConfiguredFeatures`
  (`overworld/oak_tree`: trunk 7/4-5, foliage 8/round/2 — matches the former hard-coded tree).
- `src/world/TerrainGenerator.ts` (MODIFIED) — tree placement now builds through
  `buildTreeBlocks` over the resolved default oak; biome/density gating, the per-column PRNG
  draw sequence (density draw, then height draw), owner-based cross-chunk writes and air-only
  overwrites are unchanged; `CANOPY_HALF_WIDTH` replaced by the foliage radius; fail-fast
  default resolution in the constructor. World output is bit-identical (trunk base at
  surface+1 via `wy = surface + dy`; canopy at surface+h+1..+3).
- `tests/unit/TreeFeature.test.ts` (NEW) — 10 tests: validation matrix, exact layouts for all
  three shapes, height sampling bounds, single-draw contract, determinism, defaults.
- `tests/unit/TerrainGenerator.test.ts` (MODIFIED) — one regression test asserting foliage is
  present; all pre-existing tests pass unchanged.

## Validation evidence (097)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 1086/1086 (prior 1075 + 11 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 097 is **VERIFIED** at 4/4 (100%). All gates are green: typecheck, lint, the new 097 suites,
the full unit suite (1086/1086, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed. An initial off-by-one (trunk base at surface+2) was caught by
the anchored-trunk test and fixed.

## Next change: 098 (pending artifacts)

`098-vegetation-features` is named in `CHANGE_SEQUENCE.md` with scope "Grass/flowers/mushrooms/
simple vegetation placed features." Per `AGENTS.md`, a change lacking full artifacts is a hard
pre-implementation block. Author and validate those artifacts via `SPEC_AUTHORING_PROTOCOL.md`
before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 097 verification.
Change 098 is the next change; its artifacts must be authored and validated before implementation
begins.
