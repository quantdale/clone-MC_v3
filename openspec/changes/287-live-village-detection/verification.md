# Verification: 287-live-village-detection

Status: VERIFIED
Completion: 100% (11/11)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Pure bed-scan village detection (loaded-only, deterministic) | `src/simulation/VillageDetectionRules.ts` + `tests/unit/VillageDetectionRules.test.ts` (11/11) | PASS |
| Game live default VillageQuery + cache/bounds | `Game.queryLiveVillage` / `setVillageQuery(null)` restore live + `tests/unit/LiveVillageDetection.test.ts` (8/8) | PASS |
| Pause/dispose/reload safety; no new persistence | Live wiring oracle + dispose clears cache; no `__village__` key | PASS |
| Unit + browser journey (beds→raid; override→no raid) | Focused unit 35 + e2e `village-detection.spec.ts` 2/2 | PASS |
| No 258 GPU/FPS; no outposts/villagers/HOTV/worldgen | Scope + file-audit 2933; 258 remains BLOCKED | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npx vitest run tests/unit/VillageDetectionRules.test.ts tests/unit/LiveVillageDetection.test.ts …` | PASS | Pure + wiring + BadOmen suites |
| `npx playwright test tests/e2e/village-detection.spec.ts` | PASS 2/2 | Place bed→raid; null override→NO_VILLAGE |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm run lint` | PASS | 0 errors / 85 warnings (baseline) |
| `npm test` | PASS | 457 files, 5428 passed + 1 skipped |
| `npm run build` | PASS | 254 modules |
| `npm run test:e2e` | PASS with documented variance | 119 scheduled; 117 passed; 2 known non-blocking failures |
| file-audit | PASS | 2933 rows |
| `npm run validate-state` | PASS | JSON/Markdown coherent at VERIFIED |

## Edge/adversarial validation

No beds → null; out-of-range bed ignored; unloaded columns skipped; non-finite player → null; determinism of multi-bed center; cell budget ≤ 8192; resample tick/move thresholds; override `() => null` bypasses live beds; pause freezes; dispose clears cache; probe throw fail-closed.

## Migration/compatibility validation

No persistence namespace, archive field, entity registration, or migration. 285 fixture VillageQuery paths remain green. `setVillageQuery(null)` now restores the live detector (documented); tests needing absence inject `() => null`.

## Performance/resource validation

Volume `(2*12+1)^2*(2*5+1)=6875` ≤ `VILLAGE_MAX_CELLS` 8192; resample ≤ 1/20 ticks unless move ≥4. No workers, GPU, or FPS path. No 258 headed evidence claimed.

## Regressions

Change 258 remains BLOCKED. Changes 259–286 remain VERIFIED. All raid E2E green including village-detection 2/2 and bad-omen 2/2.

## E2E variance (non-blocking)

- `visual-regression.spec.ts:176` — Linux SwiftShader golden drift **29 fail / 31 pass** (band **0.022–0.062**). Baseline-equivalent class vs 286 (**32/28**, band 0.021–0.062). Failures span render-world / no-hud / hud / crosshair / start-overlay / container / environment — **not** a village-detection HUD golden regression (no new HUD widgets).
- `enchanting.spec.ts:227` — known reload flake **recurred** this run and on a focused retry (still FAIL). Documented honestly; not invented green. Prior 286 run had PASS.

## Incomplete tasks

None — T1–T11 complete.

## Advancement Exception

Not used. Target 100% achieved.

## Final decision

**VERIFIED 11/11 (100%)** — C287 exact; 258 BLOCKED; publish to origin/main authorized.
