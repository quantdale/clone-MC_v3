import { describe, it, expect } from 'vitest';
import {
  stepWaterCell,
  MAX_FLOW_LEVEL,
  FALLING_LEVEL,
  type WaterWorldAccess,
} from '../../src/simulation/WaterFlowEngine';
import { createFluidState, type FluidState } from '../../src/world/FluidState';

const WATER = 1;
const LAVA = 2;

class WaterTestWorld implements WaterWorldAccess {
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

  setFluid(x: number, y: number, z: number, level: number, fluidId = WATER): void {
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
function flooredWorld(minX: number, maxX: number, minZ: number, maxZ: number): WaterTestWorld {
  const world = new WaterTestWorld();
  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      world.setSolid(x, 0, z);
    }
  }
  return world;
}

function step(world: WaterTestWorld, x: number, y: number, z: number) {
  return stepWaterCell(world, WATER, x, y, z);
}

describe('stepWaterCell', () => {
  it('spawns falling water below a source', () => {
    const world = new WaterTestWorld();
    world.setFluid(0, 1, 0, 0);

    const result = step(world, 0, 1, 0);

    expect(result.changed).toBe(true);
    expect(result.affected).toEqual([[0, 0, 0]]);
    expect(world.levelAt(0, 0, 0)).toBe(FALLING_LEVEL);
    expect(world.levelAt(0, 1, 0)).toBe(0); // the source persists
  });

  it('spawns falling water below flowing and falling cells', () => {
    const world = new WaterTestWorld();
    world.setFluid(0, 3, 0, 3); // flowing
    world.setFluid(2, 3, 0, 8); // falling

    step(world, 0, 3, 0);
    step(world, 2, 3, 0);

    expect(world.levelAt(0, 2, 0)).toBe(FALLING_LEVEL);
    expect(world.levelAt(2, 2, 0)).toBe(FALLING_LEVEL);
  });

  it('never spawns onto existing water', () => {
    const world = flooredWorld(-1, 1, -1, 1);
    world.setFluid(0, 2, 0, 0); // source above
    world.setFluid(0, 1, 0, 0); // water below

    expect(step(world, 0, 2, 0).changed).toBe(false);
    expect(world.levelAt(0, 1, 0)).toBe(0); // unchanged
  });

  it('converts falling water to flowing level 6 (max - 1) at ground', () => {
    const world = flooredWorld(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 8);

    const result = step(world, 0, 1, 0);

    expect(result.changed).toBe(true);
    expect(result.affected).toEqual([[0, 1, 0]]);
    expect(world.levelAt(0, 1, 0)).toBe(MAX_FLOW_LEVEL - 1);
  });

  it('spreads from a converted base on the next step (pool formation)', () => {
    const world = flooredWorld(0, 1, 0, 0);
    world.setFluid(0, 1, 0, 8);
    step(world, 0, 1, 0); // converts to flowing 6

    const result = step(world, 0, 1, 0);

    expect(result.affected).toContainEqual([1, 1, 0]);
    expect(world.levelAt(1, 1, 0)).toBe(MAX_FLOW_LEVEL);
  });

  it('spreads level 1 from a source', () => {
    const world = flooredWorld(0, 1, 0, 0);
    world.setFluid(0, 1, 0, 0);

    step(world, 0, 1, 0);

    expect(world.levelAt(1, 1, 0)).toBe(1);
  });

  it('spreads level + 1 from flowing water', () => {
    const world = flooredWorld(0, 0, -1, 0);
    world.setFluid(0, 1, 0, 2);

    step(world, 0, 1, 0);

    expect(world.levelAt(0, 1, -1)).toBe(3);
  });

  it('does not spread from level 7 (no endless edge crawl)', () => {
    const world = flooredWorld(-1, 1, 0, 0);
    world.setFluid(0, 1, 0, 7);
    world.setFluid(-1, 1, 0, 6); // feeder keeps level 7 stable

    expect(step(world, 0, 1, 0).changed).toBe(false);
    expect(world.levelAt(1, 1, 0)).toBeNull(); // nothing beyond the edge
    expect(world.levelAt(0, 1, 0)).toBe(7);
  });

  it('improves worse flowing water', () => {
    const world = flooredWorld(0, 1, 0, 0);
    world.setFluid(0, 1, 0, 0); // source
    world.setFluid(1, 1, 0, 5);

    step(world, 0, 1, 0);

    expect(world.levelAt(1, 1, 0)).toBe(1);
  });

  it('never overwrites falling water horizontally', () => {
    const world = flooredWorld(0, 1, 0, 0);
    world.setFluid(0, 1, 0, 0); // source
    world.setFluid(1, 1, 0, 8); // falling

    expect(step(world, 0, 1, 0).changed).toBe(false);
    expect(world.levelAt(1, 1, 0)).toBe(FALLING_LEVEL);
  });

  it('forms a source from two horizontal sources', () => {
    const world = flooredWorld(-1, 1, -1, 1);
    world.setFluid(0, 1, 0, 3); // flowing candidate
    world.setFluid(-1, 1, 0, 0); // source west
    world.setFluid(0, 1, 1, 0); // source south

    step(world, 0, 1, 0);

    expect(world.levelAt(0, 1, 0)).toBe(0);
  });

  it('decays unfed flowing water by one level per step', () => {
    const world = flooredWorld(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 4); // isolated above the floor, solids all around

    step(world, 0, 1, 0);

    expect(world.levelAt(0, 1, 0)).toBe(5);
  });

  it('removes flowing water at level 7', () => {
    const world = flooredWorld(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 7);

    const result = step(world, 0, 1, 0);

    expect(result.changed).toBe(true);
    expect(world.levelAt(0, 1, 0)).toBeNull();
  });

  it('does not decay a cell with a feeder', () => {
    const world = flooredWorld(-1, 0, 0, 0);
    world.setFluid(0, 1, 0, 4);
    world.setFluid(-1, 1, 0, 3); // feeder (lower level)

    expect(step(world, 0, 1, 0).changed).toBe(false);
    expect(world.levelAt(0, 1, 0)).toBe(4);
  });

  it('does not decay a cell with water above', () => {
    const world = flooredWorld(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 4);
    world.setFluid(0, 2, 0, 8); // falling water above

    expect(step(world, 0, 1, 0).changed).toBe(false);
    expect(world.levelAt(0, 1, 0)).toBe(4);
  });

  it('ignores non-water fluids and empty cells', () => {
    const world = flooredWorld(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 0, LAVA);

    expect(step(world, 0, 1, 0)).toEqual({ changed: false, affected: [] });
    expect(step(world, 5, 1, 5)).toEqual({ changed: false, affected: [] });
  });

  it('reports exactly the changed cells in deterministic order', () => {
    const world = flooredWorld(0, 1, 0, 1);
    world.setFluid(0, 1, 0, 0); // source; neighbors (1,1,0) and (0,1,1) are open air

    const result = step(world, 0, 1, 0);

    // Neighbor order -x, +x, -z, +z → (1,1,0) then (0,1,1); (-1,1,0) and (0,1,-1) are out of
    // the floored range and still replaceable → they also get water.
    expect(result.affected).toContainEqual([1, 1, 0]);
    expect(result.affected).toContainEqual([0, 1, 1]);
    expect(result.affected).toContainEqual([-1, 1, 0]);
    expect(result.affected).toContainEqual([0, 1, -1]);
  });

  it('is deterministic across identical worlds', () => {
    const build = () => {
      const world = flooredWorld(-1, 1, -1, 1);
      world.setFluid(0, 1, 0, 0);
      return world;
    };
    const a = build();
    const b = build();
    const ra = step(a, 0, 1, 0);
    const rb = step(b, 0, 1, 0);
    expect(ra).toEqual(rb);
    expect(a.snapshot()).toBe(b.snapshot());
  });
});
