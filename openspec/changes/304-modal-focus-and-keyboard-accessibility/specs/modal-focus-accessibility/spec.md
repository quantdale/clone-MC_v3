# Spec: modal-focus-accessibility

## Contract

Every surface that declares `role="dialog"` with `aria-modal="true"` MUST behave
as a modal for keyboard and assistive-technology users: focus moves into it on
open, is contained within it while open, and returns to the opener on close.
The declared `aria-modal` state MUST be truthful — background surfaces MUST be
unavailable to assistive technology and to the Tab order while a modal is open.

Modal dismissal MUST be reachable through a conventional Escape affordance in
addition to the existing close control and `KeyC`, and all three MUST converge
on one dismiss path with identical effects.

## Definitions

- **Modal surface**: an element declaring `aria-modal="true"`. There are eleven
  at the base commit: ten unnamed shared panel dialogs (outer containers
  `crafting`, `furnace`, `brewing`, `enchanting`, `gamerule`, `recipebook`,
  `advancements`, `statistics`, `trading`, `creative`) plus `#recovery`
  (`role="alertdialog"`). `death-screen` is a `role="dialog"` element without
  `aria-modal` and is brought into scope by the consistent-semantics
  requirement below.
- **Focusable control**: a descendant matching
  `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])`, in document order.
- **Opener**: the element that had focus immediately before the modal opened.
- **Background surface**: a top-level UI element that is not the currently open
  modal — for example `#hud`, `#hotbar`, `#crosshair`, `#toast`, `#save-status`,
  or another panel that is simultaneously present in the DOM.
- **Dismiss path**: the single implementation a surface uses to close itself,
  reachable from its close control, from `KeyC`, and from `Escape`.

## Invariants

- Opening a modal MUST NOT change any rendering output. Committed visual
  goldens MUST NOT move as a consequence of this capability.
- Closing a modal MUST restore the DOM to its pre-open accessibility state:
  no listener may survive, no background surface may remain inert, and no
  attribute introduced by this capability may persist.
- `KeyC` and the close control MUST continue to work exactly as they do before
  this change.
- Opening and closing MUST be idempotent: opening twice, closing twice, or
  closing a surface that was never opened MUST NOT throw and MUST NOT leave a
  stale listener or stale focus lock.
- No new runtime dependency is introduced.

## ADDED Requirements

### Requirement: Opening a modal moves focus into it

When a modal surface is opened, keyboard focus MUST be moved to a control inside
it. The control MUST be, in order of preference: the first element matching the
surface's configured preferred selector; otherwise the first focusable
descendant; otherwise the surface element itself, which MUST be made focusable
via `tabindex="-1"` so that it can receive and announce focus.

The element that had focus before the open MUST be recorded as the opener.

#### Scenario: Preferred control receives focus

- **GIVEN** a modal whose preferred selector matches an element inside it
- **WHEN** the modal is opened
- **THEN** the matched element is the active element

#### Scenario: First focusable descendant receives focus

- **GIVEN** a modal with no preferred-selector match that contains at least one
  focusable control
- **WHEN** the modal is opened
- **THEN** the first focusable descendant in document order is the active element

#### Scenario: Dialog with no focusable content

- **GIVEN** a modal containing no focusable descendant
- **WHEN** the modal is opened
- **THEN** the modal element itself is the active element
- **AND** the modal element carries `tabindex="-1"`

#### Scenario: The opener is recorded

- **GIVEN** a control outside the modal currently has focus
- **WHEN** the modal is opened
- **THEN** that control is recorded as the opener for restoration

### Requirement: Focus is contained within an open modal

While a modal is open, activating Tab or Shift+Tab MUST move focus only among
that modal's focusable controls, wrapping from the last to the first on Tab and
from the first to the last on Shift+Tab. Focus MUST NOT reach a control outside
the open modal.

When the modal has no focusable control, Tab and Shift+Tab MUST leave focus on
the modal element rather than escaping it.

#### Scenario: Forward wrap

