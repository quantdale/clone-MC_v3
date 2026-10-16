/**
 * Input wiring helpers (246): the headless-safe bridge between raw browser device
 * data and the pure coordinator/frameworks. No DOM, no Gamepad API access, no
 * mutation of inputs, no throws — the engine layer (InputManager/Game) owns the
 * event capture and per-frame assembly and calls into these helpers.
 *
 * Determinism rules:
 * - `keyboardActions` resolves held codes through `actionForKey` and emits the
 *   resulting actions deduped in `KEYBINDING_ACTIONS` order; unbound codes
 *   contribute nothing.
 * - `applyMouseLook` scales the raw mouse delta by the 206 `mouseSensitivity`
 *   setting (NOT the bare `CONFIG.mouseSensitivity`) and applies `invertY`.
 *   Scale contract: the multiplier is `(settings.mouseSensitivity / 0.5) *
 *   CONFIG.mouseSensitivity`, so the 206 default of 0.5 reproduces today's exact
 *   feel (`movementX * CONFIG.mouseSensitivity`, CONFIG = 0.0022 rad/px) and 1.0
 *   doubles it. The returned `y` keeps screen convention (positive = mouse moved
 *   down); consumers negate it when applying to pitch (positive pitch = up), so
 *   `invertY = false` reproduces today's `dpitch -= movementY * sens` exactly and
 *   `invertY = true` produces the opposite vertical direction.
 * - `gamepadFrame` picks the FIRST connected pad; absent/null/none-connected
 *   yields a disconnected zero frame, so a disconnect mid-hold leaves no stale
 *   held action in later frames.
 * - `loadWithFallback` catches a throwing deserializer and falls back to the
 *   framework default, reporting whether the payload was corrupt.
 */
import { CONFIG } from '../config';
import {
  KEYBINDING_ACTIONS,
  actionForKey,
  type KeybindingAction,
  type KeybindingState,
} from './KeybindingFramework';
import {
  lookVector,
  movementVector,
  pressedActions,
  uiNav,
  type GamepadAxisPair,
} from './GamepadFramework';
import type { SettingsStore } from './SettingsFramework';
import type { DeviceFrame } from './InputCoordinator';

/**
 * Resolve held keyboard codes to actions via the 207 bindings. Unbound codes
 * contribute nothing; duplicates collapse; output follows `KEYBINDING_ACTIONS`
 * order regardless of input order.
 */
export function keyboardActions(
  heldCodes: readonly string[],
  bindings: KeybindingState,
): KeybindingAction[] {
  const found = new Set<KeybindingAction>();
  for (const code of heldCodes) {
    const action = actionForKey(bindings, code);
    if (action !== null) found.add(action);
  }
  const actions: KeybindingAction[] = [];
  for (const action of KEYBINDING_ACTIONS) {
    if (found.has(action)) actions.push(action);
  }
  return actions;
}

/**
 * Run `deserialize(raw)`, falling back to `createDefault()` when it throws.
 * `corrupted` distinguishes a failed payload from a clean load.
 */
export function loadWithFallback<T>(
  deserialize: (input: unknown) => T,
  createDefault: () => T,
  raw: unknown,
): { value: T; corrupted: boolean } {
  try {
    return { value: deserialize(raw), corrupted: false };
  } catch {
    return { value: createDefault(), corrupted: true };
  }
}

/**
 * Scale a raw mouse-move delta by the 206 control settings (see the header
 * comment for the exact scale/invertY contract). Total over the delta: no
 * mutation, no throws.
 */
export function applyMouseLook(
  delta: { movementX: number; movementY: number },
  settings: SettingsStore,
): GamepadAxisPair {
  const sensitivity =
    typeof settings.mouseSensitivity === 'number' && Number.isFinite(settings.mouseSensitivity)
      ? settings.mouseSensitivity
      : 0.5;
  // Normalized 206 sensitivity (default 0.5) onto CONFIG's radians-per-pixel.
  const multiplier = (sensitivity / 0.5) * CONFIG.mouseSensitivity;
  const x = delta.movementX * multiplier;
  const y = delta.movementY * multiplier * (settings.invertY === true ? -1 : 1);
  return { x, y };
}

/** The minimal gamepad snapshot the wiring feeds into {@link gamepadFrame}. */
export interface RawGamepadSnapshot {
  readonly connected: boolean;
  readonly buttons: readonly { readonly pressed: boolean }[];
  readonly axes: readonly number[];
}

function disconnectedGamepadFrame(): DeviceFrame['gamepad'] {
  return {
    connected: false,
    actions: [],
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    uiNav: { up: false, down: false, left: false, right: false, confirm: false, cancel: false },
  };
}

/**
 * Resolve the polled gamepads into the coordinator's gamepad device field using
 * 209's functions (movement = left stick, look = right stick, actions/uiNav =
 * buttons). The FIRST connected pad wins; null/absent/none-connected yields the
 * disconnected zero frame.
 */
export function gamepadFrame(
  pads: readonly RawGamepadSnapshot[] | null,
): DeviceFrame['gamepad'] {
  const pad = pads?.find((candidate) => candidate?.connected === true);
  if (!pad) {
    return disconnectedGamepadFrame();
  }
  const buttons = pad.buttons.map((button) => button?.pressed === true);
  const axis = (index: number): number => {
    const value = pad.axes[index];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return {
    connected: true,
    actions: pressedActions(buttons),
    move: movementVector({ x: axis(0), y: axis(1) }),
    look: lookVector({ x: axis(2), y: axis(3) }),
    uiNav: uiNav(buttons),
  };
}
