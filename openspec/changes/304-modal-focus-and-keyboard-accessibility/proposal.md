# Proposal: 304-modal-focus-and-keyboard-accessibility

## Problem

Eleven in-game surfaces declare themselves modal dialogs to assistive technology,
but none of them behaves like a modal. Specifically: **focus is never moved into
the dialog when it opens, never returned when it closes, never trapped while open,
and there is no Escape-to-dismiss anywhere in the codebase.** The background UI
is never marked `inert`.

The result is a direct contradiction between what the markup promises and what
the runtime does. `aria-modal="true"` tells a screen reader that content outside
the dialog is unavailable, while the real keyboard focus remains outside the
dialog and `Tab` walks straight through the background controls behind it.

This is a material accessibility defect on the game's primary interactive
surfaces, and it is invisible to the current test suite because no test asserts
anything about focus.

## Inspection findings (base `6212822`)

**The eleven dialogs** (`src/index.html`, `aria-modal="true"`):

```
advancements, brewing, crafting, creative, enchanting, furnace,
gamerule, recipebook, recovery, statistics, trading
```

**No focus management anywhere.** The entire UI codebase contains exactly one
`focus()` call, and it is unrelated to dialogs:

```
$ grep -rn "focus()" src/ui/*.ts src/engine/Game.ts
src/engine/Game.ts:3021:    this.recoveryBackupBtn.focus();
```

Every panel opens by toggling a class and nothing else — e.g.
`src/ui/TradingPanel.ts:97-105`:

```ts
show(): void { this.el.classList.remove('hidden'); … }
hide(): void { … this.el.classList.add('hidden'); … }
```

Across all ten panel classes, `show()`/`hide()` contain **zero** focus-related
calls.

**No focus trap and no background isolation.**

```
$ grep -rn "inert\|focusTrap\|trapFocus\|tabIndex" src --include='*.ts' | grep -v facade
(no matches — every "inert" hit is an unrelated comment about the storage facade)
$ grep -c 'inert' index.html
0
```

There is no `tabIndex` anywhere in `src/`, so dialog content is not even
programmatically ordered.

**No Escape-to-dismiss.**

```
$ grep -rn "Escape" src --include='*.ts' | grep -v escapeHtml
(no matches — every "ESC" hit is RAID_ESCALATION / ESCALATE_RAID, unrelated)
```

Panels close via `KeyC` only (`src/engine/InputManager.ts:381,421`).

**Inconsistent modal semantics.** `death-screen` declares `role="dialog"` but
**omits** `aria-modal="true"`, unlike the other eleven:

```html
<div id="death-screen" class="ui hidden" role="dialog"
     aria-labelledby="death-title" aria-describedby="death-outcome">
```

**No test coverage of focus behaviour.**

```
$ grep -rn "toBeFocused\|activeElement" tests/ | head
(no matches)
```

Changes 208 (`accessibility-options`) and 246 (`input-accessibility-matrix`) are
recorded VERIFIED, so accessibility is treated as covered; focus management
specifically was never addressed.

## Goals

1. When a modal opens, move keyboard focus into it to a sensible first control.
2. While a modal is open, keep focus inside it (Tab / Shift+Tab wrap).
3. When a modal closes, return focus to the element that opened it.
4. Support Escape as a dismiss affordance, routed through the same dismiss path
   as the existing close control and `KeyC`, with no behaviour change to either.
5. Make the background genuinely unavailable to assistive technology while a
   modal is open, so the declared `aria-modal` is truthful.
6. Align `death-screen` with the other dialogs' modal semantics.

## Non-goals

- No visual redesign, no CSS restyle, no new panel, no gameplay change.
- No change to the pointer-lock mouse path or to any existing key binding's
  meaning; `KeyC` keeps working exactly as it does today.
- No change to `aria-label` / `aria-live` / `role` semantics beyond adding
  `aria-modal` to `death-screen`.
- No new runtime dependency (no focus-trap library); the helper is first-party.
- No remapping of existing keys.
- No 258 headed hardware-WebGL work.
- No virtual-cursor redesign.

## Preconditions

- None blocking. This is independent of the verification-integrity changes and
  can proceed on its own.
- If implemented alongside changes 298–303, note that those edit tests, tooling
  and configuration, not `src/ui/`, so the only shared surface is the e2e suite
  and `index.html`.

## Dependencies

- **None blocking.** Shares the e2e suite with the other changes; coordinate only
  if another change edits `index.html` markup (change 300 edits goldens and the
  visual harness, not `index.html`).

## Proposed change

### 1. Add a first-party modal focus helper

Create `src/ui/ModalFocus.ts` exposing a small, deep interface:

```ts
export interface ModalFocusHandle {
  /** Focus the dialog's first sensible control and trap Tab while open. */
  open(dialog: HTMLElement): void;
  /** Remove the trap and restore focus to the opener. */
  close(): void;
  /** Whether this handle currently owns focus. */
  readonly active: boolean;
}

export function createModalFocus(opts?: {
  onDismiss?: () => void;          // Escape handler; defaults to no-op
  preferredSelector?: string;      // first-choice control selector
}): ModalFocusHandle;
```

Behaviour, in order:

