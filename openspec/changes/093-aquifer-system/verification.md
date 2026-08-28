# Verification: 093-aquifer-system

Status: VERIFIED
Completion: 100%
Advancement allowed: true

093 started only after 092 was VERIFIED (13cff43 / a5abd9d).

## Requirement evidence

| Requirement | Evidence | Status |
| --- | --- | --- |
| Classification | `AquiferSystem.test.ts`: exact y-table with dryness forced off (dryThreshold 1.1 — fbm bound ±1.75 never exceeds): above sea → NONE, between → WATER, at lavaLevel -54 → WATER (exclusive), below → LAVA; dryness forced on (-2) → NONE below sea; default config: 50 samples deterministic and within {WATER, LAVA, NONE} | PASS |
| Application | with a window-relative table (sea -40, lava -54): carved below -54 → lava id, between -54 and -40 → water id, carved above sea → air; non-carved cells preserved 1:1; input untouched (spot check) | PASS |
| Config validation | NaN dryThreshold, fractional seaLevel, lavaLevel >= seaLevel all rejected with `/invalid config/i` (classification and application) | PASS |
| Determinism | default-config classification stable; applyAquifers double-run deeply equal across the window | PASS |

## Commands

| Command | Result | Evidence/notes |
| --- | --- | --- |
| `npm run typecheck` | PASS | `tsc --noEmit` clean |
| `npm run lint` | PASS | `eslint .` clean |
| `npx vitest run tests/unit/AquiferSystem.test.ts` | PASS | 8/8 |
| `npm test` | PASS | 106 files, 1038/1038 (1030 baseline + 8 new); run twice, stable |
| `npm run build` | PASS | `dist/` built in 1.24s |
| `npm run test:e2e` | PASS | 19/19 (1.5m) |

## Edge / adversarial validation

- Boundary semantics pinned: `lavaLevel` is exclusive (a cell AT lavaLevel is WATER; one below is LAVA). One hand-corrected test expectation during development.
- Dryness thresholds chosen outside the fbm bound (±1.75) make the exact-table tests deterministic.
- A spot-check over 60 positions spanning above-sea/below-lava ranges yields ≥ 2 decision kinds with the default config.

## Migration / compatibility validation

Additive: new `src/worldgen/AquiferSystem.ts` + test file. 088/092 consumed as-is; no existing modules touched.

## Performance / resource validation

Classification O(1) (one fbm3); application O(carved cells). Unit suite duration unchanged (~7.5s, 106 files).

## Regressions

None. Full baseline gate green: typecheck, lint, unit 1038/1038 (×2), build, E2E 19/19.

## Incomplete tasks

None.

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. 093 underground water/lava aquifer decisions are in place. Advance to 094-configured-feature-core.
