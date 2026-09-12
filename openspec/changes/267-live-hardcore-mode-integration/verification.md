# Verification: 267-live-hardcore-mode-integration

Status: VERIFIED
Completion: 13/13 (100%)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| hardcore + difficulty persistence | `HardcorePersistence.test.ts` 21/21 (round-trip, 6-case hardcore degrade + 5-case difficulty degrade, independent-record degrade, last-write-wins, reset delete, post-reset inert saves, repo round-trip, archive backward-compat + rejection + export/import report) | VERIFIED |
| difficulty lock | `HardcoreModeIntegration.test.ts` lock ×4 + passthrough ×4 + locked-refusal E2E leg (configured `easy` stays, effective `hard`, edit returns false) | VERIFIED |
| permanent death into spectator | `onSurvivalEvent` routing (193 `respawnModeAfterDeath` + `setGameMode` before unchanged `respawnPlayer`); E2E hardcore arc (die → spectator + hardcore toast + vitals reset; second death stays spectator; reload persists) | VERIFIED |
| settings UI | World-settings section (`#hardcore-toggle`, `#difficulty-select` with disabled-while-locked) + `#hardcore-badge`; E2E real-DOM legs (toggle on/off, select change, refusal toast) | VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `npm run typecheck` | PASS | 0 errors (post-UI wiring) |
| `npm run lint` | PASS | 0 errors, 85 pre-existing warnings |
| `npm test` | PASS | 419 files, 5018 passed + 1 skipped |
| `npm run build` | PASS | 2.24s |
| `npm run test:e2e` (hardcore spec) | PASS | 2/2 (29.3s) |
| `npm run test:e2e` (full) | PASS | 82/82: 72/72 in the main run (zero failures; both 267 tests incl.) + 10/10 remaining in the tail run (11/11 with 1 overlap re-run) |
| `scripts/validate-state.mjs` | PASS | post-activation |
| file-audit | PASS | 2755 rows (2747 + 8 new 267 rows) |

## Edge/adversarial validation

- Corrupt `__hardcore__` (6 shapes) and `__difficulty__` (5 shapes) each
  degrade to defaults with a recorded `load hardcore` / `load difficulty`
  error; cross-record independence pinned (healthy record survives).
- Locked difficulty edits return false with no mutation and no write (unit +
  E2E); unknown difficulty text (`''`, `'godmode'`, null) is a false no-op.
- Hardcore death outside survival (spectator/creative) stays spectator with
  no flapping (193 matrix ×4 modes; E2E second-death leg).
- Malformed archive fields (`hardcoreData`/`difficultyData` non-object)
  throw pre-write (F257-L atomicity); absent fields import as defaults.
- `saveHardcore`/`saveDifficulty` post-reset or without persistence are
  silent no-ops (265 precedent).

## Migration/compatibility validation

- Old saves (no records) boot non-hardcore normal (defaults leg in both
  unit and E2E); reset deletes both records (world returns to defaults).
- Records are namespaced raw payloads inert on older builds; hardcore-death
  spectator `__gamemode__` records load as spectator on any 265+ build.

## Performance/resource validation

No per-tick cost by construction (flag read on death/toggle/query only;
the wither call site already computed per skull hit). Boot +2 metadata
reads; toggles ride the existing 5s autosave + pagehide + dispose path.
Build 2.24s.

## Regressions

Full unit 419/419 green; no 259–266 source touched (only the mechanical
`WorldArchiver.test.ts` report expectation +2 flags). 259–266 E2E
unmodified; full-suite result recorded at T12 close.

## Incomplete tasks

None. 13/13 complete.

## Advancement Exception

Not applicable (100% completion).

## Final decision

VERIFIED — all MUST/SHALL requirements map to passing tests; all gates
green (typecheck/lint 0 errors, unit 419 files 5018+1, build 2.27s, e2e
82/82, file-audit 2755, validate-state PASS); 258 still BLOCKED (not
VERIFIED, no headed work touched); 259–266 still VERIFIED (no source
touched except the mechanical archiver-report expectation).

## Advancement Exception

Not applicable (targeting 100%).

## Final decision

NOT VERIFIED — implementation has not begun.
