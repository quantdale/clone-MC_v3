# Verification: 079-lava-flow-simulation

Status: VERIFIED
Completion: 100%
Advancement allowed: true

079 started only after 078 was VERIFIED (d67be5f / 244948f).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Spread range | range 3: chain 1→2→3 then the level-3 edge does not spread (neighbor stays null, `changed false`); range 7: chain reaches 7 then stops | PASS |
| Ground conversion | falling lava over a solid floor converts to flowing 2 (range 3 − 1); the base spreads level 3 on its next step (pool formation) | PASS |
| Shared water rules | downward spawn of falling 8 (`affected [[x,y-1,z]]`); source formation from two horizontal sources; decay ladder: isolated 2 → 3, then removal at the range level; falling-neighbor protection inherited (078 tests) | PASS |
| Range validation | 0, -1, 2.5, NaN all rejected with `/spreadRange/i` | PASS |
| Fluid isolation | `stepLavaCell` on a water cell → no-op; `stepWaterCell` on a lava cell → no-op | PASS |
| Determinism | identical worlds → identical results and snapshots | PASS |
| Cadence | `LAVA_FLOW_INTERVAL === 30` (slower than water's 5) | PASS |

078 correctness amendment (bundled, per final spec reconciliation): ground conversion now produces
level 6 (max − 1) so waterfall bases can spread pools; level-7 cells never spread (no endless edge
crawl). Water engine + 3 amended tests + 078 design/spec/verification docs updated; the lava engine
mirrors the corrected rules.

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/LavaFlowEngine.test.ts tests/unit/WaterFlowEngine.test.ts` | PASS | 10/10 + 18/18 (amended) |
| `npm test` | PASS | 91 files, 896/896 (886 baseline + 10 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.33s |
| `npm run test:e2e` | PASS | 19/19 (1.6m) |

## Edge / adversarial validation

- Both dimension ranges (3 and 7) verified at their exact edges: the range-level cell never spreads and the corridor cell beyond stays empty.
- Ground conversion level and subsequent pool spread verified as a two-step chain.
- Decay ladder verified at the boundary (2 → 3 → removed for range 3).
- Invalid range shapes (0, negative, fractional, NaN) all rejected before any world access.
- Cross-engine no-ops verified in both directions.

## Migration / compatibility validation

Additive: new `src/simulation/LavaFlowEngine.ts` + test file; 078 types reused without modification. The 078 amendment changes published behavior deliberately (correctness fix) and is documented in 078's verification.md amendment section; its spec/design/tests were reconciled in the same commit.

## Performance / resource validation

Same as 078: O(1) reads/writes per step. Unit suite duration unchanged (~8s, 91 files).

## Regressions

None after the amendment: full baseline gate green — typecheck, lint, unit 896/896 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 079 slower, dimension-aware lava propagation (range parameter, cadence 30) is in place,
and 078's flow rules were corrected to prevent endless edge crawl and enable pool formation.
Advance to 080-water-lava-interactions.
