# Verification: 304-modal-focus-and-keyboard-accessibility

Status: VERIFIED
Completion: 100%
Advancement allowed: true
Session start head: `88d53d897ab740d06032bb86e00716c9387356a7` (origin/main after change 303)
Published head: recorded in `openspec/PROGRAM_STATE.json` after publication

## Summary

The last audit finding (F-008) is closed. Twelve surfaces declared
`aria-modal="true"` — a promise to assistive technology that the rest of the page
is unavailable — while **nothing** moved focus into a dialog, `Tab` walked through
the HUD behind the overlay, `inert` appeared nowhere in the file, and `Escape` did
nothing anywhere in `src/`. The only `focus()` call in the entire UI was unrelated
(`Game.ts:3021`, focusing a recovery button).

A first-party `src/ui/ModalFocus.ts` now owns the lifecycle: focus moves into the
dialog on open, `Tab`/`Shift+Tab` are contained with wrapping, the background is
made genuinely `inert`, focus returns to the opener on close, and `Escape` routes
through the **same dismiss path** as the close control and `KeyC`.

## Baseline (measured at activation)

```
$ grep -c 'aria-modal="true"' index.html      -> 11   (death-screen omitted it)
$ grep -c 'inert' index.html                  -> 0
$ grep -rn "'Escape'" src/ | wc -l            -> 0
$ grep -rn '\.focus()' src/                   -> 1    (Game.ts:3021, unrelated)
$ grep -rn "toBeFocused\|activeElement" tests/ -> 0
```

Ten shared panel dialogs (`crafting`, `furnace`, `brewing`, `enchanting`,
`gamerule`, `recipebook`, `advancements`, `statistics`, `trading`, `creative`) plus
the `recovery` alertdialog declared `aria-modal`; `death-screen` declared
`role="dialog"` but **not** `aria-modal`. Zero focus assertions existed anywhere,
which is why the gap was invisible to the suite.

## The module (`src/ui/ModalFocus.ts`)

Pure, node-testable policy plus the DOM wiring:

| Export | Contract |
|---|---|
| `focusableOrder(container)` | focusable descendants in document order; skips `[inert]` subtrees, `disabled`, `aria-hidden="true"`, and `display:none`/`visibility:hidden` |
| `nextFocusIndex(current, count, direction)` | the wrapped index; `-1` when nothing is focusable; enters at the near end when focus is outside |
| `resolveInitialFocus(root, preferred?)` | the documented preference: preferred selector → first focusable descendant → root with `tabindex="-1"` |
| `ModalFocus` | `open`/`close`/`closeIfOpen`/`dispose`, `isOpen`, `openRoot` |
| `INERT_ATTRIBUTE` | `'inert'` |

Design decisions worth recording:

- **Escape never closes privately.** The `keydown` handler calls the caller's
  `onDismiss`, so the close control, `KeyC` and `Escape` converge on one
  implementation instead of three independent close routines (spec requirement).
  The test asserts `dismiss` fires exactly once per press **and** that
  `isOpen` is still true afterwards, proving the routing.
- **Inert marks are scoped.** The session records exactly the elements it inerted
  and removes only those on close, so a surface that was already inert is never
  silently cleared.
- **Switch safety.** Opening a second surface closes the first through its own
  dismiss path, so no stale listener or inert mark can accumulate and exactly one
  dialog is non-inert.
- **Idempotency.** Re-opening the same root is a no-op; `close()` twice,
  `close()` on a never-opened surface, and `dispose()` twice are all safe.
- **Opener restoration.** If the opener was removed (`isConnected === false`) or
  is no longer focusable, focus goes to `document.body` rather than being left on
  a detached element.
- The `keydown` listener is registered in the **capture** phase so a panel's own
  handler cannot swallow `Tab`/`Escape` first.

## Wiring (`src/engine/Game.ts`)

