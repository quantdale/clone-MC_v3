# Verification: 304-modal-focus-and-keyboard-accessibility

Status: NOT VERIFIED
Completion: 0% (T1–T2 are pre-implementation evidence only; T3–T18 are open)
Advancement allowed: false

Authored during an audit campaign that is **forbidden from implementing code**.
T1–T2 record the measured baseline. No passing evidence is pre-filled.

This change was added after a second review pass. The first pass had reported the
repository as specification-exhausted; re-reviewing the audit dimensions that
were covered only structurally — accessibility, keyboard navigation, focus
management — produced this finding, which the first pass had missed.

## Pre-implementation evidence captured at base `6212822`

### E1 — Eleven surfaces declare themselves modal

`index.html` contains exactly eleven elements carrying `aria-modal="true"`
(`grep -c 'aria-modal="true"' index.html` = `11`). They are:

* **Ten shared panel dialogs**, each an unnamed `<div class="crafting-panel"
  role="dialog" aria-modal="true" aria-labelledby="<x>-title">`, nested inside an
  outer container: `crafting`, `furnace`, `brewing`, `enchanting`, `gamerule`,
  `recipebook`, `advancements`, `statistics`, `trading`, `creative`.
* **One recovery alertdialog**: `<div id="recovery" class="ui hidden"
  role="alertdialog" aria-modal="true" aria-labelledby="recovery-title">`.

Note the distinction that an earlier draft of this file got wrong: the ten panel
dialogs are unnamed inner divs; the outer container ids listed above are the
elements the UI classes address, not the `aria-modal` elements themselves. The
count of eleven is unaffected. `death-screen` is the only `role="dialog"`
element and is counted separately in E5.

### E2 — Focus is never moved into a dialog

```
$ grep -rn "focus()" src/ui/*.ts src/engine/Game.ts
src/engine/Game.ts:3021:    this.recoveryBackupBtn.focus();
```

One `focus()` call in the entire UI codebase, belonging to the recovery flow and
not to any modal open path.

Panel lifecycle is a pure class toggle, e.g. `src/ui/TradingPanel.ts:97-105`:

```ts
show(): void { this.el.classList.remove('hidden'); … }
hide(): void { … this.el.classList.add('hidden'); … }
```

Hidden/shown call counts per panel (all zero focus calls):

| Panel | class-toggle lines |
|---|---|
| `TradingPanel` | 4 |
| `RecipeBookPanel` | 4 |
| `FurnacePanel`, `BrewingPanel`, `EnchantingPanel`, `GameRulePanel`, `AdvancementPanel`, `StatisticsPanel`, `CreativeMenuPanel`, `DeathRespawnPanel` | 2 each |

`grep -A3 "  show(): void {" src/ui/*.ts | grep -cE "focus"` = `0`.

### E3 — No focus containment and no background isolation

```
$ grep -rn "inert\|focusTrap\|trapFocus\|tabIndex" src --include='*.ts'
src/engine/Game.ts:3082, 4181, 6971, 7136   # unrelated storage-facade comments
src/storage/GamePersistence.ts:975          # unrelated
src/player/PlayerInteraction.ts:298          # unrelated
src/world/World.ts:2333                     # unrelated ("inert while useWorkers is false")
$ grep -c 'inert' index.html
0
```

There is no `tabIndex` anywhere in `src/`, so dialog content is not even
programmatically ordered.

### E4 — No Escape handling anywhere

```
$ grep -rn "Escape\|ESC" src --include='*.ts' | grep -v "escapeHtml\|escapeReg"
src/engine/Game.ts:2528   # ESCALATE_RAID comment
src/engine/Game.ts:5719   # ESCALATE_RAID comment
src/engine/Game.ts:5726   # 'ESCALATE_RAID'
src/simulation/RaidEscalation.ts:…           # RAID_ESCALATION_*, ESCALATE_RAID
(no modal-dismiss hits)
```

Panels close via `KeyC` only: `src/engine/InputManager.ts:381` (`case 'KeyC':`)
and `:421` (`event.code === 'KeyC' …`).

### E5 — Inconsistent modal semantics

```html
<div id="death-screen" class="ui hidden" role="dialog"
     aria-labelledby="death-title" aria-describedby="death-outcome">
```

`role="dialog"` is present but `aria-modal` is absent. It is the only
`role="dialog"` element that omits `aria-modal`; the ten panel dialogs and the
recovery alertdialog all declare it.

### E6 — Nothing tests focus behaviour

```
$ grep -rn "toBeFocused\|activeElement" tests/e2e/*.spec.ts tests/unit/*.test.ts
(no matches)
```

Changes 208 (`accessibility-options`) and 246 (`input-accessibility-matrix`)
are recorded VERIFIED; modal focus semantics were never in scope for either, and
the absence of focus assertions is why the gap is invisible to the suite.

### E7 — The test environment constrains the design

```
vitest.config.ts:6:  environment: 'node'
$ ls node_modules | grep -iE '^jsdom|happy-dom'
(not installed)
```

DOM-level unit tests are therefore unavailable. The pure helpers must be
unit-tested in node and the DOM behaviour must be proven in the browser suite.
Adding a DOM-emulation dependency is explicitly out of scope.

