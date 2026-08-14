import { describe, it, expect } from 'vitest';
import { computeSkyLight, type SkyLightWorld } from '../../src/rendering/SkyLightEngine';

interface GridWorldOptions {
  minY: number;
  maxY: number;
  opaque: (x: number, y: number, z: number) => boolean;
}

/** In-memory grid world (16×16 horizontally, arbitrary vertical range). */
class GridWorld implements SkyLightWorld {
  readonly minY: number;
  readonly maxY: number;
  private readonly light = new Map<string, number>();
  private readonly opaqueFn: (x: number, y: number, z: number) => boolean;

  constructor(opts: GridWorldOptions) {
    this.minY = opts.minY;
    this.maxY = opts.maxY;
    this.opaqueFn = opts.opaque;
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.opaqueFn(x, y, z);
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.light.get(`${x},${y},${z}`) ?? 0;
  }

  setSkyLight(x: number, y: number, z: number, value: number): void {
    this.light.set(`${x},${y},${z}`, value);
  }

  snapshot(): string {
    return [...this.light.entries()].sort().join(';');
  }
}

function airWorld(minY: number, maxY: number): GridWorld {
  return new GridWorld({ minY, maxY, opaque: () => false });
}

function groundWorld(minY: number, maxY: number, groundY: number): GridWorld {
  return new GridWorld({ minY, maxY, opaque: (_x, y) => y <= groundY });
}

function overhangWorld(): GridWorld {
  // An overhanging block at (8, 10, 8) with an air cave cell at (8, 9, 8).
  return new GridWorld({
    minY: 0,
    maxY: 16,
    opaque: (x, y, z) => x === 8 && y === 10 && z === 8,
  });
}

describe('computeSkyLight', () => {
  it('falls off by 1 per block in open sky', () => {
    const world = airWorld(0, 32);
    computeSkyLight(world);

    expect(world.getSkyLight(5, 31, 5)).toBe(15);
    expect(world.getSkyLight(5, 30, 5)).toBe(14);
    expect(world.getSkyLight(5, 16, 5)).toBe(0);
    expect(world.getSkyLight(5, 0, 5)).toBe(0);
  });

  it('stops direct light at an opaque surface', () => {
    const world = groundWorld(0, 16, 0);
    computeSkyLight(world);

    expect(world.getSkyLight(5, 15, 5)).toBe(15);
    expect(world.getSkyLight(5, 1, 5)).toBe(1);
    expect(world.getSkyLight(5, 0, 5)).toBe(0); // the opaque block itself
    expect(world.getSkyLight(5, 0, 7)).toBe(0);
  });

  it('propagates light under an overhang via the open side', () => {
    const world = overhangWorld();
    computeSkyLight(world);

    // Open sky above the overhang is bright.
    expect(world.getSkyLight(8, 15, 8)).toBe(15);
    // The cave cell under the overhang receives reduced light (nonzero) via propagation.
    expect(world.getSkyLight(8, 9, 8)).toBeGreaterThan(0);
    // The overhanging block itself is never lit.
    expect(world.getSkyLight(8, 10, 8)).toBe(0);
  });

  it('is deterministic across identical worlds', () => {
    const a = airWorld(0, 16);
    const b = airWorld(0, 16);
    computeSkyLight(a);
    computeSkyLight(b);
    expect(a.snapshot()).toBe(b.snapshot());

    const c = overhangWorld();
    const d = overhangWorld();
    computeSkyLight(c);
    computeSkyLight(d);
    expect(c.snapshot()).toBe(d.snapshot());
  });

  it('never lights opaque cells', () => {
    const world = groundWorld(0, 16, 3);
    computeSkyLight(world);

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let y = 0; y <= 3; y++) {
          expect(world.getSkyLight(x, y, z)).toBe(0);
        }
      }
    }
  });
});
