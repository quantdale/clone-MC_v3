import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from '../../src/player/Player';
import { PlayerController } from '../../src/player/PlayerController';
import type { InputState, MouseDelta } from '../../src/engine/InputTypes';
import { CONFIG } from '../../src/config';

/** Minimal InputState fake with controllable movement/sprint/sneak flags. */
function makeInput(overrides: Partial<InputState> = {}): InputState {
  return {
    moveForward: false,
    moveBack: false,
    moveLeft: false,
    moveRight: false,
    jump: false,
    sprint: false,
    isLocked: () => true,
    consumeMouseDelta(): MouseDelta {
      return { dyaw: 0, dpitch: 0 };
    },
    consumeBreak: () => false,
    isBreakHeld: () => false,
    consumePlace: () => false,
    consumeHotbarDelta: () => 0,
    consumeHotbarIndex: () => -1,
    consumeDebugToggle: () => false,
    consumeCraftingToggle: () => false,
    consumeEat: () => false,
    ...overrides,
  };
}

/** Runs the controller until horizontal speed settles on its target value. */
function settledSpeed(controller: PlayerController, player: Player): number {
  for (let i = 0; i < 240; i++) {
    controller.update(0.016);
  }
  return Math.hypot(player.velocity.x, player.velocity.z);
}

describe('player controller sneak', () => {
  it('reports the sneaking flag from the input state', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    const input = makeInput();
    const controller = new PlayerController(player, input);
    expect(controller.isSneaking()).toBe(false);
    input.sneaking = true;
    expect(controller.isSneaking()).toBe(true);
  });

  it('treats an absent sneaking field as not sneaking', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    const input = makeInput();
    delete (input as { sneaking?: boolean }).sneaking;
    expect(new PlayerController(player, input).isSneaking()).toBe(false);
  });

  it('slows forward movement to ~0.3x walk while sneaking', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    const input = makeInput({ moveForward: true });
    const controller = new PlayerController(player, input);
    const walkSpeed = settledSpeed(controller, player);
    expect(walkSpeed).toBeCloseTo(CONFIG.player.walkSpeed, 5);

    input.sneaking = true;
    const sneakSpeed = settledSpeed(controller, player);
    expect(sneakSpeed).toBeCloseTo(CONFIG.player.walkSpeed * 0.3, 5);
  });

  it('does not sprint while sneaking even when sprint is held', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    const input = makeInput({ moveForward: true, sprint: true });
    const controller = new PlayerController(player, input);

    // Sanity: sprint alone reaches sprint speed.
    const sprintSpeed = settledSpeed(controller, player);
    expect(sprintSpeed).toBeCloseTo(CONFIG.player.sprintSpeed, 5);

    // Holding Shift too caps the speed at the sneak walk, not sprint.
    input.sneaking = true;
    const bothSpeed = settledSpeed(controller, player);
    expect(bothSpeed).toBeCloseTo(CONFIG.player.walkSpeed * 0.3, 5);
    expect(bothSpeed).toBeLessThan(CONFIG.player.walkSpeed);
  });
});
