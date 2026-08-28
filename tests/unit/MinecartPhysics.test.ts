import { describe, it, expect } from 'vitest';
import {
  MINECART_GRAVITY,
  MINECART_MAX_SPEED,
  minecartOnRails,
  tickMinecart,
  type MinecartWorld,
} from '../../src/simulation/MinecartPhysics';
import type { RailShape } from '../../src/simulation/RailBlockStates';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

interface RailFixture {
  rails: Record<string, RailShape>;
  blocking: string[];
}

function makeWorld(fixture: RailFixture): MinecartWorld {
  return {
    getRailShapeAt(x, y, z) {
      return fixture.rails[key(x, y, z)] ?? null;
    },
    isBlocking(x, y, z) {
      return fixture.blocking.includes(key(x, y, z));
    },
  };
}

function state(
  x: number,
  y: number,
  z: number,
  vx = 0,
  vy = 0,
  vz = 0,
): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  return { x, y, z, vx, vy, vz };
}

describe('minecartOnRails', () => {
  it('is true on a rail cell and false off rails', () => {
    const world = makeWorld({ rails: { [key(0, 0, 0)]: 'north_south' }, blocking: [] });
    expect(minecartOnRails(state(0.5, 0.5, 0.5), world)).toBe(true);
    expect(minecartOnRails(state(3.5, 0.5, 0.5), world)).toBe(false);
  });
});

describe('straight rails', () => {
  it('north_south slides only along z at rail height', () => {
    const world = makeWorld({ rails: { [key(0, 0, 0)]: 'north_south' }, blocking: [] });
    const next = tickMinecart(state(0.5, 0.5, 0.5, 0.3, 0.1, 0.2), world);
    expect(next).toEqual({ x: 0.5, y: 0.5, z: 0.7, vx: 0, vy: 0, vz: 0.2 });
  });

  it('east_west slides only along x at rail height', () => {
    const world = makeWorld({ rails: { [key(0, 0, 0)]: 'east_west' }, blocking: [] });
    const next = tickMinecart(state(0.5, 0.5, 0.5, 0.2, 0.1, 0.3), world);
    expect(next).toEqual({ x: 0.7, y: 0.5, z: 0.5, vx: 0.2, vy: 0, vz: 0 });
  });
});

describe('ascending rails', () => {
  const ascentCases: Array<[RailShape, number, number, number, number, number, number]> = [
    // shape, initial (vx, vy, vz), expected (vx, vy, vz)
    ['ascending_east', 0.2, 0, 0, 0.2, 0.2, 0],
    ['ascending_east', -0.2, 0, 0, -0.2, -0.2, 0], // descending westward
    ['ascending_west', -0.2, 0, 0, -0.2, 0.2, 0],
    ['ascending_west', 0.2, 0, 0, 0.2, -0.2, 0], // descending eastward
    ['ascending_north', 0, 0, -0.2, 0, 0.2, -0.2],
    ['ascending_north', 0, 0, 0.2, 0, -0.2, 0.2], // descending southward
    ['ascending_south', 0, 0, 0.2, 0, 0.2, 0.2],
    ['ascending_south', 0, 0, -0.2, 0, -0.2, -0.2], // descending northward
  ];

  for (const [shape, ivx, ivy, ivz, evx, evy, evz] of ascentCases) {
    it(`${shape} with motion (${ivx}, ${ivy}, ${ivz}) yields (${evx}, ${evy}, ${evz})`, () => {
      const world = makeWorld({ rails: { [key(0, 0, 0)]: shape }, blocking: [] });
      const next = tickMinecart(state(0.5, 0.5, 0.5, ivx, ivy, ivz), world);
      expect(next.vx).toBeCloseTo(evx, 10);
      expect(next.vy).toBeCloseTo(evy, 10);
      expect(next.vz).toBeCloseTo(evz, 10);
    });
  }
});

describe('corner rails', () => {
  const cornerCases: Array<[RailShape, number, number, number, number]> = [
    // shape, incoming (vz, vx), expected (vx, vz)
    ['corner_north_east', -0.2, 0, 0.2, 0], // north -> east
    ['corner_north_east', 0, 0.2, 0, -0.2], // east -> north
    ['corner_north_west', -0.2, 0, -0.2, 0], // north -> west
    ['corner_north_west', 0, -0.2, 0, 0.2], // west -> north
    ['corner_south_east', 0.2, 0, 0.2, 0], // south -> east
    ['corner_south_east', 0, 0.2, 0, -0.2], // east -> south
    ['corner_south_west', 0.2, 0, -0.2, 0], // south -> west
    ['corner_south_west', 0, -0.2, 0, 0.2], // west -> south
  ];

  for (const [shape, ivz, ivx, evx, evz] of cornerCases) {
    it(`${shape} turns incoming (vx=${ivx}, vz=${ivz}) into (vx=${evx}, vz=${evz})`, () => {
      const world = makeWorld({ rails: { [key(0, 0, 0)]: shape }, blocking: [] });
      const next = tickMinecart(state(0.5, 0.5, 0.5, ivx, 0, ivz), world);
      expect(next.vx).toBeCloseTo(evx, 10);
      expect(next.vz).toBeCloseTo(evz, 10);
    });
  }

  it('stops a cart not arriving from a corner direction', () => {
    const world = makeWorld({ rails: { [key(0, 0, 0)]: 'corner_north_east' }, blocking: [] });
    const next = tickMinecart(state(0.5, 0.5, 0.5, 0.2, 0, 0.2), world);
    expect(next.vx).toBe(0);
    expect(next.vz).toBe(0);
    expect(next.x).toBe(0.5);
    expect(next.z).toBe(0.5);
  });
});

describe('speed clamping', () => {
  it('clamps rail speed to MINECART_MAX_SPEED', () => {
    const world = makeWorld({ rails: { [key(0, 0, 0)]: 'east_west' }, blocking: [] });
    const next = tickMinecart(state(0.5, 0.5, 0.5, 2, 0, 3), world);
    expect(next.vx).toBe(MINECART_MAX_SPEED);
    expect(next.vz).toBe(0);
  });
});

describe('off-rail physics', () => {
  it('applies gravity and horizontal decay', () => {
    const world = makeWorld({ rails: {}, blocking: [] });
    const next = tickMinecart(state(0.5, 5, 0.5, 0.2, 0, 0.1), world);
    expect(next.vy).toBe(-MINECART_GRAVITY);
    expect(next.vx).toBeCloseTo(0.2 * 0.98, 10);
    expect(next.vz).toBeCloseTo(0.1 * 0.98, 10);
    expect(next.y).toBeCloseTo(5 - MINECART_GRAVITY, 10);
  });
});

describe('collisions', () => {
  it('stops dead when the next cell is blocking', () => {
    const world = makeWorld({ rails: { [key(0, 0, 0)]: 'east_west' }, blocking: [key(1, 0, 0)] });
    // At x=0.9 the next tick enters cell (1,0,0): the cart stops at 0.9 with zero velocity.
    const next = tickMinecart(state(0.9, 0.5, 0.5, 0.2, 0, 0), world);
    expect(next).toEqual({ x: 0.9, y: 0.5, z: 0.5, vx: 0, vy: 0, vz: 0 });
  });

  it('a falling cart lands on a solid block below', () => {
    const world = makeWorld({ rails: {}, blocking: [key(0, 0, 0)] });
    const next = tickMinecart(state(0.5, 1, 0.5, 0, -0.1, 0), world);
    expect(next).toEqual({ x: 0.5, y: 1, z: 0.5, vx: 0, vy: 0, vz: 0 });
  });
});
