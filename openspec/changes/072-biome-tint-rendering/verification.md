# Verification: 072-biome-tint-rendering

Status: VERIFIED
Completion: 100%
Advancement allowed: true

072 started only after 071 was VERIFIED (2f4b637 / 625d557).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Face tint attribute | `BlockModel.test.ts`: all three kinds (`grass`/`foliage`/`water`, incl. combined with `cullface`) accepted and preserved verbatim; `'leaves'`/`'redstone'`/`1`/`null` rejected with `/tintindex/i` errors; models without `tintindex` validate unchanged (`tintindex` undefined on faces) | PASS |
| Tint resolution | `BiomeTint.test.ts`: grass → `plains.grassColor 0x7cbd6b`; foliage → `jungle.foliageColor 0x4b9c3a`; water → `swampland.waterColor 0x4e7a4e` when present; water → `DEFAULT_WATER_COLOR 0x3f76e4` for a custom definition without `waterColor` (the default registry's `def()` helper always fills the field, so the fallback is tested on an explicit minimal definition) | PASS |
| Attribute payload | `biomeTint(forest, 'grass')` returns `{ kind: 'grass', color: 0x79c05a, rgb: { r: 0x79, g: 0xc0, b: 0x5a } }`; rgb round-trip repacks to `color` for every biome/kind | PASS |
| Purity and coverage | Determinism assertions (repeated calls equal); all 10 default biomes × 3 kinds resolve to integers in [0, 0xFFFFFF] with correct water semantics | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/BiomeTint.test.ts` | PASS | 7/7 |
| `npm test` | PASS | 84 files, 814/814 (804 baseline + 10 new: BiomeTint 7, BlockModel tintindex 3); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.40s |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- Unknown `tintindex` values (`'leaves'`, `'redstone'`, number, null) all throw descriptive errors naming the invalid value; `undefined` (absent) is valid and preserved as absent.
- Combined face fields (`tintindex` + `cullface`) validate together.
- Water fallback exercised on a definition that genuinely omits `waterColor` (the default registry fills the field via its `def()` helper default).
- RGB split verified by exact component values and by repacking to the packed color for every default biome and kind.

## Migration / compatibility validation

Additive: optional `BlockModelFace.tintindex`, new exported `DEFAULT_WATER_COLOR` constant (already the internal 016 default — value unchanged), new `src/rendering/BiomeTint.ts`. Models without `tintindex` validate and behave identically (explicit test). No serialized-data changes.

## Performance / resource validation

Resolver is O(1) and allocation-free for `biomeTintColor`; `biomeTint` allocates one object. Validation adds one string check per face. Unit suite duration unchanged (~8s, 84 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 814/814 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 072 tint attributes (`tintindex` on model faces) and deterministic biome tint resolution (grass/foliage/water with shared water fallback) are in place. Advance to 073-animated-texture-metadata.
