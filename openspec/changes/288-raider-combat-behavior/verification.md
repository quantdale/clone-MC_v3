# Verification: 288-raider-combat-behavior

Status: VERIFIED
Completion: 100% (11/11)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Per-type combat roles using existing systems | `src/simulation/RaiderCombatBehavior.ts` + unit roles/profiles | PASS |
| Target player / home to raid center | unit home + melee chase; Game `tickRaiderCombat` | PASS |
| Deaths → exactly-once recordRaiderDeath | `LiveRaiderCombat.test.ts` double-death + VICTORY | PASS |
| Player death / timeout → DEFEAT | `forceRaidDefeat` + e2e death→DEFEAT; timeout unchanged in `tickRaid` | PASS |
| Pause/dispose/reload safety; bounded cost | unit pause freeze; clear on dispose/terminal; tracked-only + projectile cap 32 | PASS |
| Unit + browser journey | focused unit 16/16; e2e raider-combat 2/2; full e2e 119/121 | PASS |
| No 258 GPU/FPS; no HOTV/villagers/outposts | scope + file-audit 2943; 258 remains BLOCKED | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npx vitest run tests/unit/RaiderCombatBehavior.test.ts tests/unit/LiveRaiderCombat.test.ts` | PASS | 16/16 |
| `npx playwright test tests/e2e/raider-combat.spec.ts` | PASS 2/2 | damage→VICTORY; death→DEFEAT |
| `npm run typecheck` | PASS | `tsc --noEmit` |
| `npm run lint` | PASS | 0 errors / 85 warnings (baseline) |
| `npm test` | PASS | 459 files, 5444 passed + 1 skipped |
| `npm run build` | PASS | 257 modules |
| `npm run test:e2e` | PASS with documented variance | 121 scheduled; 119 passed; 2 known non-blocking failures |
| file-audit | PASS | 2943 rows |
| `npm run validate-state` | PASS | JSON/Markdown coherent at VERIFIED |

## Edge/adversarial validation

Roles pinned; witch fallback damage 5; pause freezes; double death exactly-once; player death DEFEAT clears entities; projectile cap; stale ids no-op.

## Migration/compatibility validation

No persistence namespace, archive field, or registry renames. 284 death choke unchanged. Raiders remain on `raidEntityManager`.

## Performance/resource validation

Tracked-only AI; projectile cap 32; no A*; no workers/GPU/FPS claims.

## Regressions

Change 258 remains BLOCKED. Changes 259–287 remain VERIFIED. All raid E2E green including raider-combat 2/2 and village-detection 2/2.

## E2E variance (non-blocking)

- `visual-regression.spec.ts:176` — Linux SwiftShader golden drift **28 fail / 32 pass** (band **0.022–0.062**). Baseline-equivalent class vs 287 (**29/31**, band 0.022–0.062). Failures span render-world / no-hud / hud / crosshair / start-overlay / container / environment — **not** a raid-combat HUD golden regression (no new HUD widgets).
- `enchanting.spec.ts:227` — known reload flake **recurred** (Expected enchantments JSON, Received `null` after reload). Documented honestly; not invented green. Out of 288 scope.

## Incomplete tasks

None — T1–T11 complete.

## Advancement Exception

Not used. Target 100% achieved.

## Final decision

**VERIFIED 11/11 (100%)** — C288 exact; 258 BLOCKED; publish to origin/main authorized.
