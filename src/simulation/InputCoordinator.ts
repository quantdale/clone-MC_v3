/**
 * Input coordinator (246): the pure per-frame merge of the four devices' raw resolutions
 * (keyboard, mouse, gamepad, touch) into a single ResolvedInputFrame — action union,
 * movement/look arbitration, held-button merge, hotbar aggregation — plus the focus-loss
 * clearing primitives (`clearDevice`/`clearAll`). Headless-safe: no DOM, no Gamepad API,
 * no mutation of inputs, no throws.
 *
 * Determinism rules:
 * - Actions are the union of keyboard/gamepad/touch action lists plus the mouse held-button
 *   contributions (break -> attack, use -> use, pick -> pickBlock), deduped and emitted in
 *   `KEYBINDING_ACTIONS` order; unknown action strings are ignored.
 * - Move priority is gamepad > touch > keyboard-cardinal; look priority is mouse > gamepad >
 *   touch. A zero vector never blocks a lower-priority non-zero candidate; all-zero yields
 *   the zero vector.
 * - The keyboard cardinal move follows the PlayerController convention (fwd = forward - back,
 *   strafe = right - left, forward = world -Z at yaw 0), expressed as an analog pair:
 *   x = strafe (right positive), y = -forward (world -Z forward; also the standard gamepad
 *   stick convention where stick-up is -1). So forward -> { x: 0, y: -1 }, back ->
 *   { x: 0, y: 1 }, right -> { x: 1, y: 0 }, left -> { x: -1, y: 0 }; opposite keys cancel.
 * - breakHeld/useHeld/pickHeld are true when ANY device holds the corresponding input;
 *   releasing one device never clears another device's still-held input.
 * - hotbarIndex passes through when an integer in [0, 8], else -1; hotbarDelta passes through.
 * - `active` (device present AND not paused/lost-focus) is composed by the wiring from
 *   focus/play state and taken as given here; clearDevice/clearAll zero device state only.
 */
import { KEYBINDING_ACTIONS, type KeybindingAction } from './KeybindingFramework';
import type { GamepadAxisPair, UiNavState } from './GamepadFramework';

/** A raw two-axis input pair (movement or look); reuses the `GamepadAxisPair` shape. */
export type AxisPair = GamepadAxisPair;

/** Per-device raw resolutions fed to the coordinator each frame. */
export interface DeviceFrame {
  readonly keyboard: {
    /** Held actions derived via `actionForKey` in the wiring. */
    readonly heldActions: readonly KeybindingAction[];
    /** Selected hotbar slot; -1 = none. */
    readonly hotbarIndex: number;
    /** Wheel step for this frame. */
    readonly hotbarDelta: number;
  };
  readonly mouse: {
    /** dyaw/dpitch after sensitivity + invertY. */
    readonly look: AxisPair;
    readonly breakHeld: boolean;
    readonly useHeld: boolean;
    readonly pickHeld: boolean;
  };
  readonly gamepad: {
    readonly connected: boolean;
    /** Pressed actions from `pressedActions`. */
    readonly actions: readonly KeybindingAction[];
    readonly move: AxisPair;
    readonly look: AxisPair;
    readonly uiNav: UiNavState;
  };
  readonly touch: {
    readonly actions: readonly KeybindingAction[];
    readonly move: AxisPair;
    readonly look: AxisPair;
  };
  /**
   * Playability/focus composition owned by the wiring; the coordinator takes it as given.
   * Defaults to true when omitted.
   */
  readonly active?: boolean;
}

/** The merged per-frame input the simulation consumes. */
export interface ResolvedInputFrame {
  /** Union of all devices' actions, deduped, in `KEYBINDING_ACTIONS` order. */
  readonly actions: readonly KeybindingAction[];
  /** Arbitrated movement vector. */
  readonly move: AxisPair;
  /** Arbitrated look delta. */
  readonly look: AxisPair;
  readonly breakHeld: boolean;
  readonly useHeld: boolean;
  readonly pickHeld: boolean;
  /** -1 when no slot is selected. */
  readonly hotbarIndex: number;
  readonly hotbarDelta: number;
  readonly uiNav: UiNavState;
  readonly active: boolean;
}

const KNOWN_ACTIONS: ReadonlySet<string> = new Set<string>(KEYBINDING_ACTIONS);

function collectActions(into: Set<string>, actions: readonly KeybindingAction[] | undefined): void {
  if (!Array.isArray(actions)) return;
  for (const action of actions) {
    if (typeof action === 'string' && KNOWN_ACTIONS.has(action)) into.add(action);
  }
}

function holdsAction(
  actions: readonly KeybindingAction[] | undefined,
  action: KeybindingAction,
): boolean {
  return Array.isArray(actions) && actions.includes(action);
}

function isNonZeroVector(pair: GamepadAxisPair | undefined | null): pair is GamepadAxisPair {
  return pair !== undefined && pair !== null && (pair.x !== 0 || pair.y !== 0);
}

/** The first non-zero candidate, or the zero vector; a zero candidate never blocks. */
function firstNonZero(candidates: readonly (GamepadAxisPair | undefined | null)[]): AxisPair {
  for (const candidate of candidates) {
    if (isNonZeroVector(candidate)) return { x: candidate.x, y: candidate.y };
  }
  return { x: 0, y: 0 };
}

