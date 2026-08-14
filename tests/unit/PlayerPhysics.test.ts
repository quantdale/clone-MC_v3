import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Player } from '../../src/player/Player';
import { PlayerPhysics } from '../../src/player/PlayerPhysics';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { CONFIG } from '../../src/config';

/**
 * A world stub that places a solid floor at y=0 and a solid wall along x>=5.
 */
function makeFloorWorld(): import('../../src/world/WorldAccess').WorldAccess {
  return {
    getBlock(): number {
      return 0;
    },
    setBlock(): void {
      /* no-op */
    },
    isSolid(x: number, y: number): boolean {
      if (y < 0) return true; // solid floor below y=0
      if (x >= 5 && y >= 0 && y <= 3) return true; // wall
      return false;
    },
  };
}

function makeStepWorld(): import('../../src/world/WorldAccess').WorldAccess {
  return {
    getBlock(): number {
      return 0;
    },
    setBlock(): void {
      /* no-op */
    },
    isSolid(x: number, y: number): boolean {
      if (y < 0) return true;
      return x >= 3 && x < 4 && y === 0;
    },
  };
}

describe('player physics', () => {
  const registry = createDefaultBlockRegistry();

  it('applies gravity to an airborne player', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, 10, 2) });
    const before = player.position.y;
    physics.update(player, 0.016);
    expect(player.position.y).toBeLessThan(before); // fell
    expect(player.velocity.y).toBeLessThan(0); // downward velocity
  });

  it('player lands on the floor and stops falling', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, 3, 2) });
    player.velocity.y = -10;
    // Run many steps so the player reaches the floor.
    for (let i = 0; i < 60; i++) {
      physics.update(player, 0.016);
    }
    expect(player.onGround).toBe(true);
    expect(player.position.y).toBeCloseTo(0, 1); // standing on top of the floor block (at y=-1)
    expect(player.velocity.y).toBe(0);
  });

  it('wall stops horizontal movement on the x axis', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, CONFIG.player.height, 2) });
    player.velocity.x = 5;
    player.onGround = true;
    for (let i = 0; i < 60; i++) {
      physics.update(player, 0.016);
    }
    // The wall is at x>=5; the player radius=0.3, so the player can approach
    // x = 5 - 0.3 = 4.7 but not pass through.
    expect(player.position.x).toBeLessThan(5);
    expect(player.velocity.x).toBe(0);
  });

  it('prevents falling through the floor', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, 2, 2) });
    player.velocity.y = -50;
    for (let i = 0; i < 60; i++) {
      physics.update(player, 0.016);
    }
    expect(player.position.y).toBeGreaterThanOrEqual(0);
  });

  it('caps falling velocity at the terminal limit', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, 60, 2) });
    player.velocity.y = -1000;
    physics.update(player, 0.016);
    // The documented terminal velocity (54 blocks/s downward) bounds the fall.
    expect(player.velocity.y).toBeCloseTo(-54, 5);
  });

  it('a ground-level jump lifts the player and gravity returns them to the floor', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, 0, 2) });
    player.onGround = true;
    player.velocity.y = CONFIG.player.jumpVelocity;
    const startY = player.position.y;

    // While rising, the player leaves the ground.
    let maxY = startY;
    for (let i = 0; i < 20; i++) {
      physics.update(player, 0.016);
      maxY = Math.max(maxY, player.position.y);
    }
    expect(maxY).toBeGreaterThan(startY + 0.5);

    // After the arc completes, the player is back on the floor, stationary.
    for (let i = 0; i < 90; i++) {
      physics.update(player, 0.016);
    }
    expect(player.onGround).toBe(true);
    expect(player.position.y).toBeCloseTo(0, 1);
    expect(player.velocity.y).toBe(0);
  });

  it('walks across open floor without losing ground contact', () => {
    const world = makeFloorWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2, 0, 2) });
    player.onGround = true;
    player.velocity.x = CONFIG.player.walkSpeed;
    for (let i = 0; i < 60; i++) {
      physics.update(player, 0.016);
    }
    // The walk makes clear progress before the wall at x>=5 stops the player.
    expect(player.position.x).toBeGreaterThan(2.5);
    expect(player.position.x).toBeLessThan(5);
    expect(player.position.y).toBeCloseTo(0, 1); // never fell or floated
    expect(player.velocity.y).toBe(0);
  });

  it('steps over a one-block ledge while grounded', () => {
    const world = makeStepWorld();
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(1, 0, 0.5) });
    player.onGround = true;
    player.velocity.x = CONFIG.player.walkSpeed;

    let maxY = player.position.y;
    for (let i = 0; i < 80; i++) {
      physics.update(player, 0.016);
      maxY = Math.max(maxY, player.position.y);
    }

    expect(player.position.x).toBeGreaterThan(4);
    expect(maxY).toBeGreaterThanOrEqual(CONFIG.player.stepHeight);
    expect(player.onGround).toBe(true);
  });

  it('does not step through a two-block wall', () => {
    const world = {
      ...makeStepWorld(),
      isSolid(x: number, y: number): boolean {
        if (y < 0) return true;
        return x >= 3 && x < 4 && y >= 0 && y <= 1;
      },
    };
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(1, 0, 0.5) });
    player.onGround = true;
    player.velocity.x = CONFIG.player.walkSpeed;

    for (let i = 0; i < 80; i++) {
      physics.update(player, 0.016);
    }

    expect(player.position.x).toBeLessThan(3);
    expect(player.velocity.x).toBe(0);
  });

  it('detects water and applies buoyant gravity', () => {
    const world = {
      getBlock(_x: number, y: number): number {
        return y === 1 ? BlockId.Water : BlockId.Air;
      },
      setBlock(): void {
        /* no-op */
      },
      isSolid(_x: number, y: number): boolean {
        return y < 0;
      },
    };
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2.5, 1.2, 2.5) });

    physics.update(player, 0.016);

    expect(player.inWater).toBe(true);
    expect(player.velocity.y).toBeCloseTo(-CONFIG.player.waterGravity * 0.016, 5);
  });

  it('detects lava independently from water', () => {
    const world = {
      getBlock(_x: number, y: number): number {
        return y === 1 ? BlockId.Lava : BlockId.Air;
      },
      setBlock(): void {
        /* no-op */
      },
      isSolid(_x: number, y: number): boolean {
        return y < 0;
      },
    };
    const physics = new PlayerPhysics(world, registry);
    const player = new Player({ position: new THREE.Vector3(2.5, 1.2, 2.5) });
    physics.update(player, 0.016);
    expect(player.inWater).toBe(false);
    expect(player.inLava).toBe(true);
  });

  it('reports landing distance for survival fall damage', () => {
    const physics = new PlayerPhysics(makeFloorWorld(), registry);
    const player = new Player({ position: new THREE.Vector3(2, 12, 2) });
    for (let i = 0; i < 120; i++) {
      physics.update(player, 0.1);
      const landing = physics.consumeLandingDistance();
      if (landing > 0) {
        expect(landing).toBeGreaterThan(3);
        expect(player.onGround).toBe(true);
        return;
      }
    }
    throw new Error('player never landed');
  });
});
