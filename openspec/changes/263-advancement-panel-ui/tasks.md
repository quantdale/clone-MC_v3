# Tasks: 263-advancement-panel-ui

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Furnace (251) / enchanting (259) / brewing (260)
/ gamerule (261) / recipe-book (262) panel, shell, lifecycle, persistence, and
harness patterns are mirrored, never forked.

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 263 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=263-advancement-panel-ui ACTIVE 0/15; 258 recorded BLOCKED;
  259, 260, 261, 262 recorded VERIFIED; nextExactAction = T2). Evidence:
  `git diff` of the four files + `validate-state` PASS.
- [x] **T2.** Quality-gate the package: PASS 2026-09-11 — number/name matches sequence;
  previous-change exception explicitly owner-authorized (258 stays BLOCKED
  per CHANGE_SEQUENCE_OVERRIDES.md, 259/260/261/262 stay VERIFIED; no headed
  work); proposal 11/11 sections, design 14/14, capability spec with
  MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/
  regression/docs/gate; no normative placeholders;
  `node scripts/validate-state.mjs` PASS. Evidence: command output.

## B. Save envelope + view (TDD: pure, no DOM)

- [x] **T3.** `src/simulation/AdvancementSave.ts` (DONE 2026-09-11; 22/22 green): `ADVANCEMENT_SAVE_VERSION`,
  `SerializedAdvancementSave`, `serializeAdvancementSave`,
  catalog-aware `deserializeAdvancementSave` (R-4: non-object / wrong version
  / non-array / duplicate key / unknown key / length mismatch /
  achieved⇔criteria / achieved⇔tick — each throws descriptively, nothing
  partially accepted), `createDefaultAdvancementProgresses`,
  `applyTriggerToProgresses` (identity same-array when unchanged;
  `completedKeys` newly achieved). 185's single-record functions untouched
  (reused inside). New `tests/unit/AdvancementSave.test.ts` (round-trip,
  10+ malformed classes incl. dup + unknown + length + both consistency
  directions, fail-closed single-throw, fan-out completion/identity/
  double-fire, defaults length/order). Evidence: suite green.
- [x] **T4.** `src/simulation/AdvancementView.ts` (DONE 2026-09-11; 6/6 green): `AdvancementRowView`,
  `describeAdvancementCriterion` (obtain/dimension/boss/kill English per
  design, `minecraft:`-prefix stripping humanization), `describeAdvancement`,
  `describeAdvancements` (catalog order). New
  `tests/unit/AdvancementView.test.ts` (7 rows in chain order, non-empty
  descriptions, the four catalog description pins, counts 0/1 → 1/1 on
  completion, remaining). Evidence: suite green.

## C. Persistence (TDD: injected IndexedDB factory + capturing asserts)

- [x] **T5.** `WorldMetadataRepository` advancement raw namespace + `GamePersistence` load/save/reset + archive passthrough (DONE 2026-09-11; 15/15 green; sibling suites green): 0 new stores, 0
  version bumps. `getAdvancementData/putAdvancementData`
  (`__advancements__:<worldId>` raw record, recipe-book precedent);
  `GamePersistence.open()` bulk-load beside the 262 hydration (null →
  absent; non-null → `deserializeAdvancementSave(raw, catalog)` in try/catch
  → defaults + recorded error); `initialAdvancements` getter +
  `saveAdvancements(payload)` fire-and-forget with recorded errors; 257 reset
  path deletes the raw key; `WorldArchive.advancementData` OPTIONAL
  (missing → null) + `WorldArchiver` export/import passthrough. New
  `tests/unit/AdvancementPersistence.test.ts` (round-trip save→flush→reopen,
  absent → null/defaults, 6+ corrupt shapes → defaults + error recorded,
  reset deletes, archive v1/v2-without-field import as null, export carries).
  Evidence: suite green; existing storage suites untouched-green.

## D. Game store + trigger wiring (narrowest validation per site)

- [x] **T6.** `Game` advancement store + fan-out + obtain chokes + toast (DONE 2026-09-11; wiring suite 7/7 green, typecheck clean):
  `advancements` field init from validated
  `persistenceImpl.initialAdvancements` else defaults; achieved ticks read
  `simTick`; `getAdvancementRows()` /
  `fireAdvancementTrigger(trigger)` (total: fan-out at `simTick`,
  persist-on-change via `saveAdvancements`, toast each completed title once,
  re-render open panel, return completed keys) / `isAdvancementOpen()` /
  `openAdvancements()` / `closeAdvancements()` (one-container rule);
  obtain chokes at the item-entity pickup callback + `onCrafted` + recipe-book
  craft success (numeric id → `getByLegacyId?.key`, unknown skipped, never
  throws). New `tests/unit/AdvancementWiring.test.ts` pins (defaults 7
  unachieved, obtain/dimension/boss/kill fan-out, wrong-key identity + no
  persist, double-fire exactly-once incl. single toast, tick recorded,
  unknown-id skip, obtain mapping for wooden_pickaxe). Evidence: typecheck +
  suite green.

## E. Panel + shell (mirror 259/260/261/262)

