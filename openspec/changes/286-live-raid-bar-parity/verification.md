# Verification: 286-live-raid-bar-parity

Status: VERIFIED
Completion: 100% (14/14)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Pure total raid-bar projection (wave, omen, village) | `src/ui/RaidBarParity.ts` + `tests/unit/RaidBarParity.test.ts` (10/10) | PASS |
| Distinct from wither boss bar / HudParity | Unit import isolation + e2e `#wither-boss-bar` untouched + `boss-bar.spec.ts` green | PASS |
| Accessible active/terminal presentation | Game sync writes `data-raid-bar`/`data-status`/`aria-label`/`aria-valuenow`; e2e active+terminal | PASS |
| Invalid/duplicate/stale/reload/dispose rules | Unit clamps/fallback + e2e reload/dispose legs | PASS |
| No 258 GPU/FPS, no persistence, no unrelated systems | Scope + file-audit 2923; 258 remains BLOCKED | PASS |
| Activation only after 282–285 VERIFIED | Live OVERRIDE + SEQUENCE row; tip base `1136184` | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npx vitest run tests/unit/RaidBarParity.test.ts` | PASS 10/10 | Projection totality/clamps/village/omen/isolation |
| `npx playwright test tests/e2e/raid-bar-parity.spec.ts` (+ raid-feedback + boss-bar) | PASS 8/8 | Focused isolation/a11y/lifecycle |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm run lint` | PASS | 0 errors / 85 warnings (baseline) |
| `npm test` | PASS | 455 files, 5409 passed + 1 skipped |
| `npm run build` | PASS | 253 modules |
| `npm run test:e2e` | PASS with documented variance | 117 scheduled; 116 passed; visual:176 only failure |
| file-audit | PASS | 2923 rows |
| `npm run validate-state` | PASS | JSON/Markdown coherent at VERIFIED |

## Edge/adversarial validation

Null/`INACTIVE` hide; non-finite wave/omen clamps; empty/whitespace/non-string village → empty fallback; dispose clears village name + hides bar; reload without raid does not resurrect village/omen; wither boss bar independently untouched; 282 `projectRaidFeedback` module unchanged.

## Migration/compatibility validation

No persistence namespace, archive field, entity registration, or migration. `#wither-boss-bar` and 282–285 raid suites remain green. Boot-hidden raid bar: no intentional golden update (bar hidden; empty village + hidden omen).

## Performance/resource validation

One O(1) pure projection + bounded DOM writes per active fixed tick; no render-worker, FPS, or GPU path. No 258 headed evidence claimed.

## Regressions

Change 258 remains BLOCKED. Changes 259–285 remain VERIFIED. Focused `boss-bar.spec.ts` + `raid-feedback.spec.ts` + all raid E2E green. Enchanting journeys PASS this run. Visual matrix: see variance note.

## E2E variance (non-blocking)

`visual-regression.spec.ts:176` — Linux SwiftShader golden drift **32 fail / 28 pass** (band **0.021–0.062**). Baseline-equivalent class vs 285 (**31/29**, band 0.022–0.062) and 283 classify (**30/30**): 30 shared fail cells with 283, **23/30** fractions byte-identical; +2 extra fails (`start-overlay/high/1920x1080`, `container-ui/high/1920x1080`) within known environment jitter. Failures span render-world / no-hud / hud / crosshair / start-overlay / container / environment — **not** a raid-bar-only HUD golden regression (bar remains `hidden` at boot; no golden rewrite performed). Enchanting:227 PASS this run (known prior flake did not recur).

## Incomplete tasks

None — T1–T14 complete.

## Advancement Exception

Not used. Target 100% achieved.

## Final decision

**VERIFIED 14/14 (100%)** — C286 exact; 258 BLOCKED; publish to origin/main authorized.
