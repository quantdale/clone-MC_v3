# Minecraft-Parity Program State

## Current checkpoint

- Program: **ACTIVE**
- Last completed change: **072-biome-tint-rendering — VERIFIED 100%**
- Active implementation change: **072-biome-tint-rendering — VERIFIED**
- Next change: **073-animated-texture-metadata — NOT YET ACTIVE (artifacts pending)**
- 072 task ledger: **6 total tasks, 6 completed**
- 072 completion: **100%**
- 072 mandatory biome-tint-rendering requirements: **PASS**
- 072 required-test gate: **PASS — unit 814/814, E2E 19/19**
- 072 advancement allowed: **Yes**
- Session-start head: `d282bbb01b4eabbdc76daaa05e78ccff81f2d685`
- Validated head: `4739693bdd0a28833ece5bf3948ab69c8a771b28`
- Next exact action: **Advance to 073-animated-texture-metadata. Author proposal/design/tasks/specs/verification via SPEC_AUTHORING_PROTOCOL.md (073 artifacts NOT yet present — authoring is a hard pre-implementation block), validate, implement animated-texture metadata (frame timing/order for texture atlases; deterministic, data-model level), verify full gate, commit + push, advance program state.**

## What 072 implemented

Change 072 adds biome-controlled tint attributes for grass/foliage/water-like surfaces.

- `src/data/BlockModel.ts` — `TintKind` (`'grass' | 'foliage' | 'water'`) and optional
  `BlockModelFace.tintindex`; `validateBlockModel` accepts and preserves the three kinds and rejects
  unknown/non-string values with descriptive errors.
- `src/data/Biome.ts` — exports `DEFAULT_WATER_COLOR` (already the internal 016 fallback).
- `src/rendering/BiomeTint.ts` (NEW) — `BiomeTint { kind, color, rgb }`, `biomeTintColor(biome,
  kind)`, `biomeTint(biome, kind)`: grass → `grassColor`, foliage → `foliageColor`, water →
  `waterColor ?? DEFAULT_WATER_COLOR`; `rgb` via `biomeColorToRGB`. Pure and deterministic.
- `tests/unit/BiomeTint.test.ts` (NEW) — 7 tests; `tests/unit/BlockModel.test.ts` extended with 3
  `tintindex` tests (10 new tests total).

## Validation evidence (072)

- typecheck: PASS (`tsc --noEmit`)
- lint: PASS (`eslint .`)
- unit: PASS 814/814 (prior 804 + 10 new), stable across repeated runs
- production build: PASS (`tsc --noEmit && vite build`)
- E2E: PASS 19/19

## Advancement decision

Change 072 is **VERIFIED** at 6/6 (100%). All gates are green: typecheck, lint, the new 072 suites,
the full unit suite (814/814, stable), production build, and the required E2E suite (19/19). No
advancement exception was needed.

## Next change: 073 (pending artifacts)

`073-animated-texture-metadata` is named in `CHANGE_SEQUENCE.md` with scope "Animated texture
metadata (frame timing/order) for texture atlases." Per `AGENTS.md`, a change lacking full artifacts
is a hard pre-implementation block. Author and validate those artifacts via
`SPEC_AUTHORING_PROTOCOL.md` before any production code.

## Resume rule

A future session must first inspect current `origin/main`, this state, and the 072 verification.
Change 073 is the next change; its artifacts must be authored and validated before implementation
begins.
