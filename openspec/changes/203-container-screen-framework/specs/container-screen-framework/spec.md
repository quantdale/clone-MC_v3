# Spec: container-screen-framework

## Contract
This capability adds the reusable container screen: an immutable `{ menu, drag, selectedHotbar }`
state, screen-level validation, and a typed event reducer binding 106's transactions and 202's
interactions — menu-agnostic, pure, and headless-safe.

## Definitions
- **Screen state**: `{ menu: ContainerMenu, drag: DragState, selectedHotbar: 0..8 }`.
- **Screen event**: one of `click`, `dragStart`, `dragHover`, `dragEnd`, `doubleClick`,
  `quickMove`, `hotbarSwap`, `selectHotbar`.

## Invariants
- Pure and headless-safe: no DOM access, no mutation of inputs, no randomness.
- Events MUST produce a new state or the IDENTICAL state for a no-op (106/202 identity
  semantics).
- Drag indices MUST be validated at `dragStart`/`dragHover`; `dragEnd` only sees valid indices.
- Invalid indices/selections MUST throw descriptive errors; `selectedHotbar` MUST always be an
  integer in [0, 8].
- `validateContainerScreen` MUST validate the entire payload before accepting anything.

## Requirements

### Requirement: creation and validation
`createContainerScreen(menu)` MUST return `{ menu, drag: inactive, selectedHotbar: 0 }`.
`validateContainerScreen(input)` MUST accept a valid screen and MUST throw a descriptive `Error`
for a non-object, an invalid menu (106's messages), a malformed drag (non-boolean `active`,
unknown `button`, non-integer `startSlot`, non-array/duplicate/out-of-bounds `hovered`), an
out-of-range `selectedHotbar`, and unknown top-level keys.

#### Scenario: validation
- **GIVEN** a valid screen built over an 18-slot menu, `null`, a screen with
  `selectedHotbar: 9`, a screen with `drag.hovered: [3, 3]`, and a screen with an extra
  `{ extra: true }` key
- **THEN** the valid screen validates; the others throw mentioning `expected an object`,
  `hotbar selection`, `drag.hovered must contain unique in-bounds integers`, and `unknown key`
  respectively

### Requirement: click and quickMove route to 106
`click` with button `left`/`right` MUST apply 106's `leftClick`/`rightClick` transaction at the
index; `quickMove` MUST apply 106's `quickMove`; out-of-bounds indices MUST throw 106's message.

#### Scenario: clicks
- **GIVEN** a screen whose slot 0 holds `a` x 5 and a `click` left at 0
- **THEN** the cursor holds `a` x 5 and slot 0 is empty; a `click` right at 2 on an `a` x 5 slot
  picks up 3 (`ceil(5/2)`); `click` left at 99 throws `index 99 is out of bounds`

### Requirement: drag events bind 202
`dragStart`/`dragHover` MUST validate the index (throwing otherwise) and update the drag state;
`dragEnd` MUST apply 202's distribution and clear the drag.

#### Scenario: drag flow
- **GIVEN** a screen whose cursor holds `a` x 5 (picked up by a click), then `dragStart` at 2
  (left), `dragHover` at 5, and `dragEnd`
- **THEN** slot 2 holds `a` x 3, slot 5 holds `a` x 2, the cursor is empty, and the drag is
  inactive; `dragHover` at 99 throws `hovered index 99 is out of bounds`

### Requirement: double-click and hotbar events
`doubleClick` MUST apply 202's gather; `hotbarSwap` MUST apply 202's swap (throwing for non-hotbar
indices); `selectHotbar` MUST set the selection for integers in [0, 8], identity-no-op on the same
value, and throw for anything else.

#### Scenario: gather, swap, selection
- **GIVEN** a screen with `a` x 20 and `a` x 30 in two slots and an empty cursor
- **THEN** `doubleClick` at 0 gathers 50 into the cursor and drains both slots; `hotbarSwap` with
  `hotbarIndex` 5 in a container region throws `hotbarIndex 5 is outside the hotbar range`;
  `selectHotbar` 3 sets the selection, 3 again is an identity no-op, and 9 throws
  `hotbar selection 9 is out of range`

## Error and failure behavior
- Descriptive throws for invalid indices/selections and malformed screen state; 106's messages
  pass through for its own errors.
- Identity no-ops inherited from 106/202 for all no-op cases.

## Performance and resource bounds
- O(menu slots) worst case (gather/quickMove); drag events O(hovered); click/select O(1).

## Compatibility and migration
- One new inventory file; 106/202 untouched; no `Game.ts` edit; no schema/save-format change.

## Security and integrity
- Pure functions; indices validated before any underlying module runs.

## Observability
- The screen state is a plain immutable object; events deterministically transform it.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation/validation | `tests/unit/ContainerScreenFramework.test.ts` › creation and validation |
| REQ-2 click/quickMove | › clicks |
| REQ-3 drag binding | › drag flow |
| REQ-4 gather/swap/selection | › gather, swap, selection |
