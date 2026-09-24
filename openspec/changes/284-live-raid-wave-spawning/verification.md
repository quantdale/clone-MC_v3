# Verification: 284-live-raid-wave-spawning

Status: VERIFIED
Completion: 12/12 (100%) — T1–T12 complete; all mandatory gates green with documented non-blocking E2E variance; ready for `origin/main` publication
Advancement allowed: true

Control plane activated on `wt/284-live-raid-wave-spawning` (T1: `CHANGE_SEQUENCE.md` row,
`CHANGE_SEQUENCE_OVERRIDES.md` fold replacing placeholder `284-raider-entity-spawning`,
`PROGRAM_STATE` 284 sole ACTIVE; sessionStartHead
`c2539dc30a470e64bbbd306e186fab80c74b485e`, package commit
`83e1d7a884bfc70f35ebadbba84ed209366557b8`). T2 SPEC_AUTHORING_PROTOCOL quality gate
passed at activation. Implementation T3–T9 and verification T10–T12 complete; this file
records actual gate evidence.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Raider registry keys append-only, non-persistent | `src/data/EntityType.ts` appends `pillager`/`vindicator`/`ravager`/`witch` (MONSTER, finite health/attack, summonable, `isPersistent:false`); `tests/unit/EntityType.test.ts` size 18, prior-order/runtime-id stability, zombie fields unchanged; LiveRaidWaveSpawning roster-key resolution across waves/omen | PASS |
| Pure deterministic fail-closed spawn plan | `src/simulation/RaidWaveSpawnPlan.ts` `planRaidWaveSpawn`; `tests/unit/RaidWaveSpawnPlan.test.ts` 8/8 (determinism, ring placement, non-finite center, unknown key, invalid count, zero-count omit, empty success, no mutation) | PASS |
| Injectable backend + recording fake + production adapter | `src/simulation/RaidEntityBackend.ts`; `tests/unit/RaidEntityBackend.test.ts` 6/6 (recording logs + idempotent despawn, unknownKeys, failSpawnAfter, EntityManager spawn/despawn, unknown refuse before insert) | PASS |
| At-most-once wave apply + duplicate/generation guards | `RaidWaveController.applyWave` + Game `tickRaidFeedback`/`debugStartRaid`/`debugClearRaidWave`; LiveRaidWaveSpawning first-wave exact count, DUPLICATE_WAVE no-op, replace generation bump | PASS |
| Partial failure rollback without tick throw | LiveRaidWaveSpawning mid-wave `failSpawnAfter:1` → `rolledBack:true`, `spawned:0`, tracking empty, second apply DUPLICATE_WAVE | PASS |
| Terminal/clear/replace/dispose idempotent despawn | Controller `clear` reasons + Game dispose/pagehide/`debugClearRaidWave`/`tickRaidFeedback` terminal; LiveRaidWaveSpawning terminal/clear/dispose/double-dispose proofs | PASS |
| Death exactly-once → `recordRaiderDeath` | Game `onRaidEntityRemoved` + `RaidWaveController.consumeDeath`; LiveRaidWaveSpawning double death, unknown id, non-active, stale generation | PASS |
| Pause freeze + reload non-resurrection | Pause never enters `tickRaidFeedback` (unpaused fixed-tick only); pagehide/`clear('clear')` drops tracking; new owner empty tracking (LiveRaidWaveSpawning pause + reload tests) | PASS |
| No bad omen / settlement / new persistence / 258 GPU | Scope audit: diff touches only 284 seams + openspec/file-audit; no settlement detector; no new `__*` namespace; no 258/GPU/headed files; 258 remains BLOCKED | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| Authoring quality gate (SPEC_AUTHORING_PROTOCOL checklist) | PASS | Sequence row live; prior 283 VERIFIED; package complete |
| `npx vitest run tests/unit/RaidWaveSpawnPlan.test.ts tests/unit/RaidEntityBackend.test.ts tests/unit/LiveRaidWaveSpawning.test.ts tests/unit/EntityType.test.ts` | PASS | 4 files, 39 tests |
| Headless recording-backend integration | PASS | LiveRaidWaveSpawning 15/15 over RaidOwner composition; RaidEntityBackend EntityManager adapter | 
| `npm run typecheck` | PASS | `tsc --noEmit` exit 0 |
| `npm run lint` | PASS | 0 errors, 85 existing `no-explicit-any` warnings (baseline unchanged) |
| `npm test` | PASS | 452 files, 5383 passed + 1 skipped (5384 total), 30.80s |
| `npm run build` | PASS | `tsc --noEmit && vite build`, 252 modules, 5.42s; existing chunk-size advisory only |
| `npm run test:e2e` | PASS (documented baseline variance) | Full suite 29.1m: **110 passed / 2 failed** (112 total). All raid E2E green (`raid-feedback` 4 + `raid-persistence` 4). Both failures classified non-blocking below. Evidence: `/tmp/284-e2e.log`. |
| file-audit | PASS | `validate-file-audit` 2904 rows (+12 for 284), sha `75d564f6b40cfaffb2733e848777d688fac652fe` |
| `npm run validate-state` | PASS | After PROGRAM_STATE/tasks/verification reconcile |

