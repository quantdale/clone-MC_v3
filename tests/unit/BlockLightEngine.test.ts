import { describe, it, expect } from 'vitest';
import { computeBlockLight, type BlockLightWorld } from '../../src/rendering/BlockLightEngine';

interface GridWorldOptions {
  minY: number;
  maxY: number;
  opaque: (x: number, y: number, z: number) => boolean;
  luminance?: (x: number, y: number, z: number) => number;
}

class GridWorld implements BlockLightWorld {
  readonly minY: number;
  readonly maxY: number;
  private readonly light = new Map<string, number>();
  private readonly opaqueFn: (x: number, y: number, z: number) => boolean;
  private readonly luminanceFn: (x: number, y: number, z: number) => number;

  constructor(opts: GridWorldOptions) {
    this.minY = opts.minY;
    this.maxY = opts.maxY;
    this.opaqueFn = opts.opaque;
    this.luminanceFn = opts.luminance ?? (() => 0);
  }

  getLuminance(x: number, y: number, z: number): number {
    return this.luminanceFn(x, y, z);
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return this.opaqueFn(x, y, z);
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.light.get(`${x},${y},${z}`) ?? 0;
  }

  setBlockLight(x: number, y: number, z: number, value: number): void {
    this.light.set(`${x},${y},${z}`, value);
  }

  snapshot(): string {
    return [...this.light.entries()].sort().join(';');
  }
}

function airWorld(opts: { luminance?: (x: number, y: number, z: number) => number } = {}): GridWorld {
  return new GridWorld({ minY: 0, maxY: 16, opaque: () => false, luminance: opts.luminance });
}

describe('computeBlockLight', () => {
  it('falls off by 1 per block from a torch source', () => {
    const world = airWorld({ luminance: (x, y, z) => (x === 8 && y === 8 && z === 8 ? 14 : 0) });
    computeBlockLight(world);

    expect(world.getBlockLight(8, 8, 8)).toBe(14);
    expect(world.getBlockLight(9, 8, 8)).toBe(13);
    expect(world.getBlockLight(10, 8, 8)).toBe(12);
    // Distance 16 from the source -> 0.
    expect(world.getBlockLight(0, 8, 0)).toBe(0);
  });

  it('emits from an opaque source (glowstone)', () => {
    const world = new GridWorld({
      minY: 0,
      maxY: 16,
      opaque: (x, y, z) => x === 8 && y === 8 && z === 8,
      luminance: (x, y, z) => (x === 8 && y === 8 && z === 8 ? 15 : 0),
    });
    computeBlockLight(world);

    expect(world.getBlockLight(8, 8, 8)).toBe(15); // opaque but emits
    expect(world.getBlockLight(9, 8, 8)).toBe(14); // air neighbor
  });

  it('propagates around corners', () => {
    // A wall at x=8, y=8, z in [8..16] separating the torch from (9, 8, 9); light bends around the
    // wall's end at z=8 through (9, 8, 8)? Simpler fixture: torch at (7,8,7); opaque wall column at
    // x=8, y=8, z>=8; cell (9,8,9) receives light around the corner.
    const world = new GridWorld({
      minY: 0,
      maxY: 16,
      opaque: (x, y, z) => x === 8 && y === 8 && z >= 8,
      luminance: (x, y, z) => (x === 7 && y === 8 && z === 7 ? 12 : 0),
    });
    computeBlockLight(world);

    expect(world.getBlockLight(9, 8, 9)).toBeGreaterThan(0); // around the corner
    expect(world.getBlockLight(8, 8, 9)).toBe(0); // the wall cell itself
  });

  it('opaque walls block propagation', () => {
    // A full vertical wall at x = 8 (all y, all z) separates the volume.
    const world = new GridWorld({
      minY: 0,
      maxY: 16,
      opaque: (x, _y, _z) => x === 8,
      luminance: (x, y, z) => (x === 7 && y === 8 && z === 8 ? 14 : 0),
    });
    computeBlockLight(world);

    expect(world.getBlockLight(9, 8, 8)).toBe(0); // far side of the wall
    expect(world.getBlockLight(7, 8, 8)).toBe(14);
  });

  it('is deterministic across identical worlds', () => {
    const make = () =>
      airWorld({ luminance: (x, y, z) => (x === 8 && y === 8 && z === 8 ? 14 : 0) });
    const a = make();
    const b = make();
    computeBlockLight(a);
    computeBlockLight(b);
    expect(a.snapshot()).toBe(b.snapshot());
  });
});
