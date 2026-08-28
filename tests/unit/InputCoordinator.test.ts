import { describe, it, expect } from 'vitest';
import {
  clearAll,
  clearDevice,
  resolveFrame,
  type DeviceFrame,
  type ResolvedInputFrame,
} from '../../src/simulation/InputCoordinator';
import type { KeybindingAction } from '../../src/simulation/KeybindingFramework';

const ALL_UI_NAV_FALSE = {
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  cancel: false,
};

/** An all-idle DeviceFrame (empty action lists, false flags, zero vectors, no hotbar). */
function baseFrame(): DeviceFrame {
  return {
    keyboard: { heldActions: [], hotbarIndex: -1, hotbarDelta: 0 },
    mouse: { look: { x: 0, y: 0 }, breakHeld: false, useHeld: false, pickHeld: false },
    gamepad: {
      connected: false,
      actions: [],
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      uiNav: { ...ALL_UI_NAV_FALSE },
    },
    touch: { actions: [], move: { x: 0, y: 0 }, look: { x: 0, y: 0 } },
  };
}

/** A fully-loaded frame exercising every device at once. */
function loadedFrame(): DeviceFrame {
  return {
    active: true,
    keyboard: { heldActions: ['forward', 'sprint'], hotbarIndex: 2, hotbarDelta: 1 },
    mouse: { look: { x: 0.02, y: -0.01 }, breakHeld: true, useHeld: true, pickHeld: true },
    gamepad: {
      connected: true,
      actions: ['jump', 'attack'],
      move: { x: 0.5, y: -0.5 },
      look: { x: 0.4, y: 0.1 },
      uiNav: { up: true, down: false, left: true, right: false, confirm: true, cancel: false },
    },
    touch: { actions: ['use'], move: { x: 0.3, y: 0 }, look: { x: 0.3, y: 0 } },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as unknown as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function snapshot<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('resolveFrame', () => {
  it('unions, dedupes, and orders actions across devices (dispatch REQ-1)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      keyboard: { ...frame.keyboard, heldActions: ['sprint', 'forward'] },
      mouse: { ...frame.mouse, breakHeld: true },
      gamepad: { ...frame.gamepad, connected: true, actions: ['forward', 'attack'] },
      touch: { ...frame.touch, actions: ['forward'] },
    };
    const resolved = resolveFrame(populated);
    expect(resolved.actions).toEqual(['forward', 'sprint', 'attack']);
  });

  it('contributes attack/use/pickBlock to the union from the mouse held flags (dispatch REQ-1)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      mouse: { ...frame.mouse, breakHeld: true, useHeld: true, pickHeld: true },
    };
    expect(resolveFrame(populated).actions).toEqual(['attack', 'use', 'pickBlock']);
  });

  it('ignores unknown action strings instead of throwing', () => {
    const frame = baseFrame();
    const hostile: DeviceFrame = {
      ...frame,
      gamepad: {
        ...frame.gamepad,
        actions: ['notAnAction', 'jump'] as unknown as KeybindingAction[],
      },
      touch: {
        ...frame.touch,
        actions: ['alsoBogus', 'sneak'] as unknown as KeybindingAction[],
      },
    };
    expect(resolveFrame(hostile).actions).toEqual(['jump', 'sneak']);
  });

  it('prefers the gamepad move over touch and keyboard (dispatch REQ-2)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      keyboard: { ...frame.keyboard, heldActions: ['right'] },
      gamepad: { ...frame.gamepad, connected: true, move: { x: 1, y: 0 } },
      touch: { ...frame.touch, move: { x: 0.5, y: 0 } },
    };
    expect(resolveFrame(populated).move).toEqual({ x: 1, y: 0 });
  });

  it('defers a zero gamepad move to touch, and both to the keyboard cardinal (dispatch REQ-2)', () => {
    const frame = baseFrame();
    const touchOnly: DeviceFrame = {
      ...frame,
      touch: { ...frame.touch, move: { x: 0, y: 0.7 } },
    };
    expect(resolveFrame(touchOnly).move).toEqual({ x: 0, y: 0.7 });
    const keyboardOnly: DeviceFrame = {
      ...frame,
      keyboard: { ...frame.keyboard, heldActions: ['right'] },
    };
    expect(resolveFrame(keyboardOnly).move).toEqual({ x: 1, y: 0 });
  });

  it('derives the keyboard cardinal move per the PlayerController convention', () => {
    const frame = baseFrame();
    const withKeys = (heldActions: KeybindingAction[]): ResolvedInputFrame =>
      resolveFrame({ ...frame, keyboard: { ...frame.keyboard, heldActions } });
    // forward = world -Z => y -1; strafe = right - left => x +1 for 'right'.
    expect(withKeys(['forward']).move).toEqual({ x: 0, y: -1 });
    expect(withKeys(['back']).move).toEqual({ x: 0, y: 1 });
    expect(withKeys(['left']).move).toEqual({ x: -1, y: 0 });
    expect(withKeys(['right']).move).toEqual({ x: 1, y: 0 });
    // Diagonal.
    expect(withKeys(['forward', 'left']).move).toEqual({ x: -1, y: -1 });
    // Opposite keys cancel, matching fwd = forward - back.
    expect(withKeys(['forward', 'back']).move).toEqual({ x: 0, y: 0 });
    expect(withKeys(['left', 'right']).move).toEqual({ x: 0, y: 0 });
  });

  it('returns a zero move when no device contributes movement (dispatch REQ-2)', () => {
    expect(resolveFrame(baseFrame()).move).toEqual({ x: 0, y: 0 });
  });

  it('prefers the mouse look over gamepad and touch (dispatch REQ-3)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      mouse: { ...frame.mouse, look: { x: 0.02, y: 0 } },
      gamepad: { ...frame.gamepad, look: { x: 0.4, y: 0.1 } },
      touch: { ...frame.touch, look: { x: 0.3, y: 0 } },
    };
    expect(resolveFrame(populated).look).toEqual({ x: 0.02, y: 0 });
  });

  it('defers an idle mouse look to the gamepad before touch (dispatch REQ-3)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      gamepad: { ...frame.gamepad, look: { x: 0.4, y: 0.1 } },
      touch: { ...frame.touch, look: { x: 0.3, y: 0 } },
    };
    expect(resolveFrame(populated).look).toEqual({ x: 0.4, y: 0.1 });
  });

  it('returns a zero look when every source is zero (dispatch REQ-3)', () => {
    expect(resolveFrame(baseFrame()).look).toEqual({ x: 0, y: 0 });
  });

  it('merges break/use/pick held flags from any device (dispatch REQ-4)', () => {
    const frame = baseFrame();
    // Spec scenario: the gamepad holds break although the mouse does not.
    const gamepadBreak: DeviceFrame = {
      ...frame,
      gamepad: { ...frame.gamepad, actions: ['attack'] },
    };
    const fromGamepad = resolveFrame(gamepadBreak);
    expect(fromGamepad.breakHeld).toBe(true);
    expect(fromGamepad.actions).toContain('attack');
    // Touch holds use; the gamepad holds pick; nothing holds break.
    const touchUseGamepadPick: DeviceFrame = {
      ...frame,
      gamepad: { ...frame.gamepad, actions: ['pickBlock'] },
      touch: { ...frame.touch, actions: ['use'] },
    };
    const merged = resolveFrame(touchUseGamepadPick);
    expect(merged.useHeld).toBe(true);
    expect(merged.pickHeld).toBe(true);
    expect(merged.breakHeld).toBe(false);
    expect(merged.actions).toEqual(['use', 'pickBlock']);
  });

  it("keeps another device's hold when one device releases (dispatch REQ-4)", () => {
    const frame = baseFrame();
    const bothHold: DeviceFrame = {
      ...frame,
      mouse: { ...frame.mouse, breakHeld: true },
      gamepad: { ...frame.gamepad, connected: true, actions: ['attack'] },
    };
    expect(resolveFrame(bothHold).breakHeld).toBe(true);
    const mouseReleased: DeviceFrame = {
      ...bothHold,
      mouse: { ...bothHold.mouse, breakHeld: false },
    };
    expect(resolveFrame(mouseReleased).breakHeld).toBe(true);
  });

  it('aggregates the keyboard hotbar index and wheel delta (dispatch REQ-5)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      keyboard: { ...frame.keyboard, hotbarIndex: 2, hotbarDelta: 1 },
    };
    const resolved = resolveFrame(populated);
    expect(resolved.hotbarIndex).toBe(2);
    expect(resolved.hotbarDelta).toBe(1);
  });

  it('keeps -1 when nothing is selected and normalizes out-of-range indices to -1 (dispatch REQ-5)', () => {
    const frame = baseFrame();
    expect(resolveFrame(frame).hotbarIndex).toBe(-1);
    const withIndex = (hotbarIndex: number): number =>
      resolveFrame({ ...frame, keyboard: { ...frame.keyboard, hotbarIndex } }).hotbarIndex;
    expect(withIndex(9)).toBe(-1);
    expect(withIndex(-3)).toBe(-1);
    expect(withIndex(2.5)).toBe(-1);
    expect(withIndex(0)).toBe(0);
    expect(withIndex(8)).toBe(8);
  });

  it('keeps a gamepad hold when the touch device releases (dispatch REQ-6 sticky)', () => {
    const frame = baseFrame();
    const bothHold: DeviceFrame = {
      ...frame,
      gamepad: { ...frame.gamepad, connected: true, actions: ['jump'] },
      touch: { ...frame.touch, actions: ['jump'] },
    };
    expect(resolveFrame(bothHold).actions).toEqual(['jump']);
    const touchReleased: DeviceFrame = {
      ...bothHold,
      touch: { ...bothHold.touch, actions: [] },
    };
    expect(resolveFrame(touchReleased).actions).toEqual(['jump']);
  });

  it('passes the gamepad uiNav through verbatim', () => {
    const frame = baseFrame();
    const uiNav = { up: true, down: false, left: true, right: false, confirm: true, cancel: false };
    const populated: DeviceFrame = { ...frame, gamepad: { ...frame.gamepad, uiNav } };
    expect(resolveFrame(populated).uiNav).toEqual(uiNav);
  });

  it('defaults active to true and passes an explicit false through', () => {
    expect(resolveFrame(baseFrame()).active).toBe(true);
    const paused: DeviceFrame = { ...baseFrame(), active: false };
    expect(resolveFrame(paused).active).toBe(false);
  });
});

