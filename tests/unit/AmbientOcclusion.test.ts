import { describe, it, expect } from 'vitest';
import { sampleCornerAO, quadVertexAO } from '../../src/rendering/AmbientOcclusion';
import type { FaceLightContext } from '../../src/rendering/VertexLighting';
import type { LightSampler } from '../../src/rendering/GreedyMesher';

/** In-memory opacity-only sampler (AO never reads light values). */
class AOWorld implements LightSampler {
  private readonly opaqueCells = new Set<string>();

  constructor(private readonly minY = 0) {}

  static unit(): AOWorld {
    return new AOWorld(0);
  }

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < 16 && y >= this.minY && y < 16 && z >= 0 && z < 16;
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.opaqueCells.has(this.key(x, y, z));
  }

  getSkyLight(): number {
    return 0;
  }

  getBlockLight(): number {
    return 0;
  }

  setOpaque(x: number, y: number, z: number): void {
    this.opaqueCells.add(this.key(x, y, z));
  }
}

/** An `up` face (axis y, +normal) at `planeCoord` over cell (0, 0, 0). */
function upFace(planeCoord = 1, cellY = 0): FaceLightContext {
  return { axis: 1, isMax: true, planeCoord, cellX: 0, cellY, cellZ: 0 };
}

describe('sampleCornerAO', () => {
  it('returns 0 when both side cells are opaque', () => {
    const world = AOWorld.unit();
    world.setOpaque(4, 1, 5); // side1
    world.setOpaque(5, 1, 4); // side2
    expect(sampleCornerAO(world, upFace(), 5, 5)).toBe(0);
  });

  it('returns 1 for one side plus the diagonal corner cell', () => {
    const world = AOWorld.unit();
    world.setOpaque(4, 1, 5); // side1
    world.setOpaque(4, 1, 4); // corner
    expect(sampleCornerAO(world, upFace(), 5, 5)).toBe(1);
  });

  it('returns 2 for one side without the diagonal', () => {
    const world = AOWorld.unit();
    world.setOpaque(4, 1, 5); // side1
    expect(sampleCornerAO(world, upFace(), 5, 5)).toBe(2);
  });

  it('returns 2 for the diagonal corner cell without sides', () => {
    const world = AOWorld.unit();
    world.setOpaque(4, 1, 4); // corner
    expect(sampleCornerAO(world, upFace(), 5, 5)).toBe(2);
  });

  it('returns 3 when nothing occludes the corner', () => {
    expect(sampleCornerAO(AOWorld.unit(), upFace(), 5, 5)).toBe(3);
  });

  it('never consults the front cell (floor(u), floor(v))', () => {
    const world = AOWorld.unit();
    world.setOpaque(5, 1, 5); // the front cell of corner (5, 5)
    expect(sampleCornerAO(world, upFace(), 5, 5)).toBe(3);
  });

  it('treats out-of-section cells as non-occluding', () => {
    // Corner (0, 0): side1 (-1,1,0), side2 (0,1,-1), corner (-1,1,-1) are all out of section;
    // even the in-section front cell (0,1,0) is opaque and must not count.
    const world = AOWorld.unit();
    world.setOpaque(0, 1, 0);
    expect(sampleCornerAO(world, upFace(), 0, 0)).toBe(3);
    expect(sampleCornerAO(world, upFace(), 16, 16)).toBe(3);
  });

  it('snaps fractional corner coordinates with floor()', () => {
    // Slab top face at y=0.5 → outward layer y=1. Corner (1.5, 1.5) → fu=1, fv=1:
    // side1 = (0,1,1). Without floor-snap (e.g., round/ceil) this would sample elsewhere.
    const world = AOWorld.unit();
    world.setOpaque(0, 1, 1);
    expect(sampleCornerAO(world, upFace(0.5), 1.5, 1.5)).toBe(2);
    // Fractional corner with an all-out-of-section neighborhood stays bright.
    expect(sampleCornerAO(world, upFace(0.5), 0.5, 0.5)).toBe(3);
  });
});

describe('quadVertexAO', () => {
  it('returns corners in the fixed (minU,minV), (maxU,minV), (minU,maxV), (maxU,maxV) order', () => {
    const world = AOWorld.unit();
    world.setOpaque(1, 1, 3); // side1 of corner (2, 3); also corner cell of corner (2, 4)
    world.setOpaque(2, 1, 2); // side2 of corner (2, 3)
    world.setOpaque(4, 1, 3); // side2 of corner (4, 4)

    const levels = quadVertexAO(world, upFace(), 2, 3, 2, 1);

    expect(levels).toEqual([0, 3, 2, 2]);
  });

  it('is deterministic', () => {
    const world = AOWorld.unit();
    world.setOpaque(4, 1, 5);
    expect(quadVertexAO(world, upFace(), 5, 5, 1, 1)).toEqual(quadVertexAO(world, upFace(), 5, 5, 1, 1));
  });
});
