# Verification: 294-bad-omen-raid-escalation-and-death-parity

Status: VERIFIED
Completion: 100% (12/12)
Advancement allowed: true

Base: `origin/main` `6d9931e` (293 VERIFIED). Worktree
`/workspace/mc-worktrees/294`, branch
`wt/294-bad-omen-raid-escalation-and-death-parity`. Package commit `0e7452e`
precedes all implementation.

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| Escalation math | `tests/unit/RaidEscalation.test.ts`: wave table = `startRaid` for levels 0–5 (3,3,4,5,6,7); table cases 1+1→2 (3→4), 1+2→3 (3→5), 2+5→5 (4→7), 3+1→4 (5→6), 4+4→5 (6→7); status/center/waveIndex/raidersRemaining/ticks unchanged, input not mutated; cap 5+3 applied with level 5 / 7 waves; never shrinks a larger total; VICTORY/DEFEAT/INACTIVE and levels 0/−3/0.5/NaN/−∞ not applied (same object); oversized level clamps; next wave rolled at the escalated level (witch from 3). | PASS |
| Action resolution | `RaidEscalation.test.ts`: 285 NONE precedence kept (NO_OMEN/NO_VILLAGE/NOT_INSIDE/INVALID_CENTER); ACTIVE raid in village → `ESCALATE_RAID` with before/after preview; no raid / VICTORY / DEFEAT / 200 blocks away → `START_RAID`; `isRaidInVillage` strict 96-block 3D radius, NaN center false. `LiveBadOmen.test.ts` mirror updated (escalation instead of replacement; finished raid restarts). | PASS |
| Live escalation | `tests/unit/LiveRaidEscalation.test.ts`: same wave entities, patrol dismissed, omen 0 / remaining 0, raid + omen committed in one flush and reloaded together; escalated level-3 victory needs 5 waves and grants HOTV amplifier 2 (persisted); cap triggers consume omen without farming; far (150 blocks) raid replaced, finished raid restarted. Game source guards: resolver called with the live raid, ESCALATE branch order escalate → fail-closed → `pillagerPatrol.clear('raid-start')` → raidState → omen clear → bar → `saveRaid()` → `savePlayerStateDurable()`, no start/controller/combat calls. E2E `bad-omen-raid-escalation.spec.ts` test 1: START_RAID level 1 (3 waves) → forced patrol → omen 2 → `ESCALATE_RAID` 1→3 / 3→5, same wave ids/remaining/center, patrol empty, omen 0, `#raid-bar-omen` = "Bad Omen 3"; pagehide + reload keeps ACTIVE level 3 / 5 waves and omen 0; clearing wins after 5 waves with HOTV amplifier 2. Test 2: cap escalation 5→5 (7 waves) consumes omen; after VICTORY a new omen starts a fresh level-2 raid. | PASS |
| Death clears Bad Omen | `LiveRaidEscalation.test.ts`: death clears omen + effects durably (reload omen 0, no HOTV); death during an ACTIVE raid → DEFEAT, no HOTV, omen 0 in the same flush. Source guards: `respawnPlayer` clears effects → omen → remaining → durable save; the only `respawnPlayer()` call follows the death DEFEAT branch; "Bad Omen is retained on death" comment gone. `LiveStatusEffectPersistence.test.ts` respawn guard extended. E2E test 3: omen 3 persists across a reload (control), `debugKillPlayer` → omen 0 / remaining 0 with the death card open, reload → omen 0 / remaining 0. | PASS |

## Legacy alignment (T7)
- `tests/unit/LiveBadOmen.test.ts`: "active-raid replacement" case rewritten as
  escalation; added finished-raid restart case; mirror uses the 294 resolver.
- `tests/unit/LiveStatusEffectPersistence.test.ts`: mirror gains the
  escalation branch; source guard signature widened to `VillageOmenAction`;
  respawn guard includes the omen clear.
- `src/engine/Game.ts` comments (tick 5.8, `startRaidAt`, `respawnPlayer`).
- Design notes annotated as superseded/resolved: 285 `design.md` (replacement),
  291 `design.md` (escalation dismisses patrols), 292 `design.md` (restored
  omen escalation; death clear).
- `PARITY_MATRIX.md` C292 divergence notes marked resolved by C294.
- No 285/290/291/292 E2E asserted the old behaviour; all of them
  (bad-omen-acquisition, status-effect-persistence, hero-of-the-village,
  pillager-patrol, village-detection, raid-bar-parity, raid-persistence,
  death-respawn, hardcore-mode) pass unchanged (24/24 focused run).

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | exit 0 |
| npm run lint | PASS | 0 errors / 85 warnings (unchanged baseline) |
| npm test | PASS | 468 files, 5592 passed + 1 skipped (293: 466 / 5565+1; +27) |
| npm run build | PASS | 262 modules transformed |
| npx playwright test tests/e2e/bad-omen-raid-escalation.spec.ts | PASS ×4 isolated (3/3, ≈24.5 s each) | plus related legacy specs 24/24 |
| npm run test:e2e | 130 passed / 1 failed (131) in 30.2 min | only failure visual:176 (below); bad-omen-raid-escalation 3/3 (4.9 s / 1.6 s / 5.9 s); enchanting:227 green |
| file-audit | PASS | 2998 rows (+10) |
| npm run validate-state | PASS | |

## visual:176 SwiftShader drift (documented, not hidden)
`tests/e2e/visual-regression.spec.ts:176` fails on Linux headless SwiftShader
with the same class as 291–293: 30 fail / 30 pass of 60 cells, fail band
0.0222–0.0619 changed fraction, max pass 0.0187. Cell-by-cell against the 293
run: **0 status changes**; max per-cell fraction delta 0.0126. 294 changes no
rendering. Goldens untouched. Change 258 stays BLOCKED.

## Divergences (documented)
- Single raid slot: an omen in a village ≥ 96 blocks from the ACTIVE raid
  still replaces it (vanilla would run a second raid).
- Wave totals follow the 152 omen table, not vanilla difficulty-based group
  counts; Raid Omen (1.20.5+) not modelled.
- A Bad Omen saved before a death that happened pre-294 is not retroactively
  cleared (only new deaths clear).
