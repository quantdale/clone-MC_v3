import { describe, it, expect } from 'vitest';
import { raycastVoxel } from '../../src/math/DDA';

/** A simple sampler from a set of filled blocks. */
function makeSampler(filled: Array<[number, number, number]>): { isSolid(x: number, y: number, z: number): boolean } {
  const set = new Set(filled.map(([x, y, z]) => `${x},${y},${z}`));
  return {
    isSolid(x, y, z) {
      return set.has(`${x},${y},${z}`);
    },
  };
}

describe('DDA voxel raycast', () => {
  it('hits a block directly ahead along +X', () => {
    const sampler = makeSampler([[5, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 1, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(5);
    expect(hit!.blockY).toBe(0);
    expect(hit!.blockZ).toBe(0);
    expect(hit!.nx).toBe(-1); // entered from the -X face
    // The ray travels 4 full blocks from the start cell (0) to cell 5.
    expect(hit!.distance).toBeCloseTo(4.5, 5);
  });

  it('hits a block directly above (+Y) and reports -Y normal', () => {
    const sampler = makeSampler([[0, 4, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 0, 1, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockY).toBe(4);
    expect(hit!.ny).toBe(-1);
    expect(hit!.distance).toBeCloseTo(3.5, 5);
  });

  it('reports the distance of the first solid block along an axis-aligned ray', () => {
    const sampler = makeSampler([[7, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 1, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(7);
    expect(hit!.distance).toBeCloseTo(6.5, 5);
  });

  it('hits the nearer block when a closer one occludes the far block', () => {
    const sampler = makeSampler([
      [3, 0, 0],
      [6, 0, 0],
    ]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 1, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(3);
    expect(hit!.blockZ).toBe(0);
    expect(hit!.distance).toBeCloseTo(2.5, 5);
  });

  it('hits a diagonal ray', () => {
    const sampler = makeSampler([[3, 3, 3]]);
    const dirX = 1;
    const dirY = 1;
    const dirZ = 1;
    const len = Math.hypot(dirX, dirY, dirZ);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, dirX / len, dirY / len, dirZ / len, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(3);
    expect(hit!.blockY).toBe(3);
    expect(hit!.blockZ).toBe(3);
  });

  it('returns null when no block is within reach', () => {
    const sampler = makeSampler([[50, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 1, 0, 0, 5);
    expect(hit).toBeNull();
  });

  it('misses beyond max reach even when a block exists', () => {
    const sampler = makeSampler([[10, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 1, 0, 0, 5);
    expect(hit).toBeNull();
  });

  it('handles a zero-length direction without looping forever', () => {
    const sampler = makeSampler([[0, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 0, 0, 0, 10);
    expect(hit).toBeNull();
  });

  it('handles negative coordinates', () => {
    const sampler = makeSampler([[-3, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, -1, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(-3);
    expect(hit!.nx).toBe(1); // entered from the +X face
  });

  it('normalizes non-unit directions before applying reach and distance', () => {
    const sampler = makeSampler([[5, 0, 0]]);
    const hit = raycastVoxel(sampler, 0.5, 0.5, 0.5, 10, 0, 0, 10);
    expect(hit).not.toBeNull();
    expect(hit!.blockX).toBe(5);
    expect(hit!.distance).toBeCloseTo(4.5, 5);
  });

  it('rejects non-finite ray inputs', () => {
    const sampler = makeSampler([[0, 0, 0]]);
    expect(raycastVoxel(sampler, Number.NaN, 0, 0, 1, 0, 0, 10)).toBeNull();
    expect(raycastVoxel(sampler, 0, 0, 0, 1, 0, 0, Number.NaN)).toBeNull();
  });
});
