# Proposal: 209-gamepad-controls

## Problem
The game is keyboard-only: no gamepad stick/button model, no deadzone handling, no mapping to
207's actions, no UI navigation. Gamepad support needs a pure input model the wiring can feed.

## Goals
- `src/simulation/GamepadFramework.ts` (NEW), pure and headless-safe:
  - **Deadzone**: `GAMEPAD_DEADZONE` (0.15) and `applyDeadzone(value, threshold?)` — values
    within ±threshold (inclusive) map to 0, otherwise the value passes through unchanged.
  - **Sticks**: `movementVector(leftStick)` / `lookVector(rightStick)` — deadzoned `{ x, y }`
    axis pairs for movement and look.
  - **Buttons -> actions**: `GAMEPAD_BUTTON_MAP` — the standard-mapping button indices for
    207's button-actions (jump A=0, sneak B=1, attack LT=6, use RT=7, swapOffhand Y=3, drop
    RB=5, inventory Back=8, chat Start=9); `pressedActions(buttons, actionMap?)` resolves the
    pressed buttons to `KeybindingAction`s in action order (short button arrays treat missing
    indices as unpressed; a custom map overrides the default).
  - **UI navigation**: `uiNav(buttons)` — `{ up, down, left, right, confirm, cancel }` from the
    dpad (up=12, right=13, down=14, left=15) and face buttons (confirm A=0, cancel B=1); the UI
    layer edge-triggers from this raw state.

## Non-goals
- **No Gamepad API access** (the wiring polls the browser API and passes arrays in), **no
  vibration**, **no deadzone calibration UI**, **no change to 207**, **no `Game.ts` edit**, **no
  save-format change**.

## Preconditions
- Change 208 (`accessibility-options`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- 207's `KeybindingAction` type (imported type only).

## Proposed change
1. `src/simulation/GamepadFramework.ts` (NEW): deadzone, stick vectors, the button map, action
   resolution, and UI navigation.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Deadzone semantics drift**. Mitigation: the inclusive ±threshold boundary is pinned (0.15 ->
  0, 0.16 -> 0.16), including negatives.
- **Button-index drift**. Mitigation: the map constants and the dpad indices are pinned in tests.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: deadzone (0, boundary, above, negative, custom threshold); stick vectors
  (clean, deadzoned, partial); the button map constants; pressedActions (none, single, multiple,
  short arrays, custom map override, order); uiNav (all six directions/buttons, absent dpad).
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