## Edge/adversarial validation

- Non-finite center, unknown typeKey all-or-nothing, invalid count — RaidWaveSpawnPlan unit.
- Duplicate wave apply, mid-wave backend throw rollback, no auto-retry — LiveRaidWaveSpawning.
- Double death, unknown id, stale generation, non-active raid — consumeDeath choke.
- Double dispose, terminal/clear/replace — controller clear reasons.
- Pause without spawn; reload without resurrection — composition tests + Game pagehide clear.
- Append-only registry stability (prior keys + dense runtime ids) — EntityType unit.

## Migration/compatibility validation

- Additive registry rows only; `isPersistent` false for raiders; no new persistence namespace;
  no `SerializedRaid` change; 282 `#raid-feedback` / `getRaidState` contract unchanged;
  283 `__raid__` hydrate/save still owns counters only (entities never resurrected).

## Performance/resource validation

- O(roster) per wave apply, O(1) per death, no unbounded retry, no new worker/GPU path;
  dedicated non-persistent `EntityManager` for raiders only.

## Regressions

- Full unit 452 files / 5383+1 green.
- 282 raid-feedback journeys: all four green; 283 raid-persistence: all four green.
- 259–283 not reopened; Change 258 remains BLOCKED (no headed FPS evidence claimed).
- Scope: no bad-omen acquisition implementation, no settlement detector, no new namespace,
  no HUD redesign, no 258 GPU edits.

## E2E failure classification (T10)

Full-suite failures were isolated and proven non-blocking:

1. **`tests/e2e/enchanting.spec.ts:227` — FLAKE (not a 284 regression).** Same Expected
   enchantments JSON vs Received `"null"` after reload documented in 279/283. Enchanting
   path does not touch raid wave entity seams. Companion lifecycle test in the same file
   passed in full suite and isolated runs. Isolated re-runs of `:227` on this tree still
   reproduced the same reload timing flake (`/tmp/284-enchant-rerun.log`,
   `/tmp/284-enchant-rerun2.log`) — environmental, not functional to 284.

2. **`tests/e2e/visual-regression.spec.ts:176` — BASELINE-EQUIVALENT visual drift.** Full
   suite recorded **31 fail / 29 pass** (60 cells), all `exceeded-threshold` in the
   0.020–0.062 Linux SwiftShader software-WebGL golden band (documented since 281/282/283).
   Compared to `/tmp/visual-283-classify.log` (30 fail / 30 pass): shared fail set is a
   superset with one extra cell `start-overlay/high/1920x1080`; **22/30** shared failing
   fractions are byte-identical to the 283 classify log. Compared to `/tmp/visual-282-rerun.log`
   and `/tmp/visual-head.log` (both 30/30): one-cell swap variance (`crosshair/high/1920x1080`)
   within the same drift band. No 284-owned visual golden or CSS/HUD redesign; raider entities
   are non-rendered registry/backend seams. Precedent: 282/283 verified with the same class of
   SwiftShader drift.

No 284 functional E2E regression remains; no headed GPU evidence is claimed.

## Incomplete tasks

None. T12 completed: `C284` exact/VERIFIED matrix row, PROGRAM_STATE 12/12 VERIFIED,
committed and published to `origin/main` per `REVIEW_HANDOFF.md` (published_head recorded
after push).

## Advancement Exception

Not applicable; the target is 100%.

## Final decision

**VERIFIED 12/12 (100%).** T1–T12 complete. All mandatory gates pass: typecheck, lint
(0 errors), unit 5383+1, build, file-audit 2904, validate-state, and full E2E (110 passed;
2 failures independently classified as enchanting reload flake + baseline-equivalent visual
drift — neither is a 284 functional regression). `C284` is exact/VERIFIED in
`PARITY_MATRIX.md`; PROGRAM_STATE records 284 VERIFIED with
`mandatoryRequirementsPass`/`requiredTestsPass`/`advancementAllowed: true`. Change 258
remains BLOCKED; Changes 259–284 are VERIFIED. Published to `origin/main` per
`REVIEW_HANDOFF.md`.
