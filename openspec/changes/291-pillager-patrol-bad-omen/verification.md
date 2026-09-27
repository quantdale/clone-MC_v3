# Verification: 291-pillager-patrol-bad-omen

Status: VERIFIED
Completion: 100% (11/11)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Gate precedence | `PillagerPatrol.test.ts` one case per reason (10) + 2 precedence cases + no-draw assertions + untouched-stream check + night boundaries 12541/12542/23459/23460; e2e fresh world `SKIP WORLD_TOO_YOUNG`, `SKIP RAID_ACTIVE` during raid | PASS |
| Chance and position rules | unit CHANCE after exactly 1 draw; NO_SURFACE after exactly 4 probes; throwing probe → NO_SURFACE; 200-seed offset bounds [24, 47] per axis | PASS |
| Group composition with exactly one captain | unit 200 seeds: size ∈ [2, 4], sizes 2/3/4 all observed, exactly one captain, captain first at anchor, members within ±4; member omission keeps captain; recording backend spawns only `pillager`; e2e forced patrol 2–4 planned members, one captain | PASS |
| Determinism | unit two systems seed 1234 → deep-equal 20-attempt cooldown/decision sequences; seed 4321 differs | PASS |
| Rate limit | unit 30000 ticks → 4–5 natural attempts, first ≥ 6000, gaps ∈ [6000, 6599], ≤ 1 captain / ≤ 4 members at every tick; lazy context built only when due; PATROL_ALIVE; forceSpawn leaves cooldown unchanged; e2e cooldown ∈ [6000, 6600) | PASS |
| Reuse of raider backend and combat | `createEntityManagerRaidBackend` over dedicated patrol `EntityManager` + dedicated `RaiderCombatSystem`; unit combat hits with reason `pillager`; unit player-melee captain kill; rollback with `failSpawnAfter: 1` (5 seeds); e2e player HP drops from patrol combat | PASS |
| Captain kill grants Bad Omen | unit non-captain 0 / captain 1 / duplicate no-op; `LivePillagerPatrol.test.ts` 0→1 and stacking capped at 5 over 7 captains; e2e non-captain 0, captain 1, duplicate false, cap 5 stays 5; despawn beyond 128 and clear grant nothing (unit) | PASS |
| Raid isolation | Live unit: VICTORY raid object identity + JSON unchanged after captain kill; raid wave kills never grant (grantCalls 0); raid start dismisses patrol; patrol kill does not change `raidersRemaining`; Game source guards (raid death choke has no omen, captain handler has no raid state, `PillagerPatrol.ts` has no RaidStateMachine import); e2e raid state null before/after captain kill, raid start → patrol 0, raid kills → omen 0 | PASS |
| Lifecycle safety | patrol tick only in unpaused fixed tick (after 285 evaluate); dispose/pagehide `clear`; e2e reload → no patrol, omen 0 (Bad Omen ephemeral per 285) | PASS |
| 258 stays BLOCKED | no headed FPS/GPU work, no GPU evidence, no goldens touched | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npx vitest run tests/unit/PillagerPatrol.test.ts tests/unit/LivePillagerPatrol.test.ts | PASS | 2 files, 46 tests |
| npx playwright test tests/e2e/pillager-patrol.spec.ts --repeat-each 3 | PASS | 6/6 |
| npm run typecheck | PASS | clean |
| npm run lint | PASS | 0 errors / 85 warnings (pre-existing count, unchanged) |
| npm test | PASS | 463 files, 5504 passed + 1 skipped (+46 vs 290's 5458) |
| npm run build | PASS | 259 modules |
| npm run test:e2e | PASS* | 124 passed / 1 failed (visual:176 only); pillager-patrol 2/2; enchanting:227 green; all raid/omen/HOTV/village E2E green |
| node scripts/validate-file-audit.mjs …/file-audit-manifest.json | PASS | 2969 rows (+10) |
| npm run validate-state | PASS | |

\* Visual matrix Linux SwiftShader drift: **30 fail / 30 pass**, fail band
**0.022–0.062** — baseline-equivalent class vs 290 (29/31, 0.022–0.062) and the
owner-noted band (~28–32 of 60 in 0.02–0.062). Patrol/raid entities are not
rendered and a fresh capture world can never spawn a patrol (WORLD_TOO_YOUNG +
≥6000-tick cooldown), so 291 cannot affect those pixels. Non-blocking; no
golden churn; no 258 headed work.

## Edge/adversarial validation

Non-finite player/world ticks/day tick, throwing surface probe, all-null
surfaces, member-surface omission, partial spawn failure rollback, duplicate
deaths, captain death with survivors (patrol stays alive, captain null),
distance despawn, raid-start dismissal, forced spawn replacement, omen cap —
all covered by unit and/or e2e.

## Migration/compatibility validation

No stored-data change, no new namespace. Patrols/cooldown/Bad Omen transient;
reload proven in e2e. Existing raid persistence (283) untouched.

## Performance/resource validation

≤ 4 entities, one patrol, inherited projectile cap 32; attempt cost ≤ 7 surface
lookups + one cached village query at most once per 6000 ticks; per-tick
O(roster). Lazy context proven by unit. No GPU work.

## Regressions

None functional. Visual SwiftShader drift classified non-blocking as above;
enchanting:227 green in the full suite.

## Incomplete tasks

None.

## Advancement Exception

Not applicable (100%).

## Final decision

**VERIFIED 11/11 (100%)**. Publish to `origin/main`. Change 258 remains
BLOCKED. Next exact action: author a spec-first OpenSpec package for **292**
(not started).