## Requirement evidence

| Requirement | Evidence | Status |
|---|---|---|
| Opening a modal moves focus into it | E2 shows focus is never moved. T3/T4/T8 unimplemented. | NOT VERIFIED |
| Focus is contained within an open modal | E3 shows no trap mechanism. T3/T4/T7/T12 unimplemented. | NOT VERIFIED |
| Background surfaces unavailable while open | E3 shows zero `inert`. T4/T12 unimplemented. | NOT VERIFIED |
| Closing restores focus to the opener | E2 shows no restore path. T5/T12 unimplemented. | NOT VERIFIED |
| Escape dismisses an open modal | E4 shows no Escape handling. T6/T8/T12 unimplemented. | NOT VERIFIED |
| Modal surfaces declare consistent semantics | E5 shows `death-screen` lacks `aria-modal`. T11 unimplemented. | NOT VERIFIED |
| Behaviour verifiable where observable | E7 shows the node-only environment. T7/T12 unimplemented. | NOT VERIFIED |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| `grep -c 'aria-modal="true"' index.html` | 11 | E1 |
| `grep -rn "focus()" src/ui/*.ts src/engine/Game.ts` | 1 unrelated hit | E2 |
| `grep -c 'inert' index.html` | 0 | E3 |
| `grep -rn "Escape" src --include='*.ts'` | no modal hits | E4 |
| `grep -rn "toBeFocused\|activeElement" tests/` | no matches | E6 |
| `npm run typecheck` | PASS | see change 298 verification E1 |
| `npm run lint` | PASS (0 errors / 85 warnings) | see change 298 E1 |
| `npm run validate-state` | PASSED | see change 298 E1 |
| `npm test` | FAIL (2 unit tests) | see change 298; pre-existing and unrelated |
| `npm run build` | NOT RUN | must PASS at T14 |
| `npm run test:e2e` | NOT RUN | must PASS at T14; T12's assertions require it |
| `git diff --numstat -- tests/visual-golden/` | NOT RUN | must be empty at T13 |

## Edge/adversarial validation (required at T7/T12)

- [ ] `nextFocusIndex` for counts 0, 1, 2, 5; every index; both directions;
      out-of-range input.
- [ ] `focusableOrder` returns document order.
- [ ] Background predicate marks exactly the subtrees not containing the dialog.
- [ ] `open()` twice does not overwrite the opener.
- [ ] `close()` twice and `close()` without `open()` are no-ops with no leaked
      listener and no residual `inert`.
- [ ] `open()` with a null or disconnected dialog throws a named error.
- [ ] Opener detached before close → focus falls back to `document.body`, no
      throw.
- [ ] Inert is cleared even when the caller's dismiss path throws (`finally`).
- [ ] Browser: focus lands inside on open for the preferred-selector,
      first-focusable and no-focusable-content cases.
- [ ] Browser: Tab past the last control cannot leave the modal.
- [ ] Browser: background inert while open, not inert after close, and correct
      when switching from one modal to another.
- [ ] Browser: Escape dismisses exactly once; no effect when no modal is open.
- [ ] Browser: focus returns to the opener on close.
- [ ] `KeyC` and the close control still work on every surface.
- [ ] Every `role="dialog"` element declares `aria-modal="true"`.
- [ ] `git diff --numstat -- tests/visual-golden/` is empty.
- [ ] No DOM-emulation package added to the dependency manifest.

## Migration/compatibility validation

- [ ] No save data, world archive, or network payload change.
- [ ] `index.html` gains exactly one attribute (`aria-modal` on `death-screen`).
- [ ] No rendering change: committed goldens unchanged.
- [ ] `KeyC` behaviour unchanged on every surface.
- [ ] No user can become trapped: the dismiss path stays reachable by keyboard.

## Performance/resource validation

- [ ] No per-frame cost: focus handling runs only on open/close.
- [ ] The Tab path performs no layout-forcing reads.
- [ ] Exactly one `keydown` listener per open modal, removed on close.
- [ ] No new runtime dependency.

## Regressions

- None by design: one new module, additive `show()`/`hide()` wiring, one HTML
  attribute, new tests. No simulation, world, or storage code is touched.
- Known behavioural change, additive: keyboard users can now reach dialog
  controls they previously could not, and Escape now dismisses. Any existing
  flow that depended on focus remaining outside a dialog is itself a defect
  being corrected, and must be reported rather than silently preserved.

## Incomplete tasks

T3–T18 (16 of 18 tasks). Completion **0%** by checkbox count.

## Advancement Exception

Not applicable: completion is below 90%; advancement is forbidden.

## Final decision

**NOT VERIFIED.** At base `6212822`, eleven surfaces declare
`aria-modal="true"` while the runtime never moves focus into them, never contains
focus, never marks the background unavailable, and offers no Escape dismissal —
with zero tests asserting any of it. The declared semantics are therefore false,
and keyboard users tab through the UI behind an open modal. T3–T18 must be
implemented, and T12's browser assertions must actually observe the focus
transitions, before this change may be marked VERIFIED.
