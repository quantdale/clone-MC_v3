# Verification: 264-item-xp-entity-persistence-hardening

Status: VERIFIED
Completion: 100% (13/13)
Advancement allowed: true

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| item batch rejects duplicate ids | `tests/unit/ItemEntityManager.test.ts` 264 block: duplicate pair (`duplicate item-entity id 4 at index 1`) + late duplicate in triple (`id 1 at index 2`), manager unchanged | PASS |
| item batch rejects malformed records | same block: negative id, unknown item 999999, count 0, count 65 > stackSize 64, plus pre-existing foreign-typeKey/malformed classes | PASS |
| orb batch rejects duplicate ids | `tests/unit/XpOrbManager.test.ts` 264 block: duplicate pair (`duplicate xp-orb id 7 at index 1`) + late duplicate in triple, manager unchanged | PASS |
| orb batch stays fail-closed | same block: populated-manager untouched on late malformed record; pre-existing bad-record class green | PASS |
| round-trip identity + mint continuity | item: ticked-state field-for-field + next mint `maxId+1`; orb: same + mint 2; empty batch → `nextId = 0` | PASS |
| live snapshots persist across refresh | `tests/unit/ItemXpPersistence.test.ts`: save → flush → reopen restores both snapshots field-for-field and re-validates under hardened readers | PASS |
| boot hydrates hardened + quarantine | facade: 4 corrupt shapes → null + `load itementities/xporbs` error; hostile dup batch stored (envelope-valid) but reader throws `/duplicate item-entity id 99 at index 1/`; Game hydrate try/catch quarantine (banner) — live legs below | PASS |
| chunk unload/reload cannot evict | manager serialize → clear → deserialize cycle tests (items + orbs); no World streaming path references either manager (`grep` touch-set proof) | PASS |
| reset + archive carry records | reset deletes both keys (reopen null); v1 archive without fields imports null; non-array/envelope-invalid rejected; export → import carries both + report flags | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `node scripts/validate-state.mjs` (T1/T2) | PASS | control-plane activation + package quality gate |
| `npm run typecheck` | PASS | 0 errors (post Game/storage/manager/test edits) |
| `npm run lint` | PASS | 0 errors, 85 warnings (pre-existing; no new errors) |
| `npm test` | PASS | 412 files, 4924 passed + 1 skipped (4898 + 8 item + 5 orb + 13 persistence) |
| `npm run build` | PASS | 2.38s |
| `npm run test:e2e` | PASS | 75/75 (73 + 2 new) 24.3m; `test-results/.last-run.json` `{"status":"passed","failedTests":[]}` |
| `scripts/validate-file-audit.mjs` | PASS | 2726 rows (2719 + 7 new-file rows) |
| `node scripts/validate-state.mjs` (final) | PASS | 264 VERIFIED, R-4 closed, matrix C264 exact with synced counts |

## Edge/adversarial validation

- Duplicate-id injection at both managers (pair + late-in-triple): deterministic indexed throws, managers unchanged (size/order/mint counter pinned).
- Unknown-item (999999), oversize-count (65 > 64), negative-id payloads: rejected with indexed errors.
- Facade open with non-array, envelope-invalid (schemaVersion 0 / missing data), and duplicate-id raw records: first two degrade to null + recorded error; duplicate-id passes the envelope layer (stored) and throws at the hardened reader — two-layer contract pinned by test.
- Reset atomicity: both new keys deleted in the multi-store transaction + snapshot/restore coverage; reopen boots null.
- Archive without new fields (v1): validates, imports null; non-array new fields rejected.

## Migration/compatibility validation

- Pre-264 world (absent keys) boots empty managers; no store/version/migration changes.
- v1 archive imports null for both fields; payloads written by this change re-validate under the hardened readers (live state satisfies every rule by construction: spawn/merge enforce `1..stackSize`, ids non-negative unique).

## Performance/resource validation

- `deserializeAll` stays O(n) with one duplicate-tracking `Set`.
- Saves ride the existing 5s autosave cadence + dispose + pagehide; no per-tick persistence work. Full E2E wall time 24.3m nominal (no suite slowdown attributable to this change).

## Regressions

- 259/260/261/262/263 suites green inside the full 4924+1 unit run and 75/75 E2E.
- 111/117/131/185/258–263 verification files untouched (`git status` touch-set proof in T9).
- 258 NOT marked VERIFIED; no headed FPS work; 259/260/261/262/263 NOT reopened.
- One characterization update: `tests/unit/WorldArchiver.test.ts` expected report gains `itemEntityDataImported: false, xpOrbDataImported: false` (new report fields, no behavior change).

## Incomplete tasks

None (13/13).

## Advancement Exception

Not applicable (100%).

## Final decision

VERIFIED — all MUST/SHALL requirements proven, all gates green, R-4 CLOSED (both halves), `PARITY_MATRIX.md` row C264 exact with synced summary counts.
