import { describe, it, expect } from 'vitest';
import {
  GAMEPAD_BUTTON_MAP,
  GAMEPAD_DEADZONE,
  applyDeadzone,
  lookVector,
  movementVector,
  pressedActions,
  uiNav,
} from '../../src/simulation/GamepadFramework';

describe('deadzone', () => {
  it('maps the inclusive boundary to 0 and passes everything else through', () => {
    expect(GAMEPAD_DEADZONE).toBe(0.15);
    expect(applyDeadzone(0)).toBe(0);
    expect(applyDeadzone(0.15)).toBe(0);
    expect(applyDeadzone(-0.15)).toBe(0);
    expect(applyDeadzone(0.16)).toBe(0.16);
    expect(applyDeadzone(-0.16)).toBe(-0.16);
    expect(applyDeadzone(0.5)).toBe(0.5);
  });

  it('honors a custom threshold', () => {
    expect(applyDeadzone(0.3, 0.3)).toBe(0);
    expect(applyDeadzone(0.31, 0.3)).toBe(0.31);
  });
});

describe('stick vectors', () => {
  it('deadzones each axis of the movement and look sticks', () => {
    expect(movementVector({ x: 0.5, y: -0.1 })).toEqual({ x: 0.5, y: 0 });
    expect(movementVector({ x: 0.1, y: 0.2 })).toEqual({ x: 0, y: 0.2 });
    expect(lookVector({ x: 1, y: -1 })).toEqual({ x: 1, y: -1 });
    expect(lookVector({ x: 0.14, y: 0.14 })).toEqual({ x: 0, y: 0 });
  });
});

describe('button map and action resolution', () => {
  it('pins the standard mapping', () => {
    expect(GAMEPAD_BUTTON_MAP).toEqual({
      jump: 0,
      sneak: 1,
      swapOffhand: 3,
      drop: 5,
      attack: 6,
      use: 7,
      inventory: 8,
      chat: 9,
    });
  });

  it('resolves pressed actions in action order', () => {
    const buttons = Array.from({ length: 10 }, (_, i) => i === 0 || i === 7);
    expect(pressedActions(buttons)).toEqual(['jump', 'use']);
  });

  it('treats short arrays as unpressed', () => {
    const short = [true, false, false];
    expect(pressedActions(short)).toEqual(['jump']);
  });

  it('honors a custom action map per action', () => {
    const custom = { jump: 1 };
    expect(pressedActions([false, true], custom)).toEqual(['jump']);
    expect(pressedActions([false, true])).toEqual(['sneak']); // default map: index 1 = sneak
    expect(pressedActions([false, false], custom)).toEqual([]);
  });

  it('yields an empty list when nothing is pressed', () => {
    expect(pressedActions([false, false, false, false, false, false, false, false, false, false])).toEqual([]);
  });
});

describe('UI navigation', () => {
  it('reports dpad directions and face buttons', () => {
    const buttons = Array.from({ length: 16 }, (_, i) => i === 12 || i === 0);
    expect(uiNav(buttons)).toEqual({
      up: true,
      down: false,
      left: false,
      right: false,
      confirm: true,
      cancel: false,
    });
  });

  it('is all-false for absent buttons', () => {
    expect(uiNav([])).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
      confirm: false,
      cancel: false,
    });
    const dpadDown = Array.from({ length: 16 }, (_, i) => i === 14 || i === 1);
    expect(uiNav(dpadDown)).toMatchObject({ down: true, cancel: true });
  });
});
