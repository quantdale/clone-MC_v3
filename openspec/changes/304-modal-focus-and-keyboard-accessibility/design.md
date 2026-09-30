# Design: 304-modal-focus-and-keyboard-accessibility

## Context/current state

### What the markup promises

Eleven elements in `index.html` declare themselves modal dialogs:

```
advancements, brewing, crafting, creative, enchanting, furnace,
gamerule, recipebook, recovery, statistics, trading
```

each carrying `role="dialog"` and `aria-modal="true"`, with labelling and
descriptive elements referenced. `death-screen` carries `role="dialog"` with
`aria-labelledby` and `aria-describedby` but **no** `aria-modal`.

That is good, deliberate markup. The defect is entirely in the runtime.

### What the runtime does

Every panel opens by toggling a class:

```ts
// src/ui/TradingPanel.ts:97-105
show(): void { this.el.classList.remove('hidden'); … }
hide(): void { … this.el.classList.add('hidden'); … }
```

Measured across all ten panel classes, `show()`/`hide()` contain **zero**
focus-related calls. Across the whole UI codebase there is exactly one
`focus()` invocation, and it belongs to a different flow:

```
src/engine/Game.ts:3021:    this.recoveryBackupBtn.focus();
```

There is no focus containment and no background isolation:

```
$ grep -rn "inert\|focusTrap\|trapFocus\|tabIndex" src --include='*.ts' | grep -v facade
(no matches)
$ grep -c 'inert' index.html
0
```

and no Escape handling anywhere:

```
$ grep -rn "Escape" src --include='*.ts' | grep -v escapeHtml
(no matches — all "ESC" hits are RAID_ESCALATION / ESCALATE_RAID)
```

Panels close via `KeyC` alone (`src/engine/InputManager.ts:381,421`).

And nothing tests any of it:

```
$ grep -rn "toBeFocused\|activeElement" tests/
(no matches)
```

### The concrete user-visible defect

`aria-modal="true"` tells a screen reader the rest of the page is unavailable. In
reality the keyboard focus never enters the dialog. A keyboard-only user who
opens, say, the crafting panel and presses `Tab` walks through background
controls — the HUD buttons, hotbar, and any other focusable elements sitting
behind the overlay — rather than through the panel's own controls. Assistive
technology and the actual focus ring disagree, which is the specific mismatch
`aria-modal` exists to prevent.

### Why this was not caught

Changes 208 (`accessibility-options`) and 246 (`input-accessibility-matrix`) are
recorded VERIFIED and cover settings and input-device interaction. Neither
addressed modal focus semantics, and no test asserts focus, so the gap is
invisible to the existing suite.

## Target state

1. A single first-party `ModalFocus` helper owning open/close semantics.
2. Every modal routes its `show()`/`hide()` through that helper.
3. Focus enters on open, is contained while open, and returns to the opener.
4. Background surfaces are `inert` while a modal is open, making the declared
   `aria-modal` truthful.
5. Escape, `KeyC`, and the close control converge on one dismiss path.
6. `death-screen` declares the same modal semantics as the other eleven.

## Invariants

- No rendering change: committed goldens must not move.
- `KeyC` and close-control behaviour unchanged.
- Open/close are idempotent; no leaked listeners; no residual `inert`.
- A user can never become trapped: the dismiss path is always reachable by
  keyboard.
- No new runtime dependency.

## API and data model

```ts
// src/ui/ModalFocus.ts

/** Selector for elements that can hold focus inside a dialog. */
export const FOCUSABLE_SELECTOR: readonly string[];

/** Pure: order the given candidates as they appear in document order. */
export function focusableOrder<T>(nodes: ArrayLike<T>): T[];

/**
 * Pure: index reached by Tab (dir=+1) or Shift+Tab (dir=-1) from `current`
 * within `count` items, wrapping at both ends. count === 0 -> -1.
 */
export function nextFocusIndex(current: number, count: number, dir: 1 | -1): number;

export interface ModalFocusOptions {
  /** Invoked once per Escape press while open. */
  onDismiss?: () => void;
  /** Tried before the generic focusable scan. */
  preferredSelector?: string;
  /** Elements to inert while open; defaults to the computed background set. */
  background?: () => HTMLElement[];
}

export interface ModalFocusHandle {
  open(dialog: HTMLElement): void;
  close(): void;
  readonly active: boolean;
}

export function createModalFocus(opts?: ModalFocusOptions): ModalFocusHandle;
```

