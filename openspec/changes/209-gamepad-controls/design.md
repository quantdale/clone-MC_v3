# Design: 209-gamepad-controls

## Context/current state
- Input is keyboard-only. 209 adds the pure gamepad model: deadzone, stick vectors, the
  standard button mapping to 207's actions, and dpad/face-button UI navigation. The wiring polls
  the browser Gamepad API and feeds raw arrays in.

## Target state
- `src/simulation/GamepadFramework.ts` holding the deadzone function, stick vectors, the button
  map, `pressedActions`, and `uiNav`.

## Invariants
- Pure and headless-safe: no Gamepad API access, no mutation of inputs, no throws.
- `applyDeadzone` maps values within ±threshold INCLUSIVE to 0 and passes others through
  unchanged; the default threshold is 0.15.
- `pressedActions` returns actions in `KEYBINDING_ACTIONS` order; missing button indices are
  treated as unpressed; a custom map overrides the default per action.
- `uiNav` is a total function of the button array (absent indices = false).

## API and data model
```ts
// src/simulation/GamepadFramework.ts (new)
export const GAMEPAD_DEADZONE = 0.15;
export function applyDeadzone(value: number, threshold?: number): number;

export interface GamepadAxisPair { x: number; y: number; }
export function movementVector(leftStick: GamepadAxisPair): GamepadAxisPair;
export function lookVector(rightStick: GamepadAxisPair): GamepadAxisPair;

export const GAMEPAD_BUTTON_MAP: Readonly<Partial<Record<KeybindingAction, number>>>;
export function pressedActions(buttons: readonly boolean[], actionMap?: Readonly<Partial<Record<KeybindingAction, number>>>): KeybindingAction[];

export interface UiNavState {
  up: boolean; down: boolean; left: boolean; right: boolean;
  confirm: boolean; cancel: boolean;
}
export function uiNav(buttons: readonly boolean[]): UiNavState;
```

## Control/data flow
1. The wiring polls the Gamepad API each frame into axis pairs and a boolean button array.
2. Movement/look consumers use `movementVector`/`lookVector`; input dispatch uses
   `pressedActions`; the UI layer uses `uiNav` and edge-triggers itself.

## Detailed behavior
- `applyDeadzone(value, threshold = GAMEPAD_DEADZONE)`: `Math.abs(value) <= threshold` -> 0;
  else `value`. (Clamped to [-1, 1] by the wiring; not here — pass-through is the contract.)
- `movementVector`/`lookVector`: apply the deadzone per axis.
- `GAMEPAD_BUTTON_MAP` (standard mapping): jump 0 (A), sneak 1 (B), attack 6 (LT), use 7 (RT),
  swapOffhand 3 (Y), drop 5 (RB), inventory 8 (Back), chat 9 (Start).
- `pressedActions(buttons, actionMap = GAMEPAD_BUTTON_MAP)`: for each action in
  `KEYBINDING_ACTIONS` order, the mapped index `i` (when defined) pressed (`buttons[i] === true`)
  -> include the action.
- `uiNav(buttons)`: up = buttons[12], right = buttons[13], down = buttons[14], left = buttons[15],
  confirm = buttons[0] (A), cancel = buttons[1] (B).

## Failure modes
- None — total functions over raw inputs.

## Compatibility/migration
- One new simulation file; 207 untouched; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- O(buttons + actions) per call; constant-size arrays.

## Testing seams
- Tests drive the functions with hand-built arrays and exact deadzone boundaries.

## Observability/debugging
- All functions are total and deterministic; button maps are exported constants.

## Affected files/symbols
- `src/simulation/GamepadFramework.ts` (new).
- Tests: `tests/unit/GamepadFramework.test.ts` (new). No other files.

## Rejected alternatives
- **Analog movement thresholds (triggers)**: rejected — 209 covers sticks/buttons/dpad; trigger
  analog axes can reuse `applyDeadzone` in a later change.

## Downstream dependencies
- 210 (`touch-controls`) mirrors this pure-input pattern; the input wiring dispatches gamepad
  actions through 207's model; 242's e2e simulates gamepad input.
