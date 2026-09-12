import { describe, it, expect } from 'vitest';
import {
  BlockLightEngine,
  computeBlockLight,
  type BlockLightFieldAccess,
  type BlockLightWorld,
} from '../../src/rendering/BlockLightEngine';

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

describe('BlockLightEngine incremental channel (268 coverage uplift)', () => {
  function tinyWorld(luminance: (x: number, y: number, z: number) => number): GridWorld {
    return new GridWorld({ minY: 0, maxY: 2, opaque: () => false, luminance });
  }

  it('starts idle with version 0 and no pending work', () => {
    const engine = new BlockLightEngine(tinyWorld(() => 0));
    expect(engine.idle).toBe(true);
    expect(engine.pendingCount).toBe(0);
    expect(engine.version).toBe(0);
  });

  it('seeds a fresh emitter on invalidate+drain and falls off with distance', () => {
    const world = tinyWorld((x, y, z) => (x === 0 && y === 0 && z === 0 ? 14 : 0));
    const engine: BlockLightEngine = new BlockLightEngine(world as BlockLightFieldAccess);
    engine.invalidate(0, 0, 0);
    expect(engine.idle).toBe(false);
    expect(engine.pendingCount).toBe(1);

    const result = engine.drain({});
    expect(result.completed).toBe(true);
    expect(result.opsUsed).toBeGreaterThan(0);
    expect(engine.version).toBe(1);
    expect(engine.idle).toBe(true);
    expect(world.getBlockLight(0, 0, 0)).toBe(14);
    expect(world.getBlockLight(1, 0, 0)).toBe(13);
    expect(world.getBlockLight(0, 1, 0)).toBe(13);
    expect(world.getBlockLight(2, 0, 0)).toBe(12);
    // Distance 14 from the source never reaches a positive level.
    expect(world.getBlockLight(14, 0, 0)).toBe(0);
  });

  it('clearPending drops queued work without touching stored light', () => {
    const world = tinyWorld((x, y, z) => (x === 0 && y === 0 && z === 0 ? 14 : 0));
    const engine = new BlockLightEngine(world);
    engine.invalidate(0, 0, 0);
    expect(engine.pendingCount).toBe(1);
    engine.clearPending();
    expect(engine.pendingCount).toBe(0);
    expect(engine.idle).toBe(true);
    expect(engine.version).toBe(0);
    expect(world.getBlockLight(0, 0, 0)).toBe(0);
  });

  it('re-evaluates only invalidated cells on a later drain', () => {
    let emitting = true;
    const world = tinyWorld((x, y, z) => (emitting && x === 0 && y === 0 && z === 0 ? 14 : 0));
    const engine = new BlockLightEngine(world);
    engine.invalidate(0, 0, 0);
    expect(engine.drain({}).completed).toBe(true);
    expect(world.getBlockLight(1, 0, 0)).toBe(13);

    // Source removed: the engine re-evaluates the invalidated cell (now dark,
    // no emission, nothing to remove) and leaves uninvalidated cells alone.
    emitting = false;
    world.setBlockLight(0, 0, 0, 0);
    engine.invalidate(0, 0, 0);
    const result = engine.drain({});
    expect(result.completed).toBe(true);
    // No work was queued (dark cell, no emission), so the version is untouched.
    expect(result.opsUsed).toBe(0);
    expect(engine.version).toBe(1);
    expect(world.getBlockLight(0, 0, 0)).toBe(0);
    expect(world.getBlockLight(1, 0, 0)).toBe(13);
  });
});

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
