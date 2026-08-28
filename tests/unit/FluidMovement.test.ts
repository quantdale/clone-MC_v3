import { describe, it, expect } from 'vitest';
import {
  applyFluidDrag,
  buoyancyAcceleration,
  eyeFluid,
  fluidDragFactor,
  fluidHeightAt,
  immersion,
  isFullySubmerged,
  submergedFraction,
  type FluidMovementWorld,
} from '../../src/simulation/FluidMovement';
import { createFluidState, type FluidState } from '../../src/world/FluidState';
import type { Aabb } from '../../src/world/VoxelShape';

const WATER = 1;
const LAVA = 2;

class MovementWorld implements FluidMovementWorld {
  private readonly fluids = new Map<string, FluidState>();
  private readonly densities = new Map<number, number>([[WATER, 1], [LAVA, 2]]);

  private key(x: number, y: number, z: number): string {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getFluidState(x: number, y: number, z: number): FluidState | null {
    return this.fluids.get(this.key(x, y, z)) ?? null;
  }

  getFluidDensity(fluidId: number): number {
    return this.densities.get(fluidId) ?? 1;
  }

  setFluid(x: number, y: number, z: number, level: number, fluidId = WATER): void {
    this.fluids.set(`${x},${y},${z}`, createFluidState(fluidId, level));
  }
}

function aabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb {
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

describe('fluidDragFactor', () => {
  it('derives water and lava factors from density', () => {
    expect(fluidDragFactor(1)).toBeCloseTo(0.8);
    expect(fluidDragFactor(2)).toBeCloseTo(0.5);
  });

  it('clamps to [0, 1]', () => {
    expect(fluidDragFactor(5)).toBe(0); // 1.1 - 1.5 = -0.4
    expect(fluidDragFactor(0.2)).toBe(1); // 1.1 - 0.06 > 1
  });

  it('rejects invalid densities', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      expect(() => fluidDragFactor(bad)).toThrow(/density/i);
    }
  });
});

describe('applyFluidDrag', () => {
  it('scales each axis by the factor per tick', () => {
    const result = applyFluidDrag({ x: 1, y: 1, z: 1 }, 1);
    expect(result.x).toBeCloseTo(0.8);
    expect(result.y).toBeCloseTo(0.8);
    expect(result.z).toBeCloseTo(0.8);
  });

  it('compounds over tick deltas', () => {
    const result = applyFluidDrag({ x: 1, y: 0, z: 0 }, 1, 2);
    expect(result.x).toBeCloseTo(0.64);
  });

  it('is the identity for tickDelta 0 and leaves the input untouched', () => {
    const velocity = { x: 3, y: -2, z: 0.5 };
    const result = applyFluidDrag(velocity, 1, 0);
    expect(result).toEqual(velocity);
    expect(velocity).toEqual({ x: 3, y: -2, z: 0.5 });
  });

  it('rejects invalid tick deltas', () => {
    expect(() => applyFluidDrag({ x: 1, y: 0, z: 0 }, 1, -1)).toThrow(/tickDelta/i);
    expect(() => applyFluidDrag({ x: 1, y: 0, z: 0 }, 1, NaN)).toThrow(/tickDelta/i);
  });
});

describe('buoyancyAcceleration', () => {
  it('is neutral at equal densities', () => {
    expect(buoyancyAcceleration(1, 1, 32)).toBe(0);
  });

  it('is upward on denser fluids', () => {
    expect(buoyancyAcceleration(2, 1, 32)).toBe(16); // 32 * (1 - 1/2)
  });

  it('is 0 when the entity is denser', () => {
    expect(buoyancyAcceleration(1, 2, 32)).toBe(0);
  });
});

describe('eyeFluid', () => {
  it('returns the fluid id at a point and null in air', () => {
    const world = new MovementWorld();
    world.setFluid(0, 0, 0, 0);

    expect(eyeFluid(world, 0.5, 0.5, 0.5)).toBe(WATER);
    expect(eyeFluid(world, 5, 5, 5)).toBeNull();
  });
});

describe('fluidHeightAt', () => {
  it('returns the topmost fluid top in the window', () => {
    const world = new MovementWorld();
    world.setFluid(0, 4, 0, 0);
    world.setFluid(0, 5, 0, 2);

    expect(fluidHeightAt(world, 0, 0, 0, 8)).toBe(6);
  });

  it('returns minY for an empty column', () => {
    const world = new MovementWorld();
    expect(fluidHeightAt(world, 0, 0, 2, 8)).toBe(2);
  });

  it('counts falling water', () => {
    const world = new MovementWorld();
    world.setFluid(0, 3, 0, 8); // falling
    expect(fluidHeightAt(world, 0, 0, 0, 8)).toBe(4);
  });
});

describe('submergedFraction and immersion', () => {
  function worldWithWaterTop(top: number): MovementWorld {
    const world = new MovementWorld();
    for (let y = 0; y < top; y++) world.setFluid(0, y, 0, 0);
    return world;
  }

  it('computes partial submersion at mid-height', () => {
    // Water fills y ∈ [0, 4) → top 4; AABB spans [2, 6) → fraction (4-2)/4 = 0.5.
    const world = worldWithWaterTop(4);
    const box = aabb(-0.3, 2, -0.3, 0.3, 6, 0.3);
    expect(submergedFraction(world, box)).toBeCloseTo(0.5);
    expect(isFullySubmerged(world, box)).toBe(false);
    expect(immersion(world, box)).toEqual({ fluidTop: 4, submergedFraction: 0.5, fullySubmerged: false });
  });

  it('is 0 when the AABB is above the fluid', () => {
    const world = worldWithWaterTop(2);
    const box = aabb(-0.3, 5, -0.3, 0.3, 6, 0.3);
    expect(submergedFraction(world, box)).toBe(0);
    expect(isFullySubmerged(world, box)).toBe(false);
  });

  it('is 1 (fully submerged) when the fluid reaches the AABB top', () => {
    const world = worldWithWaterTop(6);
    const box = aabb(-0.3, 2, -0.3, 0.3, 6, 0.3);
    expect(submergedFraction(world, box)).toBe(1);
    expect(isFullySubmerged(world, box)).toBe(true);
    expect(immersion(world, box).fullySubmerged).toBe(true);
  });

  it('clamps oversubmersion to 1', () => {
    const world = worldWithWaterTop(9);
    const box = aabb(-0.3, 2, -0.3, 0.3, 6, 0.3);
    expect(submergedFraction(world, box)).toBe(1);
  });
});

describe('purity', () => {
  it('returns identical results for identical inputs', () => {
    const world = new MovementWorld();
    world.setFluid(0, 0, 0, 0);
    const box = aabb(-0.3, 0, -0.3, 0.3, 2, 0.3);
    expect(fluidHeightAt(world, 0, 0, 0, 8)).toBe(fluidHeightAt(world, 0, 0, 0, 8));
    expect(submergedFraction(world, box)).toBe(submergedFraction(world, box));
    expect(applyFluidDrag({ x: 1, y: 1, z: 1 }, 1)).toEqual(applyFluidDrag({ x: 1, y: 1, z: 1 }, 1));
  });
});