describe('clearAll', () => {
  it('zeroes every device field without mutating the input', () => {
    const frame = loadedFrame();
    const before = snapshot(frame);
    const cleared = clearAll(frame);
    expect(cleared.keyboard).toEqual({ heldActions: [], hotbarIndex: -1, hotbarDelta: 0 });
    expect(cleared.mouse).toEqual({
      look: { x: 0, y: 0 },
      breakHeld: false,
      useHeld: false,
      pickHeld: false,
    });
    expect(cleared.gamepad).toEqual({
      connected: false,
      actions: [],
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      uiNav: ALL_UI_NAV_FALSE,
    });
    expect(cleared.touch).toEqual({ actions: [], move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
    expect(frame).toEqual(before);
  });

  it('resolves to a fully idle frame', () => {
    const resolved = resolveFrame(clearAll(loadedFrame()));
    expect(resolved.actions).toEqual([]);
    expect(resolved.move).toEqual({ x: 0, y: 0 });
    expect(resolved.look).toEqual({ x: 0, y: 0 });
    expect(resolved.breakHeld).toBe(false);
    expect(resolved.useHeld).toBe(false);
    expect(resolved.pickHeld).toBe(false);
    expect(resolved.hotbarIndex).toBe(-1);
    expect(resolved.hotbarDelta).toBe(0);
    expect(resolved.uiNav).toEqual(ALL_UI_NAV_FALSE);
  });
});

describe('clearDevice', () => {
  it('clears only the gamepad and preserves keyboard input (focus-loss REQ-4)', () => {
    const frame = baseFrame();
    const populated: DeviceFrame = {
      ...frame,
      keyboard: { ...frame.keyboard, heldActions: ['forward'] },
      gamepad: { ...frame.gamepad, connected: true, actions: ['jump'] },
    };
    const cleared = clearDevice(populated, 'gamepad');
    expect(cleared.gamepad.actions).toEqual([]);
    expect(cleared.gamepad.connected).toBe(false);
    expect(cleared.gamepad.move).toEqual({ x: 0, y: 0 });
    expect(cleared.gamepad.look).toEqual({ x: 0, y: 0 });
    expect(cleared.gamepad.uiNav).toEqual(ALL_UI_NAV_FALSE);
    expect(cleared.keyboard.heldActions).toEqual(['forward']);
  });

  it('clears only the keyboard', () => {
    const frame = loadedFrame();
    const cleared = clearDevice(frame, 'keyboard');
    expect(cleared.keyboard).toEqual({ heldActions: [], hotbarIndex: -1, hotbarDelta: 0 });
    expect(cleared.mouse).toEqual(frame.mouse);
    expect(cleared.gamepad).toEqual(frame.gamepad);
    expect(cleared.touch).toEqual(frame.touch);
  });

  it('clears only the mouse', () => {
    const frame = loadedFrame();
    const cleared = clearDevice(frame, 'mouse');
    expect(cleared.mouse).toEqual({
      look: { x: 0, y: 0 },
      breakHeld: false,
      useHeld: false,
      pickHeld: false,
    });
    expect(cleared.keyboard).toEqual(frame.keyboard);
    expect(cleared.gamepad).toEqual(frame.gamepad);
    expect(cleared.touch).toEqual(frame.touch);
  });

  it('clears only the touch', () => {
    const frame = loadedFrame();
    const cleared = clearDevice(frame, 'touch');
    expect(cleared.touch).toEqual({ actions: [], move: { x: 0, y: 0 }, look: { x: 0, y: 0 } });
    expect(cleared.keyboard).toEqual(frame.keyboard);
    expect(cleared.mouse).toEqual(frame.mouse);
    expect(cleared.gamepad).toEqual(frame.gamepad);
  });

  it('does not mutate the input frame', () => {
    const frame = loadedFrame();
    const before = snapshot(frame);
    clearDevice(frame, 'gamepad');
    clearDevice(frame, 'touch');
    clearDevice(frame, 'keyboard');
    clearDevice(frame, 'mouse');
    expect(frame).toEqual(before);
  });
});

describe('totality', () => {
  it('resolves an all-idle frame to a neutral active frame', () => {
    expect(resolveFrame(baseFrame())).toEqual({
      actions: [],
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      breakHeld: false,
      useHeld: false,
      pickHeld: false,
      hotbarIndex: -1,
      hotbarDelta: 0,
      uiNav: ALL_UI_NAV_FALSE,
      active: true,
    });
  });

  it('resolves a frame where only one device is populated', () => {
    const frame = baseFrame();
    const mouseOnly: DeviceFrame = {
      ...frame,
      mouse: { ...frame.mouse, look: { x: 0.02, y: 0 }, breakHeld: true },
    };
    const resolved = resolveFrame(mouseOnly);
    expect(resolved.actions).toEqual(['attack']);
    expect(resolved.look).toEqual({ x: 0.02, y: 0 });
    expect(resolved.move).toEqual({ x: 0, y: 0 });
  });

  it('never throws for a disconnected gamepad carrying stale input', () => {
    const frame = baseFrame();
    const stale: DeviceFrame = {
      ...frame,
      gamepad: {
        ...frame.gamepad,
        connected: false,
        actions: ['jump'],
        move: { x: 1, y: 0 },
        look: { x: 0.4, y: 0 },
      },
    };
    expect(() => resolveFrame(stale)).not.toThrow();
    // Disconnect zeroing is the wiring's job (focus-loss REQ-6); the coordinator stays
    // mechanical and total over whatever fields it is handed.
    expect(resolveFrame(stale).actions).toContain('jump');
    expect(resolveFrame(stale).move).toEqual({ x: 1, y: 0 });
  });

  it('does not mutate or alias a deep-frozen input frame', () => {
    const frozen = deepFreeze(loadedFrame());
    let resolved: ResolvedInputFrame | undefined;
    expect(() => {
      resolved = resolveFrame(frozen);
    }).not.toThrow();
    expect(resolved).toBeDefined();
    expect(resolved).toEqual(resolveFrame(loadedFrame()));
  });
});
