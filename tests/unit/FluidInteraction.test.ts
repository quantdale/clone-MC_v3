import { describe, it, expect } from 'vitest';
import {
  applyFluidContact,
  resolveFluidContact,
  type FluidInteractionWorld,
  type InteractionBlockIds,
} from '../../src/simulation/FluidInteraction';
import { createFluidState, type FluidState } from '../../src/world/FluidState';

const WATER = 1;
const LAVA = 2;
const OBSIDIAN = 100;
const COBBLESTONE = 101;
const STONE = 102;

const IDS: InteractionBlockIds = { obsidian: OBSIDIAN, cobblestone: COBBLESTONE, stone: STONE };

function water(level: number): FluidState {
  return createFluidState(WATER, level);
}

function lava(level: number): FluidState {
  return createFluidState(LAVA, level);
}

class InteractionWorld implements FluidInteractionWorld {
  private readonly fluids = new Map<string, FluidState>();
  private readonly blocks = new Map<string, number>();

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

  setBlockState(x: number, y: number, z: number, blockId: number): void {
    this.blocks.set(this.key(x, y, z), blockId);
    this.fluids.delete(this.key(x, y, z));
  }

  blockAt(x: number, y: number, z: number): number | null {
    return this.blocks.get(this.key(x, y, z)) ?? null;
  }

  snapshot(): string {
    const fluids = [...this.fluids.entries()].sort();
    const blocks = [...this.blocks.entries()].sort();
    return JSON.stringify({ fluids, blocks });
  }
}

describe('resolveFluidContact', () => {
  it('returns NONE when either side has no fluid', () => {
    expect(resolveFluidContact(null, lava(0))).toBe('NONE');
    expect(resolveFluidContact(water(0), null)).toBe('NONE');
    expect(resolveFluidContact(null, null)).toBe('NONE');
  });

  it('turns any water meeting a lava source into obsidian', () => {
    for (const w of [0, 1, 7, 8, 15]) {
      expect(resolveFluidContact(water(w), lava(0))).toBe('OBSIDIAN');
    }
  });

  it('turns a water source meeting flowing lava into stone', () => {
    for (const l of [1, 7, 8, 15]) {
      expect(resolveFluidContact(water(0), lava(l))).toBe('STONE');
    }
  });

  it('turns flowing or falling water meeting flowing lava into cobblestone', () => {
    for (const w of [1, 7, 8, 15]) {
      for (const l of [1, 7, 8, 15]) {
        expect(resolveFluidContact(water(w), lava(l))).toBe('COBBLESTONE');
      }
    }
  });
});

describe('applyFluidContact', () => {
  it('places cobblestone at the lava cell and clears both fluids', () => {
    const world = new InteractionWorld();
    world.setFluidState(0, 1, 0, water(3));
    world.setFluidState(1, 1, 0, lava(2));

    const result = applyFluidContact(world, IDS, 0, 1, 0, 1, 1, 0);

    expect(result).toBe('COBBLESTONE');
    expect(world.getFluidState(0, 1, 0)).toBeNull();
    expect(world.getFluidState(1, 1, 0)).toBeNull();
    expect(world.blockAt(1, 1, 0)).toBe(COBBLESTONE);
  });

  it('places obsidian at the lava source cell', () => {
    const world = new InteractionWorld();
    world.setFluidState(0, 1, 0, water(8)); // falling water
    world.setFluidState(1, 1, 0, lava(0)); // lava source

    const result = applyFluidContact(world, IDS, 0, 1, 0, 1, 1, 0);

    expect(result).toBe('OBSIDIAN');
    expect(world.blockAt(1, 1, 0)).toBe(OBSIDIAN);
    expect(world.getFluidState(0, 1, 0)).toBeNull();
  });

  it('places stone when a water source meets flowing lava', () => {
    const world = new InteractionWorld();
    world.setFluidState(0, 1, 0, water(0));
    world.setFluidState(1, 1, 0, lava(5));

    const result = applyFluidContact(world, IDS, 0, 1, 0, 1, 1, 0);

    expect(result).toBe('STONE');
    expect(world.blockAt(1, 1, 0)).toBe(STONE);
  });

  it('does not mutate for NONE results', () => {
    const world = new InteractionWorld();
    world.setFluidState(0, 1, 0, water(3));

    const result = applyFluidContact(world, IDS, 0, 1, 0, 1, 1, 0);

    expect(result).toBe('NONE');
    expect(world.snapshot()).toBe(
      JSON.stringify({ fluids: [['0,1,0', { fluidId: WATER, level: 3 }]], blocks: [] }),
    );
  });

  it('is deterministic', () => {
    const run = () => {
      const world = new InteractionWorld();
      world.setFluidState(0, 1, 0, water(4));
      world.setFluidState(1, 1, 0, lava(1));
      const result = applyFluidContact(world, IDS, 0, 1, 0, 1, 1, 0);
      return { result, snapshot: world.snapshot() };
    };
    expect(run()).toEqual(run());
  });
});
