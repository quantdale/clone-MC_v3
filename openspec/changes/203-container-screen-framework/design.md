# Design: 203-container-screen-framework

## Context/current state
- 106 provides the validated `ContainerMenu` and click/quickMove transactions; 202 adds drag,
  gather, and hotbar swap. No reusable screen binds them. 203 adds the state + event reducer;
  the UI layer renders the state.

## Target state
- `src/inventory/ContainerScreenFramework.ts` holding `ContainerScreenState`, screen creation and
  validation, and `applyScreenEvent`.

## Invariants
- Pure and headless-safe: no DOM access, no mutation of inputs, no randomness.
- Every event produces a NEW screen state or the IDENTICAL state for a no-op (identity semantics
  inherited from 106/202).
- Drag indices are validated at `dragStart`/`dragHover`; `dragEnd` only ever sees valid indices.
- Invalid indices throw descriptive errors (106-style); `selectedHotbar` is always an integer in
  [0, 8].
- `validateContainerScreen` validates the whole payload (menu via 106, drag shape, hotbar) before
  accepting anything.

## API and data model
```ts
// src/inventory/ContainerScreenFramework.ts (new)
export interface ContainerScreenState {
  menu: ContainerMenu;
  drag: DragState;
  selectedHotbar: number;   // 0..8
}
export function createContainerScreen(menu: ContainerMenu): ContainerScreenState;
export function validateContainerScreen(input: unknown): ContainerScreenState;

export type ContainerScreenEvent =
  | { type: 'click'; index: number; button: 'left' | 'right' }
  | { type: 'dragStart'; index: number; button: DragButton }
  | { type: 'dragHover'; index: number }
  | { type: 'dragEnd' }
  | { type: 'doubleClick'; index: number }
  | { type: 'quickMove'; index: number }
  | { type: 'hotbarSwap'; hotbarIndex: number; targetIndex: number }
  | { type: 'selectHotbar'; index: number };

export function applyScreenEvent(state: ContainerScreenState, event: ContainerScreenEvent): ContainerScreenState;
```

## Control/data flow
1. The UI layer validates hover/click indices against the menu and dispatches events.
2. `applyScreenEvent` routes: click -> 106 (`leftClick`/`rightClick`); dragStart/hover/end ->
   202; doubleClick -> 202 gather; quickMove -> 106; hotbarSwap -> 202; selectHotbar -> state.

## Detailed behavior
- `createContainerScreen(menu)`: `{ menu, drag: createDragState(), selectedHotbar: 0 }`.
- `validateContainerScreen(input)`: object check -> `ContainerScreen: expected an object`; menu
  via 106's `validateContainerMenu` (its error text passes through); drag must be an object with
  `active` boolean, `button` in {left, right}, `startSlot` integer >= -1, `hovered` an array of
  unique integers in [0, slots.length); `selectedHotbar` an integer in [0, 8]; unknown top-level
  keys rejected (`unknown key <k>`).
- `applyScreenEvent`:
  - `click` -> `applyMenuTransaction` with `leftClick`/`rightClick` (out-of-bounds throws 106's
    message).
  - `dragStart` -> validates the index, then 202's `dragStart` (drag state only).
  - `dragHover` -> validates the index, then 202's `dragHover` (identity when inactive/duplicate).
  - `dragEnd` -> 202's `dragEnd` (menu + drag).
  - `doubleClick` -> 202's `doubleClickGather`.
  - `quickMove` -> 106's `quickMove` transaction.
  - `hotbarSwap` -> 202's `hotbarSwap` (throws for non-hotbar indices).
  - `selectHotbar` -> `index` not an integer in [0, 8] throws
    `ContainerScreen: hotbar selection <i> is out of range`; same value identity no-op.

## Failure modes
- Descriptive throws for invalid indices/selections and malformed screen state (106-style).
- Identity no-ops inherited from 106/202 (empty cursor dragEnd, mismatched gather, same-index
  swap, etc.).

## Compatibility/migration
- One new inventory file; 106/202 untouched; no `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- O(menu slots) worst case (gather/quickMove); drag events O(hovered); click/select O(1).

## Testing seams
- Tests build menus via 106's `createContainerMenu` and drive every event; a composed flow
  (click pickup -> dragStart -> dragHover -> dragEnd) exercises the binding end to end.

## Observability/debugging
- The screen state is a plain immutable object; a dispatched event's result fully determines the
  next state.

## Affected files/symbols
- `src/inventory/ContainerScreenFramework.ts` (new).
- Tests: `tests/unit/ContainerScreenFramework.test.ts` (new). No other files.

## Rejected alternatives
- **A class-based screen with internal mutable state**: rejected — the pure reducer over
  immutable state matches 106/202 and keeps the framework testable headlessly.

## Downstream dependencies
- 204 (`recipe-book`) binds known recipes into screens; 205 closes the inventory-parity arc; the
  UI layer renders `ContainerScreenState`.