- **GIVEN** an open modal with `n > 1` focusable controls and focus on the last
- **WHEN** Tab is activated
- **THEN** focus is on the first control

#### Scenario: Reverse wrap

- **GIVEN** an open modal with `n > 1` focusable controls and focus on the first
- **WHEN** Shift+Tab is activated
- **THEN** focus is on the last control

#### Scenario: Interior traversal

- **GIVEN** an open modal with `n > 2` focusable controls and focus on an
  interior control
- **WHEN** Tab is activated
- **THEN** focus is on the next control in document order, not wrapped

#### Scenario: Background is unreachable

- **GIVEN** an open modal
- **WHEN** Tab is activated repeatedly past the last control
- **THEN** focus never lands on a control outside the modal

### Requirement: Background surfaces are unavailable while a modal is open

While a modal is open, every background surface MUST be marked `inert` so that it
is removed from the Tab order and is not exposed to assistive technology. When
the modal closes, every background surface MUST no longer be inert.

Inert state MUST reflect the currently open modal: opening one modal while
another closes MUST leave exactly one surface non-inert.

#### Scenario: Background is inert while open

- **GIVEN** a closed modal and visible background surfaces
- **WHEN** a modal is opened
- **THEN** each background surface is inert
- **AND** the open modal is not inert

#### Scenario: Inert is cleared on close

- **GIVEN** an open modal with inert background surfaces
- **WHEN** the modal is closed
- **THEN** no background surface remains inert

#### Scenario: Switching surfaces clears the previous one

- **GIVEN** modal A is open
- **WHEN** modal B is opened as the replacement for A
- **THEN** modal A is not inert
- **AND** modal B is not inert

### Requirement: Closing a modal restores focus to the opener

When a modal closes, focus MUST be restored to the recorded opener if that
opener is still present and focusable. If it is no longer present or no longer
focusable, focus MUST be moved to the document body rather than left on a
detached or hidden element.

Closing MUST be idempotent, and closing a surface that was never opened MUST NOT
throw.

#### Scenario: Normal restore

- **GIVEN** a modal opened from a focusable control
- **WHEN** the modal is closed
- **THEN** that control is the active element

#### Scenario: Opener no longer available

- **GIVEN** a modal whose opener was removed from the document while it was open
- **WHEN** the modal is closed
- **THEN** no exception is thrown
- **AND** the document body is the active element

#### Scenario: Repeated close

- **GIVEN** a modal that has already been closed
- **WHEN** close is performed again
- **THEN** no exception is thrown
- **AND** no stale listener or inert state remains

### Requirement: Escape dismisses an open modal

While a modal is open, activating Escape MUST invoke the modal's dismiss path
exactly once per key press, producing the same result as the close control and
`KeyC`. Escape MUST have no dismiss effect when no modal is open.

The close control, `KeyC`, and `Escape` MUST all converge on one dismiss
implementation rather than three independent close routines.

#### Scenario: Escape closes the modal

- **GIVEN** an open modal
- **WHEN** Escape is activated
- **THEN** the modal is closed through its dismiss path
- **AND** focus is restored per the close requirements

#### Scenario: Escape outside a modal

- **GIVEN** no modal is open
- **WHEN** Escape is activated
- **THEN** no modal is opened or closed

#### Scenario: Single dismiss implementation

- **WHEN** the modal, its close control, and the `KeyC` binding are inspected
- **THEN** each routes to the same dismiss path

#### Scenario: One effect per press

- **GIVEN** an open modal
- **WHEN** Escape is pressed once
- **THEN** the dismiss path is invoked exactly once

### Requirement: Modal surfaces declare consistent semantics

Every surface that behaves as a modal MUST declare `role="dialog"` and
`aria-modal="true"`. A surface MUST NOT declare `role="dialog"` while omitting
`aria-modal` if it is presented as modal.

#### Scenario: Consistent declarations

- **WHEN** every element declaring `role="dialog"` is inspected
- **THEN** each also declares `aria-modal="true"`

#### Scenario: Labelled and described

