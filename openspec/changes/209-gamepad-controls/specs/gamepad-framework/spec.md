# Spec: gamepad-framework

## Contract
This capability adds the pure gamepad input model: deadzone handling, movement/look stick
vectors, the standard-mapping resolution of pressed buttons to 207's actions, and dpad/face-
button UI navigation — headless-safe (the wiring feeds raw arrays from the browser API).

## Definitions
- **Deadzone**: values within ±threshold (inclusive) map to 0; others pass through.
- **Button map**: `KeybindingAction -> standard gamepad button index`.
- **UI navigation**: the raw dpad (up=12, right=13, down=14, left=15) and face (confirm A=0,
  cancel B=1) states.

## Invariants
- Pure and headless-safe: no Gamepad API access, no mutation of inputs, no throws.
- `applyDeadzone` MUST map `|value| <= threshold` to 0 and pass other values through unchanged
  (default threshold 0.15).
- `pressedActions` MUST return actions in `KEYBINDING_ACTIONS` order, MUST treat missing button
  indices as unpressed, and MUST honor a custom action map per action.
- `uiNav` MUST be a total function of the button array.

## Requirements

### Requirement: deadzone
`applyDeadzone(value, threshold?)` MUST return 0 for values within ±threshold inclusive and the
value unchanged otherwise; the default threshold MUST be 0.15.

#### Scenario: deadzone
- **GIVEN** values 0, 0.15, -0.15, 0.16, -0.16, 0.5 and a custom threshold 0.3
- **THEN** the results are 0, 0, 0, 0.16, -0.16, 0.5; with threshold 0.3, 0.3 -> 0 and 0.31 ->
  0.31

### Requirement: stick vectors
`movementVector(leftStick)` and `lookVector(rightStick)` MUST deadzone each axis.

#### Scenario: sticks
- **GIVEN** `{ x: 0.5, y: -0.1 }`, `{ x: 0.1, y: 0.2 }`, and `{ x: 1, y: -1 }`
- **THEN** the vectors are `{ x: 0.5, y: 0 }`, `{ x: 0, y: 0.2 }`, and `{ x: 1, y: -1 }`

### Requirement: button map and action resolution
`GAMEPAD_BUTTON_MAP` MUST map jump=0, sneak=1, attack=6, use=7, swapOffhand=3, drop=5,
inventory=8, chat=9. `pressedActions(buttons, actionMap?)` MUST return the pressed actions in
action order; short arrays and missing indices MUST be treated as unpressed; a custom map MUST
override the default per action.

#### Scenario: pressed actions
- **GIVEN** a 10-button array with indices 0 and 7 true; a 3-button array with index 0 true; a
  custom map `{ jump: 1 }` over a 2-button array with index 1 true
- **THEN** the results are `['jump', 'use']`, `['jump']` (indices 6-9 treated unpressed), and
  `['jump']` (custom map); an all-false array yields `[]`

### Requirement: UI navigation
`uiNav(buttons)` MUST report the dpad and face-button states.

#### Scenario: navigation
- **GIVEN** a 16-button array with indices 12 and 0 true, and an empty array
- **THEN** the first is `{ up: true, down: false, left: false, right: false, confirm: true,
  cancel: false }` and the second is all-false

## Error and failure behavior
- None — total functions over raw inputs.

## Performance and resource bounds
- O(buttons + actions) per call.

## Compatibility and migration
- One new simulation file; 207 untouched; no `Game.ts` edit; no save-format change.

## Security and integrity
- Pure functions; raw arrays are never mutated.

## Observability
- All functions are total and deterministic; button maps are exported constants.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 deadzone | `tests/unit/GamepadFramework.test.ts` › deadzone |
| REQ-2 sticks | › stick vectors |
| REQ-3 actions | › button map and action resolution |
| REQ-4 navigation | › UI navigation |