The existing `*Open` booleans remain the single source of truth. One
`syncModalFocus()` derives the currently-visible dialog from them, prefers the
nested `[aria-modal="true"]` element as the modal root, and hands it to
`ModalFocus` together with the background surfaces. It is called from all ten
panel `open*`/`close*` pairs (20 call sites) and from `dispose()`, which now
explicitly calls `modalFocus.dispose()`.

Background selection intentionally inerts **every** `#ui-root` child that is not
the open modal and does not itself contain a dialog. An earlier attempt inerted
only *currently visible* children, which was wrong: opening a modal hides the HUD,
so nothing was inert and the background stayed reachable. A second attempt inerted
*all* siblings including the other (hidden) dialogs, which broke the spec's
"switching surfaces" rule that a just-closed dialog must not be inert. The shipped
rule satisfies both.

`index.html` gained the missing `aria-modal="true"` on `#death-screen`, so every
`role="dialog"`/`role="alertdialog"` surface now declares it (12 total).

## Unit evidence

| File | Tests | What it pins |
|---|---|---|
| `tests/unit/ModalFocus.test.ts` | 12 | `nextFocusIndex` wrap/interior/out-of-range/single/empty **plus an exhaustive sweep** proving the result is always in `[0, count)`; structural assertions that Escape routes through `onDismiss`, `Tab` is prevented and wrapped, restoration uses the recorded opener, `tabindex="-1"` is added only when nothing inside is focusable, inert removal is scoped, and `index.html` declares 12 `aria-modal` surfaces with every dialog role carrying it |
| `tests/unit/ModalFocus.dom.test.ts` | 17 | the **real class** against a hand-built fake element tree: background inert while the modal is not, Tab/Shift+Tab wrapping in both directions, focus held on the dialog when it has no focusable content, opener restoration, body fallback when the opener was removed, never clearing an inert mark it did not add, open/close idempotency, never-opened close as a no-op, Escape routed exactly once per press without self-closing, other keys ignored, surface switching, `closeIfOpen` scoping, and `dispose` |

The repository deliberately ships **no** jsdom/happy-dom and the change spec
forbids adding one, so the DOM-level unit test uses a dependency-free fake whose
elements extend a stubbed `HTMLElement` base (making `instanceof` guards pass
without prototype surgery).

`src/ui/ModalFocus.ts` reaches **92.13% statements / 83.56% branches / 100%
functions / 98.57% lines**.

## Browser evidence (`tests/e2e/modal-focus.spec.ts`, 7 tests, all pass)

Every assertion reads `document.activeElement` or a real attribute — nothing is
inferred from source text.

| Test | Observed |
|---|---|
| opening a dialog moves focus into it and makes the background inert | focus inside `#gamerule`; `#hud` and `#hotbar` inert; `#gamerule` **not** inert; `inertCount > 0` |
| Tab/Shift+Tab containment | 30 `Tab` presses **and** 30 `Shift+Tab` presses all leave focus inside the dialog |
| Escape dismisses and restores focus | `#gamerule` hidden; `inertCount === 0`; `document.activeElement.id === 'gamerule-open'` (the recorded opener) |
| Escape with no modal open | no inert surfaces, no dialog opened or closed |
| switching surfaces | `#statistics` open and non-inert, `#gamerule` hidden and **not** inert |
| closing twice / closing an unopened dialog | no `pageerror`, `inertCount === 0` |
| death screen | live attribute `aria-modal="true"`, `role="dialog"` |

Three test bugs of my own were found and fixed during this work, recorded rather
than hidden: clicking the `#gamerule-open` HUD chip directly timed out (the chip is
hidden until pointer lock, so the test now focuses it programmatically to create a
genuine opener); `fetch('/')` inside `page.evaluate` has no base URL and threw, so
the assertion reads the live attribute; and the death-screen test never booted the
page, so the DOM did not exist yet.

## Commands (final, `304` candidate tree)