Why `nextFocusIndex` is pure and exported: it is the piece with real off-by-one
risk, and extracting it makes the risk testable in a `node` environment where no
DOM exists.

### Background surface discovery

Rather than hard-coding a selector list per panel, the helper treats the modal's
own root (`#ui-root`) as the scope and inert-s every descendant subtree that does
not contain the dialog, plus any element outside `#ui-root` that is not the
dialog. `#ui-root` is the single UI root in `index.html`, which makes this a
local, well-bounded computation:

```
open(dialog):
  opener   = document.activeElement
  scope    = dialog.closest('#ui-root') ?? document.body
  for each child subtree of scope where !child.contains(dialog):
      background.push(child)
  apply inert to each background entry
  attach keydown(Tab, Shift+Tab, Escape) on dialog
  focus(preferred ?? firstFocusable(dialog) ?? ensureFocusable(dialog))

close():
  remove keydown listener
  clear inert from every background entry recorded at open
  if opener?.isConnected -> opener.focus() else document.body.focus?.()
```

### Why `inert` in addition to the trap

The trap alone fixes the Tab order for keyboard users but leaves assistive
technology free to walk into the background, which is exactly what `aria-modal`
promised would not happen. Setting `inert` satisfies both, and it removes the
background from the tab order so the wrap logic is a backstop rather than the
only defence. Chromium — the browser the e2e suite drives — supports `inert`;
where it does not, the trap still applies and the capability degrades safely
rather than failing.

### Panel integration

Each panel keeps its existing signature; `show()` additionally calls
`focus.open(this.el)` and `hide()` calls `focus.close()`, with Escape wired to
the panel's existing close implementation. Roughly two lines per panel.

Nested surfaces (the recipe book opened from the crafting panel) close the parent
handle before opening the child so focus restoration lands on the launching
control rather than on a control inside the parent that is about to hide.

## Control/data flow

```
user presses 'T' (or clicks Trade)
        │
        ▼
Game → tradingPanel.show()
        │
        ▼
ModalFocus.open(dialog)
        ├─ opener   = document.activeElement        (the Trade button)
        ├─ scope    = #ui-root
        ├─ inert    ← every subtree not containing the dialog
        ├─ dialog.addEventListener('keydown', onKeyDown)
        │       ├─ Tab / Shift+Tab  → nextFocusIndex(...) → focus(target)
        │       └─ Escape           → onDismiss() → panel.close()
        └─ focus(preferred ?? firstFocusable ?? dialog[tabindex=-1])

user presses Escape  ─▶ onDismiss ─▶ panel.close()
                               └▶ ModalFocus.close()
                                     ├─ removeEventListener
                                     ├─ clear inert
                                     └─ opener.focus()   (focus returns to Trade)
```

## Detailed behavior

### Pure helpers

`nextFocusIndex(current, count, dir)`:

```
count <= 0            -> -1
current out of range  -> dir === 1 ? 0 : count - 1
dir === 1             -> (current + 1) % count
dir === -1            -> (current - 1 + count) % count
```

Unit-tested for `count` of 0, 1, 2, and 5; `current` at every index; both
directions; and out-of-range input.

### Idempotency

`open()` on an already-open handle returns without re-recording the opener —
important, because a repeated `show()` must not overwrite the true opener with
the dialog's own internal control and strand focus on close. `close()` on an
inactive handle returns immediately. Both are unit-tested via an injected fake
DOM surface.

### Error paths

If the dialog element is missing or not connected at `open()`, the helper throws
a named error rather than silently leaving focus in the background. If the
opener has been detached at `close()`, focus falls back to the document body.
Both are covered by tests.

## Failure modes

| Failure | Behaviour |
|---|---|
| `open()` with a detached/null dialog | Throw `Error("ModalFocus.open: dialog not connected")`; never silently succeed |
| `open()` twice | Second call is a no-op; opener not overwritten |
| `close()` twice / never opened | No-op; no listener leak; no residual inert |
| Opener detached before close | Focus falls back to `document.body`; no throw |
| `inert` unsupported | Trap still contains Tab; capability degrades, does not break |
| A panel's close path throws | Inert MUST still be cleared (clear in a `finally`) |