1. **`open(dialog)`** — record `document.activeElement` as the opener; mark
   sibling surfaces inert (see 2); attach a `keydown` listener on the dialog for
   `Tab`/`Shift+Tab` wrapping and `Escape`; focus the first control matched by
   `preferredSelector`, else the first focusable descendant, else the dialog
   itself (with `tabindex="-1"` applied once, so the dialog is reachable and
   announced).
2. **Tab wrap** — compute the ordered list of focusable descendants
   (`a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])`),
   and wrap from last→first and first→last. The wrap arithmetic is extracted as
   a pure function so it is unit-testable without a DOM.
3. **`close()`** — remove listeners, clear inert, and restore focus to the
   recorded opener if it is still connected; otherwise leave focus on `body`.
   Calling `close()` twice, or `open()` twice, must be safe.
4. **Escape** — `opts.onDismiss` is invoked once per press. Panels wire it to
   their existing close path so `Escape`, the close button, and `KeyC` all
   converge on one implementation.

### 2. Make the background genuinely unavailable

While any modal is open, set `inert` on the top-level surfaces that are not the
active dialog (`#hud`, `#hotbar`, `#crosshair`, `#toast`, `#save-status`, and any
other open sibling panel). This is what makes the declared `aria-modal` truthful
for assistive technology, and it also removes the background from the Tab order
so the trap is a backstop rather than the only mechanism.

`inert` is supported in current Chromium, the browser the e2e suite drives, and it
degrades safely: where unsupported, the focus trap still applies.

### 3. Wire the helper into every panel

Each of the eleven panels keeps its existing `show()`/`hide()` signature and
semantics; the only change is that `show()` additionally opens the modal focus
handle and `hide()` closes it. Panels already own their element and their close
path, so this is a two-line change per panel plus Escape wiring.

Panels that open a *second* surface from within a modal (for example the recipe
book opened from the crafting panel) must close the parent handle before opening
the child, preserving the existing one-container rule, and restore focus to the
control that launched the child.

### 4. Align `death-screen`

Add `aria-modal="true"` to `death-screen` so it matches the other eleven, and
route it through the same helper.

### 5. Keep the logic unit-testable without a DOM

`vitest.config.ts` sets `environment: 'node'` and neither `jsdom` nor
`happy-dom` is installed, so DOM-level unit tests are not available. Therefore:

- the focusable-element ordering and Tab-wrap arithmetic are extracted as pure
  functions in `src/ui/ModalFocus.ts` and unit-tested directly in node;
- all real DOM behaviour (focus moves, background inert, focus returns, Escape
  dismisses) is proven in the browser e2e suite, which is the only place a real
  DOM exists.

This split is deliberate and must not be "fixed" by adding a DOM shim dependency.

## Compatibility and migration

- No product data, save format, or public API change.
- `index.html` gains one attribute on `death-screen`.
- Behaviour changes for keyboard users are strictly additive: previously
  unreachable controls become reachable in the intended order.
- Existing `KeyC` and close-button paths are unchanged; Escape is added.
- **No visual change is intended**, so the committed visual goldens must not
  move. If any golden changes, that is a defect in this change and must be
  investigated rather than re-pinned.

## Risks

- **Focus stealing could break existing flows.** Moving focus into a dialog could
  surface a pre-existing handler that reacts to focus. Mitigation: the change
  ships with a full e2e pass; any flow that depended on focus staying outside a
  dialog is itself a bug being corrected.
- **`inert` on `#hud` could break HUD interactions** if any HUD control must
  remain operable while a modal is open. Mitigation: the one-container rule means
  exactly one surface is interactive at a time; verify with the existing
  lifecycle e2e specs (each already asserts close/walk-away/blur behaviour).
- **Duplicate handles** if a panel's `show()` runs twice. Mitigation: `open()` on
  an already-open handle is a no-op, and `close()` is idempotent; both are
  unit-tested.
- **Escape colliding with pointer-lock behaviour.** Escape already releases
  pointer lock at the browser level. Mitigation: when a modal is open, pointer
  lock is not held, so the handler only runs in the intended state; the e2e
  suite asserts Escape closes the panel rather than only unlocking.

## Rollback strategy

Revert `src/ui/ModalFocus.ts`, the per-panel wiring, and the `index.html`
attribute. There is no persisted state and no schema change, so rollback is a
pure code revert.

## Definition of Done

- Opening any of the eleven modals moves focus to a control inside it.
- Tab and Shift+Tab cycle only within the open modal and wrap at both ends.
- Closing a modal returns focus to the element that opened it.
- Escape closes an open modal through the same path as the close button.
- Background surfaces are `inert` while a modal is open and not inert after close.
- `death-screen` declares `aria-modal="true"`.
- Pure helpers are covered by node-environment unit tests; DOM behaviour is
  covered by browser e2e tests that assert `document.activeElement`.
- No committed visual golden changes.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
  `npm run validate-state`, `npm run test:e2e` all PASS, and lint stays at 0
  errors with no increase over the 85 pre-existing warnings.

## Advancement gate

All mandatory gates PASS on the candidate SHA. The change is only VERIFIED when
the browser e2e assertions above actually observe the focus behaviour — a passing
unit suite alone is insufficient evidence for this capability, because the
behaviour is inherently DOM-level.