- [x] **T7.** `src/ui/AdvancementPanel.ts` skeleton + render (DONE 2026-09-11; panel suite 6/6 green incl. empty-notice sentinel fix): fail-fast
  `Advancement element missing`; show/hide/isVisible; one row per listed
  entry (`data-advancement-row`, chain order from the dep) with title,
  description, progress text, Completed badge; status `aria-live=polite`;
  signature-gated render; panel owns no progress state. New
  `tests/unit/AdvancementPanel.test.ts` FakeElement harness (construction +
  missing-id + show/hide + 7 rows in order + completion badge + progress text
  + status strings + zero-write second render). Evidence: suite green.
- [x] **T8.** Session lifecycle + shell (DONE 2026-09-11; `npm run build` PASS 2.33s; touch set = Game/storage/shell/panel/view/save/tests only, no binaries): `openAdvancements()` /
  `closeAdvancements()` (open closes crafting/furnace/brewing/enchanting/
  gamerule/recipebook first, lock/overlay handling);
  `#advancements-open` HUD chip routes to open; `C`-toggle closes instead of
  stacking; pointer relock closes; blur/visibility keep without stacking;
  death (`respawnPlayer`) + `dispose()` close; per-frame upkeep re-renders
  while open. Shell: `index.html` `#advancements` dialog block (title, list,
  status, close) + HUD chip + `src/styles.css` `advancement-*` styles
  (259–262-mirrored); additions are .html/.css/.ts only (no binaries;
  `git status` check). `npm run build` PASS. Evidence: build output.

## F. Browser E2E (journey + lifecycle)

- [x] **T9.** `tests/e2e/advancements.spec.ts` journey (DONE 2026-09-11; 1/1 PASS headless — HUD-chip open, 7 defs, real wooden-pickaxe craft → stone_age + toast, nether seam → live flip + toast, reload field-for-field): boot → drain →
  click `#advancements-open` (panel opens, 7 rows with titles/descriptions,
  all `0/1`) → grant 3 planks + 2 sticks → C (crafting opens) → real click
  `button[data-recipe="wooden_pickaxe"]` → `stone_age` row flips to completed
  live + toast `Advancement made: Stone Age` → harness
  `fireAdvancementTrigger({type:'dimension_enter',
  dimensionKey:'minecraft:the_nether'})` → `enter_the_nether` flips live +
  toast → pagehide+reload → both rows field-for-field preserved (keys +
  ticks). Evidence: spec passes headless.
- [x] **T10.** Lifecycle E2E (DONE 2026-09-11; 1/1 PASS headless — close/C/one-container/blur/no-double-fire): close button closes with overlay return; `C`
  closes instead of stacking; blur keeps the panel open exactly once (no
  stacking); repeat trigger after completion produces no second toast and no
  store change; crafting opened while advancements open closes the panel
  (one-container rule). Evidence: spec passes headless.

## G. Regression + gate + handoff

- [x] **T11.** Post-terminal advancement note + matrix note + R-4 narrowing (DONE 2026-09-11; matrix note added, R-4 row narrowed with NOT-VERIFIED qualifier, file-audit 2719 rows PASS):
  post-terminal note added (no C263 row until VERIFIED, per C259–C262
  precedent); 185/186/204/registry/258/259/260/261/262 verification files
  untouched (`git status` confirms — touch set is Game/storage/shell/panel/
  view/save/tests only); file-audit manifest extended with new-file rows +
  `validate-file-audit.mjs` PASS; risk-register R-4 row narrowed (advancement
  half closed, entity-manager half remains with unchanged rationale).
- [x] **T12.** Full regression (DONE 2026-09-11; typecheck PASS, lint 0 errors, unit 411 files 4898+1, build 2.30s, file-audit 2719, validate-state PASS): `npm run typecheck` PASS; `npm run lint` 0
  errors; `npm test` (new: AdvancementSave, AdvancementView,
  AdvancementPanel, AdvancementPersistence, AdvancementWiring;
  characterization updates only where pinned-behavior-preserving);
  `npm run build` PASS; file-audit PASS; `validate-state` PASS. Evidence:
  exact outputs in verification.md.
- [x] **T13.** Full E2E (DONE 2026-09-11; 73/73 PASS 28.5m, last-run.json passed/[] — 71 + 2 new, zero regressions): `npm run test:e2e` PASS incl. advancements specs
  (journey + lifecycle); zero regressions;
  `test-results/.last-run.json` `{"status":"passed","failedTests":[]}`.
- [x] **T14.** Reconciliation + state (DONE 2026-09-11; dedupe wording drift fixed in design+spec; C263 matrix row exact + counts + note VERIFIED; R-4 advancement half closed): artifacts re-read vs implementation,
  drift fixed; C263 matrix row exact + summary counts + note flipped to
  VERIFIED; `PROGRAM_STATE.json`/`.md` checkpoint (15/15 100% when all
  checked, heads recorded, 258 BLOCKED blocker kept,
  mandatory/required true, advancementAllowed true); `validate-state` PASS.
- [x] **T15.** Publish (DONE 2026-09-11; committed + pushed `fe23ac8..6d2ac4d`, local == remote verified): commit, push to `origin/main`, remote head verified,
  local == remote verified, `published_head` recorded; final report (SHAs,
  status, completion, validations, blockers, next action). Do NOT mark 258
  VERIFIED; do NOT touch headed FPS work; do NOT reopen 259/260/261/262.
