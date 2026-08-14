# Tasks: 072-biome-tint-rendering

> VERIFIED. Entry gate confirmed (071 VERIFIED; baseline 804 unit / 19 e2e green).

- [x] 1. Confirm entry gate (071 VERIFIED; baseline 804 unit / 19 e2e green).
- [x] 2. Add `TintKind` and `BlockModelFace.tintindex` to `src/data/BlockModel.ts`; extend `validateBlockModel` (accept/preserve the three kinds; reject unknown/non-string values).
- [x] 3. Export `DEFAULT_WATER_COLOR` from `src/data/Biome.ts` (additive).
- [x] 4. Add `src/rendering/BiomeTint.ts` (`BiomeTint`, `biomeTintColor`, `biomeTint`; grass/foliage/water mapping with water fallback; `rgb` via `biomeColorToRGB`).
- [x] 5. Add `tests/unit/BiomeTint.test.ts` (grass/foliage/water resolution incl. swampland explicit water and plains fallback; `biomeTint` payload; determinism; all 10 default biomes × 3 kinds); extend `tests/unit/BlockModel.test.ts` for `tintindex`.
- [x] 6. Run typecheck, lint, new tests, full unit suite, build, E2E; record evidence; mark VERIFIED; commit impl+test+dir; update PROGRAM_STATE; push; advance.
