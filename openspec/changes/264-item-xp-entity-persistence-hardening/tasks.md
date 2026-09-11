# Tasks: 264-item-xp-entity-persistence-hardening

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Wither (252) / gamerule (261) / recipe-book
(262) / advancement (263) persistence, shell, and harness patterns are
mirrored, never forked.

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: (DONE 2026-09-11; `validate-state` PASS) override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 264 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=264-item-xp-entity-persistence-hardening ACTIVE 0/13; 258
  recorded BLOCKED; 259/260/261/262/263 recorded VERIFIED; nextExactAction =
  T2). Evidence: `git diff` of the four files + `validate-state` PASS.
- [x] **T2.** Quality-gate the package: (DONE 2026-09-11 — PASS: number/name matches sequence; 258 BLOCKED exception owner-authorized in overrides, 259/260/261/262/263 VERIFIED untouched; proposal 11/11, design 14/14, spec MUST/SHALL + scenarios; tasks cover unit/edge/regression/docs/gate; verification maps requirements; baseline gate declared; `validate-state` PASS) number/name matches sequence;
  previous-change exception explicitly owner-authorized (258 stays BLOCKED
  per CHANGE_SEQUENCE_OVERRIDES.md, 259/260/261/262/263 stay VERIFIED; no
  headed work); proposal 11/11 sections, design 14/14, capability spec with
  MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/
  regression/docs/gate; no normative placeholders;
  `node scripts/validate-state.mjs` PASS. Evidence: command output.

## B. Deserializer hardening (TDD: pure, no DOM)

- [x] **T3.** `ItemEntityManager.deserializeAll` fail-closed (DONE 2026-09-11; 31/31 green incl. 8 new) (R-4): reject
  duplicate ids within the batch, negative ids, unknown registry item ids,
  and counts outside `1..stackSize(item)` — each a deterministic
  `ItemEntityManager: ...` error naming the batch index, manager unchanged
  on any throw. Extend `tests/unit/ItemEntityManager.test.ts` (dup pair,
  negative id, unknown item, count 0, count > stackSize, foreign typeKey
  still rejected, atomicity: size/order/nextId unchanged after each throw,
  round-trip identity incl. nextId continuation). Evidence: suite green.
- [x] **T4.** `XpOrbManager.deserializeAll` fail-closed (DONE 2026-09-11; 15/15 green incl. 5 new) (R-4): reject
  duplicate ids within the batch — deterministic `XpOrbManager: duplicate
  xp-orb id ...` error, manager unchanged. Extend
  `tests/unit/XpOrbManager.test.ts` (dup pair, triple-with-dup, atomicity,
  round-trip identity incl. nextId continuation; existing malformed classes
  stay green). Evidence: suite green.

## C. Persistence (TDD: injected IndexedDB factory + capturing asserts)

- [x] **T5.** `WorldMetadataRepository` raw namespaces (DONE 2026-09-11; 13/13 green + archiver green) + `GamePersistence`
  load/save/reset + archive passthrough (261–263 precedent; 0 new stores, 0
  version bumps): `putItemEntityData`/`getItemEntityData`
  (`__itementities__:<worldId>`), `putXpOrbData`/`getXpOrbData`
  (`__xporbs__:<worldId>`); `open()` bulk-load beside the 263 hydration
  (absent → null; non-array or envelope-invalid → null + recorded error);
  `initialItemEntities`/`initialXpOrbs` getters +
  `saveItemEntities`/`saveXpOrbs` fire-and-forget with recorded errors (+
  `resetCompleted` inert guard, 261–263 parity); 257 reset deletes both raw
  keys (+ snapshot/restore coverage); `WorldArchive.itemEntityData` /
  `xpOrbData` OPTIONAL array-or-null + `WorldArchiver` export/import
  passthrough. New `tests/unit/ItemXpPersistence.test.ts` (manager
  serialize → save → flush → reopen → getters equal; absent → null; 4+
  corrupt shapes → null + error recorded; reset deletes; archive
  v1/v2-without-fields import as null, export carries; hostile batch through
  hardened readers still throws). Evidence: suite green; existing storage
  suites untouched-green.

## D. Game store wiring (narrowest validation per site)