| Command | Result |
|---|---|
| `npx vitest run tests/unit/ModalFocus.test.ts tests/unit/ModalFocus.dom.test.ts` | **PASS — 12 + 17** |
| `npx playwright test tests/e2e/modal-focus.spec.ts` | **PASS — 7/7 (41 s)** |
| `npm run verify:deps` | **PASS** — 171 packages verified |
| `npm run verify:file-audit` | **PASS** — 3085 rows |
| `npm run validate-state` | **PASS** |
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS — 0 errors / 85 warnings** (returns to the pre-change warning count) |
| `npm test` | **PASS — 485 files, 5822 passed + 1 skipped, exit 0** |
| `npm run test:coverage` | **PASS — 91.84 / 88.60 / 94.68 / 93.19** vs 91/88/94/93 |
| `npm run build` | **PASS — 2.10 s** |
| `node scripts/check-release-bundle.mjs` | **PASS — 4 assets checked; no E2E hook found** |
| `npm run test:e2e` | **PASS — 144/144, exit 0**, including the 60-cell visual matrix |
| `node scripts/validate-file-audit.mjs <manifest>` | **PASSED — 3085 rows** |

## Edge/adversarial validation

- [x] Background unreachable: 30 Tab presses and 30 Shift+Tab presses never leave
      the dialog.
- [x] Forward and reverse wrapping both proven (unit and browser).
- [x] A dialog with no focusable content keeps focus on itself via `tabindex="-1"`.
- [x] Escape with nothing open has no effect.
- [x] Escape fires the dismiss path exactly once per press and does not close
      privately.
- [x] Repeated close, close-without-open, and double dispose are safe.
- [x] A removed opener falls back to `document.body`.
- [x] An inert mark the session did not add is preserved.
- [x] Switching surfaces leaves exactly one dialog non-inert.
- [x] `dispose()` leaves no listener or inert state behind.

## Migration/compatibility

- [x] **No rendering change and no golden churn**: `git diff --numstat --
      tests/visual-golden/` is empty; the 60-cell visual matrix passes unchanged.
- [x] No new dependency (no jsdom/happy-dom); the fake DOM is hand-written.
- [x] `KeyC` and the close controls behave exactly as before — they are unchanged;
      `syncModalFocus()` is added *after* their existing show/hide statements.
- [x] No panel signature changed; `ModalFocus` is additive.
- [x] Coverage thresholds unchanged (91/88/94/93) and all four metrics pass.

## Performance/resource validation

- [x] One `keydown` listener exists while a modal is open and none otherwise
      (asserted).
- [x] `syncModalFocus()` does a fixed 10-id scan per open/close, not per frame.
- [x] The unit suites add ~0.5 s to `npm test`; the browser spec runs in 41 s.

## Regression / debt status

- No regression introduced. Two self-inflicted regressions were caught by the
  repository's own gates and fixed: coverage lines dipped to 92.95% (below the 93
  floor) until the DOM-level unit test existed, and a lint error
  (`no-this-alias`) appeared in the new fake and was restructured away.
- The audit-authored 298–304 sequence is now **COMPLETE**.
- `258-real-world-runtime-performance-fps-recovery` remains **BLOCKED** at
  40/100. No headed FPS work, no GPU evidence, no 258 status change.

## Advancement Exception

Not required: every task is complete, every MUST/SHALL requirement in
`specs/modal-focus-accessibility/spec.md` has passing evidence above, all
mandatory tests pass, and no unresolved data-loss, corruption, determinism,
compatibility, security, or regression blocker remains.

## Final decision

**VERIFIED.** All twelve `aria-modal` surfaces now behave as modals — focus moves
in, `Tab` is contained with wrapping, the background is genuinely `inert`, focus
returns to the opener, and `Escape` converges on the same dismiss path as the close
control and `KeyC` — proven by both node-level tests of the real class and
real-browser assertions on `document.activeElement`.
