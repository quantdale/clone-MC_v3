import { describe, it, expect } from 'vitest';
import { stepLavaCell, LAVA_FLOW_INTERVAL } from '../../src/simulation/LavaFlowEngine';
import { stepWaterCell, type WaterWorldAccess } from '../../src/simulation/WaterFlowEngine';
import { createFluidState, type FluidState } from '../../src/world/FluidState';

const WATER = 1;
const LAVA = 2;

class LavaTestWorld implements WaterWorldAccess {
  private readonly fluids = new Map<string, FluidState>();
  private readonly solids = new Set<string>();

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  getFluidState(x: number, y: number, z: number): FluidState | null {
    return this.fluids.get(this.key(x, y, z)) ?? null;
  }

  setFluidState(x: number, y: number, z: number, state: FluidState | null): void {
    if (state === null) this.fluids.delete(this.key(x, y, z));
    else this.fluids.set(this.key(x, y, z), state);
  }

  isReplaceable(x: number, y: number, z: number): boolean {
    return !this.solids.has(this.key(x, y, z));
  }

  setSolid(x: number, y: number, z: number): void {
    this.solids.add(this.key(x, y, z));
  }

  setFluid(x: number, y: number, z: number, level: number, fluidId = LAVA): void {
    this.fluids.set(this.key(x, y, z), createFluidState(fluidId, level));
  }

  levelAt(x: number, y: number, z: number): number | null {
    const state = this.getFluidState(x, y, z);
    return state === null ? null : state.level;
  }

  snapshot(): string {
    return [...this.fluids.entries()].sort().join(';');
  }
}

/** A world with a solid floor at y=0 over the given x/z range. */
function flooredWorld(minX: number, maxX: number, minZ: number, maxZ: number): LavaTestWorld {
  const world = new LavaTestWorld();
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      world.setSolid(x, 0, z);
    }
  }
  return world;
}

function step(world: LavaTestWorld, x: number, y: number, z: number, spreadRange = 3) {
  return stepLavaCell(world, LAVA, x, y, z, spreadRange);
}

describe('stepLavaCell', () => {
  it('spreads at most 3 blocks with the overworld range', () => {
    const world = flooredWorld(0, 5, 0, 0);
    world.setFluid(0, 1, 0, 0); // source

    step(world, 0, 1, 0); // 1
    step(world, 1, 1, 0); // 2
    step(world, 2, 1, 0); // 3

    expect(world.levelAt(1, 1, 0)).toBe(1);
    expect(world.levelAt(2, 1, 0)).toBe(2);
    expect(world.levelAt(3, 1, 0)).toBe(3);

    // The level-3 edge never spreads (no endless crawl).
    expect(step(world, 3, 1, 0).changed).toBe(false);
    expect(world.levelAt(4, 1, 0)).toBeNull();
  });

  it('spreads 7 blocks with the nether range', () => {
    const world = flooredWorld(0, 8, 0, 0);
    world.setFluid(0, 1, 0, 0);

    for (let i = 0; i < 7; i++) step(world, i, 1, 0, 7);

    expect(world.levelAt(7, 1, 0)).toBe(7);
    expect(step(world, 7, 1, 0, 7).changed).toBe(false);
    expect(world.levelAt(8, 1, 0)).toBeNull();
  });

  it('converts falling lava at ground to flowing spreadRange - 1, then spreads', () => {
    const world = flooredWorld(0, 1, 0, 0);
    world.setFluid(0, 1, 0, 8);

    const first = step(world, 0, 1, 0);
    expect(first.changed).toBe(true);
    expect(world.levelAt(0, 1, 0)).toBe(2); // range 3 → base level 2

    step(world, 0, 1, 0); // the base spreads a pool
    expect(world.levelAt(1, 1, 0)).toBe(3);
  });

  it('spawns falling lava below', () => {
    const world = new LavaTestWorld();
    world.setFluid(0, 3, 0, 0); // source

    const result = step(world, 0, 3, 0);

    expect(result.affected).toEqual([[0, 2, 0]]);
    expect(world.levelAt(0, 2, 0)).toBe(8);
  });

  it('forms a source from two horizontal sources', () => {
    const world = flooredWorld(-1, 1, -1, 1);
    world.setFluid(0, 1, 0, 2); // flowing candidate
    world.setFluid(-1, 1, 0, 0); // source west
    world.setFluid(0, 1, 1, 0); // source south

    step(world, 0, 1, 0);

    expect(world.levelAt(0, 1, 0)).toBe(0);
  });

  it('decays unfed lava up to the range then removes it', () => {
    const world = flooredWorld(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 2); // isolated above the floor

    step(world, 0, 1, 0);
    expect(world.levelAt(0, 1, 0)).toBe(3);

    const result = step(world, 0, 1, 0);
    expect(result.changed).toBe(true);
    expect(world.levelAt(0, 1, 0)).toBeNull(); // removed at the range level
  });

  it('rejects invalid spread ranges', () => {
    const world = new LavaTestWorld();
    world.setFluid(0, 1, 0, 0);
    for (const bad of [0, -1, 2.5, NaN]) {
      expect(() => stepLavaCell(world, LAVA, 0, 1, 0, bad)).toThrow(/spreadRange/i);
    }
  });

  it('is a no-op for water cells; the water step is a no-op for lava', () => {
    const world = new LavaTestWorld();
    world.setFluid(0, 1, 0, 0, WATER);
    expect(stepLavaCell(world, LAVA, 0, 1, 0, 3)).toEqual({ changed: false, affected: [] });

    const world2 = new LavaTestWorld();
    world2.setFluid(0, 1, 0, 0, LAVA);
    expect(stepWaterCell(world2, WATER, 0, 1, 0)).toEqual({ changed: false, affected: [] });
  });

  it('is deterministic across identical worlds', () => {
    const build = () => {
      const world = flooredWorld(-1, 3, 0, 0);
      world.setFluid(0, 1, 0, 0);
      return world;
    };
    const run = () => {
      const world = build();
      const results = [step(world, 0, 1, 0), step(world, 1, 1, 0), step(world, 2, 1, 0)];
      return { results, snapshot: world.snapshot() };
    };
    const a = run();
    const b = run();
    expect(a.results).toEqual(b.results);
    expect(a.snapshot).toBe(b.snapshot);
  });

  it('declares the slower lava cadence', () => {
    expect(LAVA_FLOW_INTERVAL).toBe(30);
  });
});