- [x] **T6.** `Game` hydrate + save + quarantine + accessors: (DONE 2026-09-11; typecheck + lint clean; quarantine pinned at facade/manager layers; live wiring pinned by T7/T8) hydrate both
  managers via hardened `deserializeAll` after construction (injected path)
  and when the self-open promise settles (each in try/catch → quarantine to
  empty + `bootSaveDegraded` + banner); `saveItemAndXpEntities()` (serialize
  both + save*; no-op when persistence absent or recovery-required);
  autosave cadence + `dispose()` + `onPageHide` call it; public
  `getItemEntityCount()` / `getXpOrbCount()` + read-only `xpOrbs` access
  (matching public `itemEntities`). Validation: typecheck clean; facade +
  manager suites pin the quarantine decisions (Game is DOM-bound, 263
  precedent); E2E (T7/T8) pins the live wiring. Evidence: typecheck + suites
  green.

## E. Browser E2E (journey + removal)

- [x] **T7.** `tests/e2e/item-xp-persistence.spec.ts` journey (DONE 2026-09-11; 1/1 PASS headless — drop+orb persist across reload, same ids/fields/positions) (drop + orb
  persist across reload field-for-field): boot → record player pos via
  `__voxelGame` → spawn 3-plank drop + 7-XP orb beside the player via the
  live managers → `saveItemAndXpEntities()` → wait for settle → reload →
  same drop (item/count/pos) + same orb (value/pos) present, counts 1/1.
  Evidence: spec passes headless.
- [x] **T8.** Removal-persists + empty-stays-empty E2E: (DONE 2026-09-11; 1/1 PASS headless via live-tick collection — far drop present, collected drop stays gone, empty boots empty) spawn a drop at the
  player position (auto-collected by the live tick: count 1→0) plus a far
  drop; save + reload → far drop present, collected drop stays gone;
  fresh-seed boot with no drops reloads empty (no phantom resurrection).
  Evidence: spec passes headless (polling with generous timeouts for the
  collection race; fallback documented if the play gate blocks collection in
  the harness).

## F. Regression + gate + handoff

- [x] **T9.** Post-terminal note + matrix note + file-audit (DONE 2026-09-11; matrix note added, no C264 row until VERIFIED; file-audit 2726 rows PASS; 111/117/131/185/258–263 verification files untouched) (no C264 row
  until VERIFIED, C259–C263 precedent): post-terminal note paragraph; 111/
  117/131/185/258/259/260/261/262/263 verification files untouched (`git
  status` confirms — touch set is Game/storage/managers/tests/e2e only);
  file-audit manifest extended with new-file rows +
  `validate-file-audit.mjs` PASS; R-4 row NOT yet closed (closes in T12 on
  VERIFIED evidence).
- [x] **T10.** Full regression: (DONE 2026-09-11; typecheck PASS; lint 0 errors / 85 warnings; unit 412 files 4924+1; build 2.38s; file-audit 2726 PASS; validate-state PASS) `npm run typecheck` PASS; `npm run lint` 0
  errors; `npm test` (new: ItemXpPersistence; extended: ItemEntityManager,
  XpOrbManager; characterization updates only where
  pinned-behavior-preserving); `npm run build` PASS; file-audit PASS;
  `validate-state` PASS. Evidence: exact outputs in verification.md.
- [x] **T11.** Full E2E: (DONE 2026-09-11; 75/75 PASS 24.3m — 73 + 2 new, zero regressions; last-run.json passed/[]) `npm run test:e2e` PASS incl. item-xp-persistence
  specs (journey + removal); zero regressions;
  `test-results/.last-run.json` `{"status":"passed","failedTests":[]}`.
- [x] **T12.** Reconciliation + state: (DONE 2026-09-11; design accessor drift fixed; C264 matrix row exact + counts + note VERIFIED; R-4 CLOSED both halves; PROGRAM_STATE 13/13 100%, 258 BLOCKED kept, mandatory/required true, advancementAllowed true; validate-state PASS) artifacts re-read vs implementation,
  drift fixed; C264 matrix row exact + summary counts + note flipped to
  VERIFIED; risk-register R-4 row closed (both halves); `PROGRAM_STATE.json`/
  `.md` checkpoint (13/13 100% when all checked, heads recorded, 258 BLOCKED
  blocker kept, mandatory/required true, advancementAllowed true);
  `validate-state` PASS.
- [x] **T13.** Publish: (DONE 2026-09-11; committed + pushed `c783781..8291e3a`, local == remote verified; sync checkpoint follows) commit, push to `origin/main`, remote head verified,
  local == remote verified, `published_head` recorded; final report (SHAs,
  status, completion, validations, blockers, next action). Do NOT mark 258
  VERIFIED; do NOT touch headed FPS work; do NOT reopen 259/260/261/262/263.
