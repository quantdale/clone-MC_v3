# Tasks: 262-recipe-book-ui

Task sizing follows `SPEC_AUTHORING_PROTOCOL.md`: one conceptual unit per
task, validated immediately. Furnace (251) / enchanting (259) / brewing (260)
/ gamerule (261) panel, shell, lifecycle, and harness patterns are mirrored,
never forked.

## A. Spec package + control plane (no production code)

- [x] **T1.** Control-plane entries: override appended to
  `openspec/CHANGE_SEQUENCE_OVERRIDES.md`, 262 row in
  `openspec/CHANGE_SEQUENCE.md`, `PROGRAM_STATE.json`/`.md` activated
  (currentChange=262-recipe-book-ui ACTIVE; 258 recorded BLOCKED; 259, 260,
  and 261 recorded VERIFIED; nextExactAction = T2). Evidence:
  `git diff` of the four files.
- [x] **T2.** Quality-gate the package: PASS 2026-09-11 — number/name matches sequence;
  previous-change exception explicitly owner-authorized (258 stays BLOCKED
  per CHANGE_SEQUENCE_OVERRIDES.md, 259/260/261 stay VERIFIED; no headed
  work); proposal 11/11 sections, design 14/14, capability spec with
  MUST/SHALL scenarios throughout; tasks cover unit/integration/edge/
  regression/docs/gate; no normative placeholders;
  `node scripts/validate-state.mjs` PASS. Evidence: command output.

## B. Persistence (TDD: injected IndexedDB factory + capturing asserts)

- [x] **T3.** `WorldMetadataRepository` recipe-book raw namespace +
  `GamePersistence` load/save/reset + archive passthrough: 0 new stores, 0
  version bumps. `getRecipeBookData/putRecipeBookData`
  (`__recipebook__:<worldId>` raw record, gamerule precedent);
  `GamePersistence.open()` bulk-load beside the 261 hydration (null →
  absent; non-null → `deserializeRecipeBook` in try/catch → empty book +
  recorded error); `initialRecipeBook` getter +
  `saveRecipeBook(payload)` fire-and-forget with recorded errors; 257 reset
  path deletes the raw key; `WorldArchive.recipeBookData` OPTIONAL
  (missing → null) + `WorldArchiver` export/import passthrough. New
  `tests/unit/RecipeBookPersistence.test.ts` (round-trip save→flush→reopen,
  absent → null/empty, 4+ corrupt shapes → empty + error recorded,
  reset deletes, archive v1/v2-without-field import as null, export carries).
  Evidence: suite green; existing storage suites untouched-green.

## C. Game store + unlock triggers (narrowest validation per site)

- [x] **T4.** `Game` recipe-book store + R1/R2 + selection view:
  `recipeBook` field init from validated `persistenceImpl.initialRecipeBook`
  else `createDefaultRecipeBook()`; `getRecipeBook()` /
  `getRecipeBookQuery()` / `setRecipeBookQuery()` (transient) /
  `searchRecipeBook()` (delegates to `searchRecipes`) /
  `getRecipeBookSelection()` (pure `layoutRecipe` + have/missing view,
  unknown → null) / `selectRecipeBookRecipe(key|null)` /
  `craftRecipeBookSelection()` (`CraftingSystem.craft` once; success → R1
  `unlockRecipe` + `saveRecipeBook`; failure → false, inventory identical);
  `openRecipeBook()` runs R2 (`unlockRecipes` over currently-craftable keys;
  persist iff identity changed). New `tests/unit/RecipeBookWiring.test.ts`
  pins (defaults empty, R1 append+failure-no-unlock, R2 planks-only + reopen
  identity, selection sticks 2+7 cells + stale-key null + tag cell,
  craft-failure inventory identity). Evidence: typecheck + suite green.

## D. Panel (TDD: FakeElement shim, node env)

