# Verification: 095-placed-feature-core

Status: VERIFIED
Completion: 100%
Advancement allowed: true

095 started only after 094 was VERIFIED (e350281 / b1da26a).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Modifier validation | `PlacedFeature.test.ts`: all five documented modifiers accepted; unknown type, zero/negative/fractional tries/chance, non-integer minY/maxY, minY > maxY, empty/blank/non-string biomeKeys all rejected with field-naming errors | PASS |
| Placed feature validation | keyed feature with full chain accepted; empty key/featureKey and non-array modifiers rejected; two count modifiers and survivalFilter without preceding heightRange rejected | PASS |
| Deterministic placement | count expands candidates; heightRange samples uniformly and inclusively (draw 0 → minY, draw 0.9999 → maxY); rarity keeps iff draw < 1/chance and chance 1 always keeps while consuming a draw; biomeFilter drops non-matching biome keys; survivalFilter probes the exact placed coordinates; full chain applies in data order with exactly one draw per rarity/height candidate; identical feature/context/seed runs twice produce identical positions | PASS |
| Registry | register/get/has/size/clear round-trip; duplicate key and invalid placed feature rejected atomically (size unchanged, absent key stays absent) | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/PlacedFeature.test.ts` | PASS | 17/17 |
| `npm test` | PASS | 108 files, 1061/1061 (1044 baseline + 17 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.25s |
| `npm run test:e2e` | PASS | 19/19 (1.4m) |

## Edge / adversarial validation

- Validation covers unknown types, missing/zero/negative/fractional parameters across all five
  modifier shapes, non-integer/inverted height ranges, and empty/blank/non-string biome keys.
- Chain invariants (at most one count; survivalFilter after heightRange) verified at validation
  and registration.
- Scripted-rng tests pin the exact draw order and count (rarity chance 1 consumes a draw;
  biomeFilter/survivalFilter consume none; a 5-modifier chain consumes exactly 4 draws).

## Migration / compatibility validation

Additive: new `src/worldgen/PlacedFeature.ts` + test file. No existing modules touched;
`featureKey` is a string reference resolved by later wiring (096/097).

## Performance / resource validation

Chain application O(candidates × modifiers); validation O(1) per modifier; registry O(1)
lookups. Unit suite duration unchanged (~9s, 108 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1061/1061 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 095 placement modifiers, counts, rarity, height, biome and survival filters are in
place and deterministic. Advance to 096-ore-generation.
