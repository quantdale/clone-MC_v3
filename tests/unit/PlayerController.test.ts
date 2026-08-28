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

describe('player controller support-friction provider', () => {
  /** Grounded, stationary player with a residual X velocity. */
  function groundedPlayer(vx = 1): Player {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    player.onGround = true;
    player.velocity.x = vx;
    return player;
  }

  it('absent provider keeps neutral friction (damping step of exactly damping * dt)', () => {
    const player = groundedPlayer();
    const controller = new PlayerController(player, makeInput());
    controller.update(1 / 60);
    const expectedStep = CONFIG.player.damping / 60;
    expect(player.velocity.x).toBeCloseTo(1 - expectedStep, 6);
  });

  it('provider scales grounded damping (slippery ice slows decay proportionally)', () => {
    for (const friction of [0.5, 0.98]) {
      const neutral = groundedPlayer();
      new PlayerController(neutral, makeInput()).update(1 / 60);

      const icy = groundedPlayer();
      let calls = 0;
      new PlayerController(icy, makeInput(), { frictionProvider: () => (calls++, friction) }).update(1 / 60);

      expect(icy.velocity.x).toBeCloseTo(
        1 - ((CONFIG.player.damping / 60) * friction),
        6,
      );
      expect(calls).toBeGreaterThan(0); // provider actually consulted while grounded
    }
  });

  it('provider scales grounded acceleration toward the target speed', () => {
    const accelPerTick = CONFIG.player.acceleration / 60;
    const neutral = new Player({ position: new THREE.Vector3(0, 0, 0) });
    neutral.onGround = true;
    new PlayerController(neutral, makeInput({ moveForward: true })).update(1 / 60);
    expect(Math.abs(neutral.velocity.z)).toBeCloseTo(accelPerTick, 6);

    const halfFriction = new Player({ position: new THREE.Vector3(0, 0, 0) });
    halfFriction.onGround = true;
    new PlayerController(halfFriction, makeInput({ moveForward: true }), {
      frictionProvider: () => 0.5,
    }).update(1 / 60);
    expect(Math.abs(halfFriction.velocity.z)).toBeCloseTo(accelPerTick * 0.5, 6);
  });

  it('provider is ignored while airborne or in fluid', () => {
    const airborne = new Player({ position: new THREE.Vector3(0, 0, 0) });
    airborne.onGround = false;
    let calls = 0;
    new PlayerController(airborne, makeInput({ moveForward: true }), {
      frictionProvider: () => (calls++, 0.1),
    }).update(1 / 60);
    expect(calls).toBe(0);
    expect(Math.abs(airborne.velocity.z)).toBeCloseTo(CONFIG.player.acceleration / 60, 6);

    const swimming = groundedPlayer();
    swimming.inWater = true;
    let waterCalls = 0;
    new PlayerController(swimming, makeInput(), { frictionProvider: () => (waterCalls++, 0.1) }).update(1 / 60);
    expect(waterCalls).toBe(0);
  });

  it('a provider returning 0 freezes grounded movement entirely', () => {
    const player = new Player({ position: new THREE.Vector3(0, 0, 0) });
    player.onGround = true;
    const controller = new PlayerController(player, makeInput({ moveForward: true }), {
      frictionProvider: () => 0,
    });
    for (let i = 0; i < 10; i++) controller.update(1 / 60);
    expect(player.velocity.x).toBe(0);
    expect(player.velocity.z).toBe(0);
  });
});
