/**
 * Gamepad framework (209): the pure gamepad input model — deadzone handling, movement/look
 * stick vectors, the standard-mapping resolution of pressed buttons to 207's actions, and
 * dpad/face-button UI navigation. Headless-safe: no Gamepad API access (the wiring polls the
 * browser API and passes raw arrays in), no mutation of inputs, no throws.
 *
 * Determinism rules:
 * - `applyDeadzone` maps |value| <= threshold (INCLUSIVE) to 0 and passes everything else
 *   through unchanged; the default threshold is 0.15.
 * - `pressedActions` returns actions in `KEYBINDING_ACTIONS` order; missing button indices are
 *   treated as unpressed; a custom map overrides the default per action.
 * - `uiNav` is a total function of the button array.
 */
import { KEYBINDING_ACTIONS, type KeybindingAction } from './KeybindingFramework';

/** The default stick deadzone. */
export const GAMEPAD_DEADZONE = 0.15;

/** Map values within ±threshold (inclusive) to 0; pass others through unchanged. */
export function applyDeadzone(value: number, threshold: number = GAMEPAD_DEADZONE): number {
  return Math.abs(value) <= threshold ? 0 : value;
}

/** A raw two-axis input pair (stick). */
export interface GamepadAxisPair {
  readonly x: number;
  readonly y: number;
}

function deadzoned(pair: GamepadAxisPair): GamepadAxisPair {
  return { x: applyDeadzone(pair.x), y: applyDeadzone(pair.y) };
}

/** The deadzoned left-stick movement vector. */
export function movementVector(leftStick: GamepadAxisPair): GamepadAxisPair {
  return deadzoned(leftStick);
}

/** The deadzoned right-stick look vector. */
export function lookVector(rightStick: GamepadAxisPair): GamepadAxisPair {
  return deadzoned(rightStick);
}

/**
 * The standard gamepad button mapping for 207's button-actions
 * (standard gamepad mapping indices).
 */
export const GAMEPAD_BUTTON_MAP: Readonly<Partial<Record<KeybindingAction, number>>> = {
  jump: 0, // A
  sneak: 1, // B
  swapOffhand: 3, // Y
  drop: 5, // RB
  attack: 6, // LT
  use: 7, // RT
  inventory: 8, // Back
  chat: 9, // Start
};

/**
 * Resolve the pressed buttons to actions, in `KEYBINDING_ACTIONS` order. Missing button indices
 * are treated as unpressed; a custom map overrides the default per action.
 */
export function pressedActions(
  buttons: readonly boolean[],
  actionMap: Readonly<Partial<Record<KeybindingAction, number>>> = GAMEPAD_BUTTON_MAP,
): KeybindingAction[] {
  const pressed: KeybindingAction[] = [];
  for (const action of KEYBINDING_ACTIONS) {
    const index = actionMap[action];
    if (index !== undefined && buttons[index] === true) {
      pressed.push(action);
    }
  }
  return pressed;
}

/** Raw UI-navigation states (the UI layer edge-triggers from these). */
export interface UiNavState {
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly confirm: boolean;
  readonly cancel: boolean;
}

/** The dpad (up=12, right=13, down=14, left=15) and face (confirm A=0, cancel B=1) states. */
export function uiNav(buttons: readonly boolean[]): UiNavState {
  return {
    up: buttons[12] === true,
    right: buttons[13] === true,
    down: buttons[14] === true,
    left: buttons[15] === true,
    confirm: buttons[0] === true,
    cancel: buttons[1] === true,
  };
}
