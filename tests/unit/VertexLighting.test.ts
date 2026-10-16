import { describe, it, expect } from 'vitest';
import {
  quadVertexLights,
  sampleCornerLight,
  type FaceLightContext,
} from '../../src/rendering/VertexLighting';
import type { LightSampler } from '../../src/rendering/GreedyMesher';

/** In-memory light sampler with configurable bounds. */
class TestLightWorld implements LightSampler {
  private readonly sky = new Map<string, number>();
  private readonly block = new Map<string, number>();
  private readonly opaqueCells = new Set<string>();

  constructor(
    private readonly minX: number,
    private readonly minY: number,
    private readonly minZ: number,
    private readonly maxX: number,
    private readonly maxY: number,
    private readonly maxZ: number,
  ) {}

  static unit(): TestLightWorld {
    return new TestLightWorld(0, 0, 0, 16, 16, 16);
  }

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return (
      x >= this.minX && x < this.maxX && y >= this.minY && y < this.maxY && z >= this.minZ && z < this.maxZ
    );
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.opaqueCells.has(this.key(x, y, z));
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.sky.get(this.key(x, y, z)) ?? 0;
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.block.get(this.key(x, y, z)) ?? 0;
  }

  setSky(x: number, y: number, z: number, value: number): void {
    this.sky.set(this.key(x, y, z), value);
  }

  setBlock(x: number, y: number, z: number, value: number): void {
    this.block.set(this.key(x, y, z), value);
  }

  setOpaque(x: number, y: number, z: number): void {
    this.opaqueCells.add(this.key(x, y, z));
  }
}

/** An `up` face (axis y, +normal) at `planeCoord` over cell (0, 0, 0). */
function upFace(planeCoord = 1, cellY = 0): FaceLightContext {
  return { axis: 1, isMax: true, planeCoord, cellX: 0, cellY, cellZ: 0 };
}

/** A `down` face (axis y, -normal) at `planeCoord` over cell (0, 0, 0). */
function downFace(planeCoord = 0): FaceLightContext {
  return { axis: 1, isMax: false, planeCoord, cellX: 0, cellY: 0, cellZ: 0 };
}

describe('sampleCornerLight', () => {
  it('averages the four outward-layer cells at an interior corner', () => {
    const world = TestLightWorld.unit();
    // Corner (5, 5) of an up face at y=1: cells x∈{4,5}, z∈{4,5} in layer y=1.
    world.setSky(4, 1, 4, 12);
    world.setSky(5, 1, 4, 8);
    world.setSky(4, 1, 5, 4);
    world.setSky(5, 1, 5, 0);
    world.setBlock(4, 1, 4, 2);
    world.setBlock(5, 1, 4, 4);
    world.setBlock(4, 1, 5, 6);
    world.setBlock(5, 1, 5, 8);

    expect(sampleCornerLight(world, upFace(), 5, 5)).toEqual({ sky: 6, block: 5 });
  });

  it('lets opaque cells contribute 0 and counts them in the average', () => {
    const world = TestLightWorld.unit();
    world.setSky(4, 1, 4, 12);
    world.setSky(5, 1, 4, 14); // opaque: must be ignored, still counted
    world.setSky(4, 1, 5, 4);
    world.setSky(5, 1, 5, 0);
    world.setBlock(4, 1, 4, 2);
    world.setBlock(5, 1, 4, 10); // opaque: ignored
    world.setBlock(4, 1, 5, 6);
    world.setBlock(5, 1, 5, 8);
    world.setOpaque(5, 1, 4);

    // (12 + 0 + 4 + 0) / 4 = 4; (2 + 0 + 6 + 8) / 4 = 4
    expect(sampleCornerLight(world, upFace(), 5, 5)).toEqual({ sky: 4, block: 4 });
  });

  it('skips out-of-section cells at section edges', () => {
    const world = TestLightWorld.unit();
    world.setSky(0, 1, 0, 9); // the only in-bounds cell around corner (0, 0)
    world.setSky(15, 1, 15, 3); // the only in-bounds cell around corner (16, 16)

    expect(sampleCornerLight(world, upFace(), 0, 0)).toEqual({ sky: 9, block: 0 });
    expect(sampleCornerLight(world, upFace(), 16, 16)).toEqual({ sky: 3, block: 0 });
  });

  it('yields (0, 0) when every sample cell is out of section', () => {
    // Up face at the very top of the section: outward layer y=16 is fully out of bounds.
    expect(sampleCornerLight(TestLightWorld.unit(), upFace(16, 15), 0, 0)).toEqual({ sky: 0, block: 0 });
    expect(sampleCornerLight(TestLightWorld.unit(), upFace(16, 15), 8, 8)).toEqual({ sky: 0, block: 0 });
  });

  it('samples the containing cell only for fractional corner coordinates', () => {
    // Slab top face at y=0.5: outward layer = cellY + 1 = 1; fractional corner (0.5, 0.5)
    // uses only the containing cells {0} × {0} → the single cell (0, 1, 0).
    const world = TestLightWorld.unit();
    world.setSky(0, 1, 0, 9);

    expect(sampleCornerLight(world, upFace(0.5), 0.5, 0.5)).toEqual({ sky: 9, block: 0 });
    expect(sampleCornerLight(world, upFace(0.5), 0, 0.5)).toEqual({ sky: 9, block: 0 });
  });

  it('samples layer planeCoord - 1 for integer min faces', () => {
    // Down face at y=0 over a world extending below: outward layer y=-1.
    const world = new TestLightWorld(0, -2, 0, 16, 16, 16);
    world.setSky(0, -1, 0, 11);
    expect(sampleCornerLight(world, downFace(), 0, 0)).toEqual({ sky: 11, block: 0 });

    // Same face in a world starting at y=0: the layer is out of bounds → (0, 0).
    expect(sampleCornerLight(TestLightWorld.unit(), downFace(), 0, 0)).toEqual({ sky: 0, block: 0 });
  });
});

describe('quadVertexLights', () => {
  it('returns corners in the fixed (minU,minV), (maxU,minV), (minU,maxV), (maxU,maxV) order', () => {
    const world = TestLightWorld.unit();
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        world.setSky(x, 1, z, x + 2 * z);
        world.setBlock(x, 1, z, 2 * x + z);
      }
    }

    const lights = quadVertexLights(world, upFace(), 2, 3, 2, 1);

    expect(lights).toEqual([
      { sky: 7, block: 6 }, // (2, 3): x∈{1,2}, z∈{2,3}
      { sky: 9, block: 10 }, // (4, 3): x∈{3,4}, z∈{2,3}
      { sky: 9, block: 7 }, // (2, 4): x∈{1,2}, z∈{3,4}
      { sky: 11, block: 11 }, // (4, 4): x∈{3,4}, z∈{3,4}
    ]);
  });

  it('matches a per-axis light gradient across a merged quad', () => {
    const world = TestLightWorld.unit();
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
          world.setSky(x, y, z, x);
        }
      }
    }

    const lights = quadVertexLights(world, upFace(), 5, 5, 2, 2);

    expect(lights.map((l) => l.sky)).toEqual([5, 7, 5, 7]);
  });

  it('is deterministic', () => {
    const world = TestLightWorld.unit();
    world.setSky(4, 1, 4, 12);
    world.setSky(5, 1, 4, 8);

    expect(quadVertexLights(world, upFace(), 5, 5, 1, 1)).toEqual(
      quadVertexLights(world, upFace(), 5, 5, 1, 1),
    );
  });
});
