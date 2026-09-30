# Tasks: 304-modal-focus-and-keyboard-accessibility

- [x] **T1.** Record the finding evidence. Attach to `verification.md`: the
  eleven `aria-modal="true"` element ids; `grep -rn "focus()" src/ui/*.ts
  src/engine/Game.ts` returning only `src/engine/Game.ts:3021`
  (`recoveryBackupBtn.focus()`); `show()`/`hide()` in all ten panel classes
  containing zero focus calls; `grep -rn "inert\|focusTrap\|trapFocus\|tabIndex"`
  returning only unrelated storage-facade comments; `grep -c 'inert' index.html`
  = 0; `grep -rn "Escape" src --include='*.ts'` returning only
  `RAID_ESCALATION`/`ESCALATE_RAID`; `grep -rn "toBeFocused\|activeElement"
  tests/` returning nothing; and `death-screen` carrying `role="dialog"` without
  `aria-modal`. **Evidence already captured at base `6212822`.**

- [x] **T2.** Record the environment constraint that shapes the test split:
  `vitest.config.ts` sets `environment: 'node'`, and neither `jsdom` nor
  `happy-dom` is present in `node_modules`, so DOM-level unit tests are
  unavailable and the DOM behaviour must be proven in the browser suite.
  **Evidence already captured at base `6212822`.**

- [ ] **T3.** Implement `src/ui/ModalFocus.ts` with `FOCUSABLE_SELECTOR`,
  `focusableOrder`, `nextFocusIndex`, `createModalFocus`, and the
  `ModalFocusHandle` interface per the design. `nextFocusIndex` MUST be pure and
  handle `count === 0`, single-item, interior, boundary and out-of-range input.

- [ ] **T4.** Implement `open()`: record the opener; compute the background set
  from the modal's `#ui-root` scope (every subtree not containing the dialog);
  apply `inert` to those; attach a single `keydown` listener handling Tab,
  Shift+Tab and Escape; focus the preferred selector match, else the first
  focusable descendant, else the dialog with `tabindex="-1"` applied once.
  `open()` on an already-open handle MUST be a no-op that does not overwrite the
  opener.

- [ ] **T5.** Implement `close()`: remove the listener; clear `inert` from every
  background entry recorded at open, in a `finally` so an error in the caller's
  dismiss path cannot leave inert state behind; restore focus to the opener when
  still connected, otherwise to the document body. `close()` on an inactive
  handle MUST be a no-op.

- [ ] **T6.** Implement Escape dispatch: invoke `onDismiss` exactly once per
  press while open, and not at all when inactive. Throw a named error from
  `open()` when the dialog is null or not connected, rather than silently leaving
  focus in the background.

- [ ] **T7.** Add `tests/unit/ModalFocus.test.ts` in the node environment
  covering `nextFocusIndex` for counts 0, 1, 2 and 5 across every index, both
  directions and out-of-range input; `focusableOrder` document ordering; the
  background-set predicate against a small fake element surface; and the
  idempotency rules (`open` twice, `close` twice, `close` without `open`).

- [ ] **T8.** Wire the helper into every modal panel without changing existing
  semantics: `TradingPanel`, `FurnacePanel`, `BrewingPanel`, `EnchantingPanel`,
  `GameRulePanel`, `RecipeBookPanel`, `AdvancementPanel`, `StatisticsPanel`,
  `CreativeMenuPanel`, `DeathRespawnPanel`, and the recovery surface in
  `src/engine/Game.ts` near line 3021. Each `show()` opens the handle, each
  `hide()` closes it, and Escape routes to the panel's existing dismiss path.

- [ ] **T9.** Handle nested surfaces: when the recipe book opens from the
  crafting panel, close the parent handle before opening the child so focus
  restoration lands on the launching control. Verify the existing one-container
  rule still holds and that focus does not strand on a control inside a surface
  that is about to hide.

- [ ] **T10.** Converge the three dismiss paths. Prove by source inspection and
  by test that the close control, `KeyC`, and `Escape` all reach one dismiss
  implementation, and that `KeyC` behaviour is unchanged for every surface.

- [ ] **T11.** Add `aria-modal="true"` to `death-screen` in `index.html`, and add
  a test enumerating every `role="dialog"` element asserting `aria-modal` is
  present, so the inconsistency cannot reappear.

- [ ] **T12.** Add the browser e2e spec `tests/e2e/modal-focus.spec.ts`
  asserting, against the real document: opening each representative modal moves
  `document.activeElement` inside it; Tab past the last control cannot escape;
  background surfaces are inert while open and not inert after close; Escape
  dismisses exactly once and restores focus to the opener; and closing twice is
  safe. Cover at least the crafting, trading, furnace and death surfaces rather
  than all eleven, and justify the sample in `verification.md`.

- [ ] **T13.** Prove no rendering change: `git diff --numstat --
  tests/visual-golden/` MUST be empty. If any golden moves, stop and treat it as
  a defect in this change rather than re-pinning.

- [ ] **T14.** Run the full mandatory gate on the candidate SHA:
  `npm run validate-state`, `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, `node scripts/check-release-bundle.mjs`, `npm run test:e2e`.
  Lint MUST remain 0 errors with no increase over the 85 pre-existing warnings.

- [ ] **T15.** Confirm the dependency manifest is unchanged: no DOM-emulation
  package added.

- [ ] **T16.** Update the file-audit manifest for the added and modified files
  and run `node scripts/validate-file-audit.mjs …` to PASS.

- [ ] **T17.** Documentation and state: add the post-terminal row to
  `CHANGE_SEQUENCE.md`; record the focus-transition evidence in `verification.md`;
  update `openspec/PROGRAM_STATE.json` / `.md` at activation with
  `session_start_head` / `published_head`.

- [ ] **T18.** Final reconciliation and publication: re-read all artifacts
  against the implemented result, confirm every MUST/SHALL in
  `specs/modal-focus-accessibility/spec.md` has evidence (especially T7's pure
  helper cases and T12's real `activeElement` observations), confirm 100%
  checkbox completion, inspect the diff for unrelated changes, commit, push to
  `origin/main`, verify the remote head, report `published_head`.
