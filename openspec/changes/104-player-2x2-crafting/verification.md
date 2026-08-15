# Verification: 104-player-2x2-crafting

Status: VERIFIED
Completion: 100%
Advancement allowed: true

104 started only after 103 was VERIFIED (390a40b / 33d5a44).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Grid construction | `CraftingGrid.test.ts`: valid 1x1/2x2/3x3/1x2/2x1 grids and slot-provided grids accepted; zero/oversize/fractional dimensions, mismatched slot counts, empty items, and non-positive counts rejected; `setCraftingSlot` returns new grids (original unchanged) and rejects out-of-bounds cells and bad slots | PASS |
| Shaped matching | wooden_pickaxe pattern matches its exact 3x3 grid; does NOT match a 2x2 grid (pattern too large), a grid with an extra filled cell outside the pattern, or an all-sand grid; empty-cell equivalence verified implicitly | PASS |
| Shapeless matching | 4-sand glass recipe matches a full 2x2 sand grid; wrong item or wrong multiplicity do not match | PASS |
| First match wins | the first recipe in input order is returned when both match | PASS |
| Consumption | shaped: result exact + consumed cells equal the pattern-covered cells (5 cells for the pickaxe); shapeless: all 4 filled cells; non-matching recipe and processing recipes return null; deterministic | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/CraftingGrid.test.ts` | PASS | 14/14 |
| `npm test` | PASS | 117 files, 1162/1162 (1148 baseline + 14 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.19s |
| `npm run test:e2e` | PASS | 19/19 (1.3m) |

## Edge / adversarial validation

- Construction matrix covers all grid sizes and malformed shapes; immutability verified by
  asserting the original grid after updates.
- Shaped matching vectors cover exact fit, too-large patterns, extra filled cells, and wrong
  items; shapeless covers order independence via multiset (order-irrelevant by construction)
  and multiplicities; first-match order verified; consumption coordinates exact for both
  kinds; processing recipes never craft.

## Migration / compatibility validation

Additive: new `src/inventory/CraftingGrid.ts` + test file. The 010 one-click path and the 103
recipe registry are untouched.

## Performance / resource validation

Matching O(recipes x grid cells) with grids at most 3x3. Unit suite duration unchanged (~10s,
117 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1162/1162 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 104 the true 2x2 ingredient grid and result consumption semantics are in place.
Advance to 105-crafting-table-3x3.
