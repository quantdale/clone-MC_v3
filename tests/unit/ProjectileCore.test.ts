import { describe, it, expect } from 'vitest';
import {
  stepProjectile,
  type ProjectileState,
  type ProjectileTarget,
} from '../../src/simulation/ProjectileCore';
import { CollisionResolver, type ShapeWorld } from '../../src/world/CollisionResolver';
import { VoxelShape } from '../../src/world/VoxelShape';

const resolver = new CollisionResolver();

class EmptyWorld implements ShapeWorld {
  getCollisionShape(): VoxelShape {
    return VoxelShape.EMPTY;
  }
}

/** A world with a full-cube floor at world-y in [floorCy, floorCy+1), empty elsewhere. */
class FloorWorld implements ShapeWorld {
  constructor(private readonly floorCy: number) {}
  getCollisionShape(_x: number, y: number, _z: number): VoxelShape {
    return Math.floor(y) === this.floorCy ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }
}

const GRAVITY = 0.05;
const DRAG = 0.99;

function baseState(overrides: Partial<ProjectileState> = {}): ProjectileState {
  return { x: 0, y: 10, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, ageTicks: 0, ...overrides };
}

describe('stepProjectile — gravity/drag ordering', () => {
  it('subtracts gravity from vy, integrates position, then applies drag for the next tick', () => {
    const result = stepProjectile(new EmptyWorld(), resolver, baseState(), []);

    expect(result.expired).toBe(false);
    expect(result.hitBlock).toBeNull();
    expect(result.hitEntityId).toBeNull();
    expect(result.state.y).toBeCloseTo(10 - GRAVITY);
    expect(result.state.vy).toBeCloseTo(-GRAVITY * DRAG);
  });
});

describe('stepProjectile — block collision', () => {
  it('embeds into a solid floor, zeroes velocity, and reports the resting cell', () => {
    const world = new FloorWorld(2); // solid at y in [2,3)
    const state = baseState({ y: 10, vy: -50 });

    const result = stepProjectile(world, resolver, state, []);

    expect(result.hitEntityId).toBeNull();
    expect(result.state.vx).toBe(0);
    expect(result.state.vy).toBe(0);
    expect(result.state.vz).toBe(0);
    expect(result.hitBlock).toEqual({
      x: Math.floor(result.state.x),
      y: Math.floor(result.state.y),
      z: Math.floor(result.state.z),
    });
    // The projectile came to rest at or above the floor's top face (y=3), not inside/below it.
    expect(result.state.y).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});

describe('stepProjectile — entity collision priority', () => {
  it('reports an entity hit and suppresses a simultaneously-qualifying block hit', () => {
    const world = new FloorWorld(2); // would otherwise collide with the floor
    const state = baseState({ y: 10, vy: -50 });
    const destinationY = state.y + (state.vy - GRAVITY); // raw, unclamped destination

    const target: ProjectileTarget = { id: 999, x: 0, y: destinationY, z: 0, radius: 0.5 };
    const result = stepProjectile(world, resolver, state, [target]);

    expect(result.hitEntityId).toBe(999);
    expect(result.hitBlock).toBeNull();
    expect(result.state.vx).toBe(0);
    expect(result.state.vy).toBe(0);
    expect(result.state.vz).toBe(0);
  });
});

describe('stepProjectile — owner immunity', () => {
  it('excludes the owner from entity-hit detection during the immunity window', () => {
    const world = new EmptyWorld();
    const state = baseState({ ownerId: 7, ageTicks: 0 }); // post-increment age = 1 <= default 5
    const destinationY = state.y + (state.vy - GRAVITY);
    const target: ProjectileTarget = { id: 7, x: 0, y: destinationY, z: 0, radius: 0.5 };

    const result = stepProjectile(world, resolver, state, [target]);

    expect(result.hitEntityId).toBeNull();
  });

  it('includes the owner once the immunity window has elapsed', () => {
    const world = new EmptyWorld();
    const state = baseState({ ownerId: 7, ageTicks: 5 }); // post-increment age = 6 > default 5
    const destinationY = state.y + (state.vy - GRAVITY);
    const target: ProjectileTarget = { id: 7, x: 0, y: destinationY, z: 0, radius: 0.5 };

    const result = stepProjectile(world, resolver, state, [target]);

    expect(result.hitEntityId).toBe(7);
  });
});

describe('stepProjectile — expiration', () => {
  it('freezes physics once past maxAgeTicks', () => {
    const world = new EmptyWorld();
    const state = baseState({ x: 1, y: 2, z: 3, vx: 4, vy: 5, vz: 6, ageTicks: 1200 });

    const result = stepProjectile(world, resolver, state, []);

    expect(result.expired).toBe(true);
    expect(result.hitBlock).toBeNull();
    expect(result.hitEntityId).toBeNull();
    expect(result.state).toEqual({ ...state, ageTicks: 1201 });
  });
});