- [x] **T5.** `src/ui/RecipeBookPanel.ts` skeleton + render: fail-fast
  `Recipebook element missing`; show/hide/isVisible; search input wired to
  `setQuery` + `onChanged`; one button per listed entry
  (`data-recipebook-recipe`, registry order from the dep); selection detail
  (9-cell preview, missing line, always-enabled Craft button for a falsifiable
  status no-op,
  status `aria-live=polite`); signature-gated render; panel owns no book
  state. New `tests/unit/RecipeBookPanel.test.ts` FakeElement harness
  (construction + missing-id + show/hide + blank-order + filter + select
  renders cells + unaffordable craft disabled + status strings + zero-write
  second render). Evidence: suite green.

## E. Game wiring + shell (mirror 259/260/261)

- [x] **T6.** `Game` recipe-book session lifecycle + crafting entry:
  `openRecipeBook()` / `closeRecipeBook()` / `isRecipeBookOpen()`;
  opening closes crafting/furnace/brewing/enchanting/gamerule first
  (one-container rule) with lock/overlay handling;
  `#crafting-recipebook-open` routes to `openRecipeBook`;
  `C`-toggle closes instead of stacking; pointer relock closes; blur/
  visibility keep without stacking; death (`respawnPlayer`) + `dispose()`
  close; per-frame upkeep re-renders while open. Typecheck PASS + panel/
  wiring suites green (behavioral evidence: T8/T9).
- [x] **T7.** Shell: `index.html` `#recipebook` dialog block (title, search,
  list, detail grid, craft, status, close) + `#crafting-recipebook-open`
  button in `#crafting` + `src/styles.css` `recipebook-*` styles
  (259/260/261-mirrored); additions are .html/.css/.ts only (no binaries;
  `git status` check). `npm run build` PASS. Evidence: build output.

## F. Browser E2E (journey + lifecycle)

- [x] **T8.** `tests/e2e/recipebook.spec.ts` journey: boot → C (crafting
  opens) → click recipe-book button (book opens, crafting hidden) → grant
  log → reopen/rescan discovers `planks` → type `stick` filters → clear →
  grant planks → select `sticks` (cells + missing line) → craft (4 sticks,
  status) → pagehide+reload → known set field-for-field preserved (planks +
  sticks). Evidence: spec passes headless.
- [x] **T9.** Lifecycle E2E: close button closes; `C` closes with overlay
  return; unaffordable craft is a no-op with identical inventory counts;
  blur keeps the panel unstacked; unknown-selection guard where the harness
  can reach it without headed-only input. Evidence: spec passes headless.

## G. Regression + gate + handoff

- [x] **T10.** Post-terminal recipe-book note + matrix note: post-terminal
  note added (no C262 row until VERIFIED, per C259/C260/C261 precedent);
  204/registry/258/259/260/261 verification files untouched (`git status`
  confirms — touch set is Game/storage/shell/panel/tests only); file-audit
  manifest extended with new-file rows + `validate-file-audit.mjs` PASS.
- [x] **T11.** Full regression: `npm run typecheck` PASS; `npm run lint` 0
  errors; `npm test` (new: RecipeBookPanel, RecipeBookPersistence,
  RecipeBookWiring; characterization updates only where
  pinned-behavior-preserving); `npm run build` PASS; file-audit PASS;
  `validate-state` PASS. Evidence: exact outputs in verification.md.
- [x] **T12.** Full E2E: `npm run test:e2e` PASS incl. recipebook specs
  (journey + lifecycle); zero regressions;
  `test-results/.last-run.json` `{"status":"passed","failedTests":[]}`.
- [x] **T13.** Reconciliation + state: artifacts re-read vs implementation,
  drift fixed; C262 matrix row exact + summary counts + note flipped to
  VERIFIED; `PROGRAM_STATE.json`/`.md` checkpoint (14/14 100% when all
  checked, heads recorded, 258 BLOCKED blocker kept); `validate-state` PASS.
- [ ] **T14.** Publish: commit, push to `origin/main`, remote head verified,
  `published_head` recorded; final report (SHAs, status, completion,
  validations, blockers, next action). Do NOT mark 258 VERIFIED; do NOT
  touch headed FPS work; do NOT reopen 259/260/261.