/**
 * The cardinal move vector for the held actions, per the PlayerController convention
 * (see the header comment for the axis mapping); opposite held keys cancel.
 */
function keyboardCardinalMove(heldActions: readonly KeybindingAction[] | undefined): AxisPair {
  let x = 0;
  let y = 0;
  if (!Array.isArray(heldActions)) return { x, y };
  for (const action of heldActions) {
    switch (action) {
      case 'forward':
        y -= 1;
        break;
      case 'back':
        y += 1;
        break;
      case 'left':
        x -= 1;
        break;
      case 'right':
        x += 1;
        break;
      default:
        break;
    }
  }
  return { x, y };
}

/** A verbatim copy of the UI-navigation state, tolerant of absent data. */
function verbatimUiNav(uiNav: UiNavState | undefined | null): UiNavState {
  return {
    up: uiNav?.up === true,
    down: uiNav?.down === true,
    left: uiNav?.left === true,
    right: uiNav?.right === true,
    confirm: uiNav?.confirm === true,
    cancel: uiNav?.cancel === true,
  };
}

function normalizedHotbarIndex(index: number | undefined | null): number {
  return typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= 8
    ? index
    : -1;
}

/**
 * Merge the per-device raw resolutions into one resolved frame. Total over DeviceFrame:
 * unknown actions are filtered, out-of-range hotbar indices normalize to -1, and no input
 * is ever mutated.
 */
export function resolveFrame(frame: DeviceFrame): ResolvedInputFrame {
  const held = new Set<string>();
  collectActions(held, frame.keyboard.heldActions);
  if (frame.mouse.breakHeld === true) held.add('attack');
  if (frame.mouse.useHeld === true) held.add('use');
  if (frame.mouse.pickHeld === true) held.add('pickBlock');
  collectActions(held, frame.gamepad.actions);
  collectActions(held, frame.touch.actions);
  const actions: KeybindingAction[] = [];
  for (const action of KEYBINDING_ACTIONS) {
    if (held.has(action)) actions.push(action);
  }
  return {
    actions,
    move: firstNonZero([
      frame.gamepad.move,
      frame.touch.move,
      keyboardCardinalMove(frame.keyboard.heldActions),
    ]),
    look: firstNonZero([frame.mouse.look, frame.gamepad.look, frame.touch.look]),
    breakHeld:
      frame.mouse.breakHeld === true ||
      holdsAction(frame.gamepad.actions, 'attack') ||
      holdsAction(frame.touch.actions, 'attack'),
    useHeld:
      frame.mouse.useHeld === true ||
      holdsAction(frame.gamepad.actions, 'use') ||
      holdsAction(frame.touch.actions, 'use'),
    pickHeld:
      frame.mouse.pickHeld === true ||
      holdsAction(frame.gamepad.actions, 'pickBlock') ||
      holdsAction(frame.touch.actions, 'pickBlock'),
    hotbarIndex: normalizedHotbarIndex(frame.keyboard.hotbarIndex),
    hotbarDelta: typeof frame.keyboard.hotbarDelta === 'number' ? frame.keyboard.hotbarDelta : 0,
    uiNav: verbatimUiNav(frame.gamepad.uiNav),
    active: frame.active ?? true,
  };
}

function emptyKeyboard(): DeviceFrame['keyboard'] {
  return { heldActions: [], hotbarIndex: -1, hotbarDelta: 0 };
}

function emptyMouse(): DeviceFrame['mouse'] {
  return { look: { x: 0, y: 0 }, breakHeld: false, useHeld: false, pickHeld: false };
}

function emptyGamepad(): DeviceFrame['gamepad'] {
  return {
    connected: false,
    actions: [],
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    uiNav: { up: false, down: false, left: false, right: false, confirm: false, cancel: false },
  };
}

function emptyTouch(): DeviceFrame['touch'] {
  return { actions: [], move: { x: 0, y: 0 }, look: { x: 0, y: 0 } };
}

/**
 * Zero every device's fields (no actions, zero vectors, no held buttons, no hotbar signal,
 * all-false uiNav, disconnected gamepad). Builds a new frame; never mutates the input.
 * `active` is wiring-owned frame state, not device state, and is preserved.
 */
export function clearAll(frame: DeviceFrame): DeviceFrame {
  return {
    keyboard: emptyKeyboard(),
    mouse: emptyMouse(),
    gamepad: emptyGamepad(),
    touch: emptyTouch(),
    active: frame.active,
  };
}

/**
 * Zero ONLY the named device's fields and preserve the other three devices' current values.
 * Builds a new frame; never mutates the input. `active` is preserved (see clearAll).
 */
export function clearDevice(
  frame: DeviceFrame,
  device: 'keyboard' | 'mouse' | 'gamepad' | 'touch',
): DeviceFrame {
  return {
    keyboard: device === 'keyboard' ? emptyKeyboard() : frame.keyboard,
    mouse: device === 'mouse' ? emptyMouse() : frame.mouse,
    gamepad: device === 'gamepad' ? emptyGamepad() : frame.gamepad,
    touch: device === 'touch' ? emptyTouch() : frame.touch,
    active: frame.active,
  };
}