- **GIVEN** a modal surface
- **WHEN** it is inspected
- **THEN** it references a labelling element or provides an accessible name
- **AND** it references a description element when it presents descriptive
  detail such as an outcome, status, or error message

### Requirement: The behaviour is verifiable where it can actually be observed

Because the unit test environment has no DOM, the focusable-element ordering and
Tab-wrap arithmetic MUST be implemented as pure functions and covered by
node-environment unit tests, and the DOM-level behaviour MUST be covered by
browser tests that assert the document's active element.

No DOM-emulation dependency may be added to the unit suite to satisfy this
requirement.

#### Scenario: Pure logic unit tested

- **WHEN** the node-environment unit suite runs
- **THEN** the focusable-element ordering and wrap-index functions are exercised
  across zero, one, and many-control cases and both wrap directions

#### Scenario: DOM behaviour browser tested

- **WHEN** the browser suite runs
- **THEN** it observes the document's active element after opening a modal,
  after tabbing within it, after closing it, and after pressing Escape

#### Scenario: No new DOM dependency

- **WHEN** the dependency manifest is inspected
- **THEN** no DOM-emulation package has been added

## Error and failure behavior

- If the modal element cannot be found, the focus helper MUST fail closed and
  throw a named error identifying the surface; it MUST NOT silently leave focus
  in the background while reporting success.
- If the recorded opener has been detached, focus MUST fall back to the document
  body and MUST NOT be restored to a disconnected node.
- A `keydown` listener MUST be removed on close; a leaked listener MUST be
  observable as a test failure.
- `inert` attributes introduced by this capability MUST always be removed on
  close, including when close is triggered by an error path.

## Performance and resource bounds

- Focus handling MUST NOT run on a per-frame basis; open and close are discrete
  user actions.
- The focusable-descendant query MUST be performed once per open, not per
  keypress.
- No layout-forcing read (for example `getBoundingClientRect`) may be performed
  on the Tab path.
- The helper MUST add no runtime dependency and no measurable per-frame cost.

## Compatibility and migration

- No product data, save format, or network payload change.
- `index.html` gains `aria-modal="true"` on `death-screen` only.
- Keyboard behaviour change is strictly additive: previously unreachable controls
  become reachable in the intended order, and Escape is added. Existing `KeyC`
  and close-control behaviour is unchanged.
- No rendering change is intended; committed visual goldens MUST NOT move.

## Security and integrity

- Background inerting MUST NOT become a way to leave the game in a state where
  the UI is unusable. The close path MUST always remain reachable, including by
  keyboard, so a user can never be trapped by an unclosable modal.
- The helper MUST NOT evaluate any user-controlled string as markup or as a
  selector derived from untrusted input.

## Observability

- The helper MUST expose whether it currently owns focus, so tests and
  diagnostics can assert the modal state without inferring it from the DOM.
- Each open and close MUST be observable through the existing panel lifecycle
  seams, so an e2e test can assert focus transitions without new instrumentation
  hooks.

## Verification mapping

| Requirement | Verification |
|---|---|
| Open moves focus in | Browser test asserting `document.activeElement` for the preferred-selector, first-focusable, and no-focusable-content cases |
| Focus contained | Browser test tabbing past the last control and asserting focus stays inside; unit tests for wrap arithmetic in both directions |
| Background inert | Browser test asserting inert state while open, cleared after close, and correct when switching surfaces |
| Close restores focus | Browser tests for the normal restore, the detached-opener fallback, and repeated close |
| Escape dismisses | Browser test asserting close on Escape, no effect with no modal open, and exactly one dismiss invocation |
| Single dismiss path | Unit or source assertion that close control, `KeyC`, and Escape route to one implementation |
| Consistent semantics | Test enumerating every `role="dialog"` element and asserting `aria-modal="true"` is present |
| Observable where it matters | Node unit tests for the pure helpers; browser tests for DOM behaviour; dependency manifest check for absence of a DOM shim |
| No visual change | `git diff --numstat -- tests/visual-golden/` is empty |