## Compatibility/migration

- `index.html`: one added attribute on `death-screen`.
- `src/ui/ModalFocus.ts`: new file.
- Panels: additive `show()`/`hide()` lines plus Escape wiring.
- No save data, no API, no rendering change.

## Performance/resource constraints

- `open()` runs once per user action: one `querySelectorAll` over the dialog and
  one pass over the scope children. No per-frame cost.
- The Tab path performs no layout-forcing reads; it reuses the focusable list
  captured at open, refreshed only if the dialog's contents change (the panels
  are rebuilt on `show()`, so a refresh per open is sufficient).
- No new dependency; the helper is ~100 lines of first-party code.

## Testing seams

The environment constraint is real and shapes the split:

```
vitest.config.ts:6:  environment: 'node'
$ ls node_modules | grep -iE '^jsdom|happy-dom'
(not installed)
```

So:

* **Node unit tests** cover `nextFocusIndex`, `focusableOrder`, the idempotency
  rules, and the background-computation predicate — all as pure functions or
  against a small fake element surface.
* **Browser e2e tests** cover everything that requires a real DOM: focus lands
  inside on open, Tab wraps and cannot escape, background is inert, Escape
  dismisses exactly once, focus returns to the opener on close, and
  `death-screen` now carries `aria-modal`.

This split must be preserved; adding a DOM-emulation dependency to make the unit
suite look complete would be scope creep and a new supply-chain surface.

## Observability

`handle.active` exposes whether the helper currently owns focus, so tests and
diagnostics assert modal state directly instead of inferring it. No new build-time
instrumentation hook is introduced — the e2e suite observes the real document.

## Affected files/symbols

**New**
- `src/ui/ModalFocus.ts`
- `tests/unit/ModalFocus.test.ts`
- an e2e spec (for example `tests/e2e/modal-focus.spec.ts`)

**Modified**
- `src/ui/TradingPanel.ts`, `FurnacePanel.ts`, `BrewingPanel.ts`,
  `EnchantingPanel.ts`, `GameRulePanel.ts`, `RecipeBookPanel.ts`,
  `AdvancementPanel.ts`, `StatisticsPanel.ts`, `CreativeMenuPanel.ts`,
  `DeathRespawnPanel.ts` — `show()`/`hide()` wiring and Escape
- the recovery surface in `src/engine/Game.ts` (3021 area) — route through the
  helper
- `index.html` — `aria-modal="true"` on `death-screen`
- `tests/visual-golden/**` — MUST NOT change

**Explicitly not modified**
- every committed `*.png`
- `src/engine/InputManager.ts` key meanings (Escape is additive)
- any file under `src/simulation/`, `src/world/`, `src/storage/`

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Adopt a focus-trap library | Adds a runtime dependency to a project with a deliberate, audited dependency surface, for behaviour that is ~100 lines. The repo already treats dependency additions as a cost (change 268 pins, audit gates). |
| Add `jsdom` and unit-test DOM behaviour in node | Would let the unit suite assert DOM behaviour, but adds a dev dependency and duplicates what the browser suite already proves more faithfully. |
| Only add Escape, leave focus alone | Escape is the least important part. The real defect is that focus never enters the dialog; Escape-only would treat the symptom. |
| Only set `inert` on background, no trap | Fixes assistive technology but leaves a keyboard user able to Tab behind the dialog where `inert` is unsupported. Both mechanisms are cheap and complementary. |
| Reorder tab order with `tabindex` everywhere | A large, fragile markup change across every panel. The trap achieves containment without touching each control. |
| Move focus only to the dialog, not to a control | Technically satisfies "focus is inside" but wastes the first Tab press on entering the content and is a worse experience than focusing the primary control. |
| Mark this as a documentation-only note | The markup already promises the behaviour; documenting the gap does not make `aria-modal` truthful. |

## Downstream dependencies

None blocking. The only shared surfaces with changes 298–303 are the e2e suite
and `index.html`; change 300 edits goldens and the visual harness rather than
`index.html`, so coordinate only if both are in flight simultaneously.
