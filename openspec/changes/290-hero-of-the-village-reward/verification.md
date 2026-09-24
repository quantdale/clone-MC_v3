# Verification: 290-hero-of-the-village-reward

Status: VERIFIED
Completion: 100% (11/11)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Exactly-once VICTORY grant | `HeroOfTheVillage.test.ts` predicate; `LiveHeroOfTheVillage.test.ts` win-once; e2e victory grant | PASS |
| DEFEAT grants nothing | Live unit forceDefeat; e2e DEFEAT path | PASS |
| Level/duration mapping | unit mapping + registry amp4/2400s; Live omen3→amp2 | PASS |
| Emerald discount + floor 1 | unit `discountEmeraldCount` (9→7, 1→1, 3@amp0→3); Live librarian discount | PASS |
| Trading UI shows discount | e2e `#trading-offers` shows `7× Emerald` then restores `9×` | PASS |
| Expiry restores prices | Live clear/tick expiry; e2e `debugClearHeroOfTheVillage` | PASS |
| Reload no double grant | e2e reload after VICTORY → amp null, no hero effect | PASS |
| No new persistence namespace | design + diff (ephemeral `playerEffects` only) | PASS |
| 258 stays BLOCKED | no headed FPS/GPU work; no fake evidence | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | clean |
| npm run lint | PASS | 0 errors / 85 warnings (pre-existing) |
| npm test | PASS | 461 files, 5458 passed + 1 skipped |
| npm run build | PASS | 258 modules |
| npm run test:e2e | PASS* | 122 passed / 1 failed (visual:176 only); HOTV 2/2 green; enchanting:227 green |
| file-audit | PASS | 2959 rows |
| npm run validate-state | PASS | |

\* Visual matrix SwiftShader drift: **29 fail / 31 pass**, fail band **0.022–0.062** — baseline-equivalent class vs 289 (31/29) and owner-noted band ~28–32 / 0.02–0.062. Non-blocking; no golden churn; no 258 headed work.

## Edge/adversarial validation

Amp clamp, emerald floor 1, already-VICTORY ticks, hydrate VICTORY, DEFEAT, dispose-safe grant helper covered by unit + e2e.

## Migration/compatibility validation

No new namespace; `__trades__` / `__raid__` unchanged. Effects remain ephemeral (documented).

## Performance/resource validation

O(1) grant check; no GPU work.

## Regressions

None functional. Visual SwiftShader drift classified non-blocking as above. Enchanting:227 stayed green in full suite.

## Incomplete tasks

None.

## Advancement Exception

Not applicable (100%).

## Final decision

**VERIFIED 11/11 (100%)**. Publish to `origin/main`. Change 258 remains BLOCKED. Next exact action: author spec-first OpenSpec package for **291** (not started).
