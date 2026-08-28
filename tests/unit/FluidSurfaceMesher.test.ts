import { describe, it, expect } from 'vitest';
import {
  meshFluidSurface,
  meshFluidSurfaces,
  type FluidSurfaceWorld,
} from '../../src/rendering/FluidSurfaceMesher';
import type { LightSampler, OpaqueFaceQuad } from '../../src/rendering/GreedyMesher';
import { createFluidState, type FluidState } from '../../src/world/FluidState';

const WATER = 1;
const LAVA = 2;

class SurfaceWorld implements FluidSurfaceWorld {
  private readonly fluids = new Map<string, FluidState>();

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  getFluidState(x: number, y: number, z: number): FluidState | null {
    return this.fluids.get(this.key(x, y, z)) ?? null;
  }

  setFluid(x: number, y: number, z: number, level: number, fluidId = WATER): void {
    this.fluids.set(this.key(x, y, z), createFluidState(fluidId, level));
  }

  clearFluid(x: number, y: number, z: number): void {
    this.fluids.delete(this.key(x, y, z));
  }

  setSolid(x: number, y: number, z: number): void {
    this.fluids.set(this.key(x, y, z), createFluidState(999, 0)); // a non-fluid "block" cell
  }
}

/** All air, all in bounds: corner light/AO are deterministic constants. */
const light: LightSampler = {
  inBounds: () => true,
  isOpaque: () => false,
  getSkyLight: () => 7,
  getBlockLight: () => 3,
};

function upQuad(quads: OpaqueFaceQuad[]): OpaqueFaceQuad | undefined {
  return quads.find((q) => q.face === 'up');
}

function sideQuad(quads: OpaqueFaceQuad[], face: OpaqueFaceQuad['face']): OpaqueFaceQuad | undefined {
  return quads.find((q) => q.face === face);
}

describe('meshFluidSurface', () => {
  it('emits a top face at y+1 for a source with air above', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0);

    const quads = meshFluidSurface(world, WATER, light, 0, 0, 0);

    const up = upQuad(quads);
    expect(up).toBeDefined();
    expect(up!.y).toBe(1);
    expect(up!.width).toBe(1);
    expect(up!.height).toBe(1);
    expect(up!.blockId).toBe(WATER);
  });

  it('places the top face at the flowing surface height', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 4); // surface 0.5

    expect(upQuad(meshFluidSurface(world, WATER, light, 0, 0, 0))!.y).toBe(0.5);

    world.setFluid(0, 0, 0, 1); // surface 7/8
    expect(upQuad(meshFluidSurface(world, WATER, light, 0, 0, 0))!.y).toBe(7 / 8);

    world.setFluid(0, 0, 0, 7); // surface 1/8
    expect(upQuad(meshFluidSurface(world, WATER, light, 0, 0, 0))!.y).toBe(1 / 8);

    world.setFluid(0, 0, 0, 8); // falling → full height
    expect(upQuad(meshFluidSurface(world, WATER, light, 0, 0, 0))!.y).toBe(1);
  });

  it('emits no top face when the same fluid is above', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0);
    world.setFluid(0, 1, 0, 0);

    expect(upQuad(meshFluidSurface(world, WATER, light, 0, 0, 0))).toBeUndefined();
  });

  it('emits full-depth side faces against air and blocks', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0);
    world.setSolid(1, 0, 0); // east neighbor is a block

    const quads = meshFluidSurface(world, WATER, light, 0, 0, 0);

    const west = sideQuad(quads, 'west'); // air west
    expect(west).toBeDefined();
    expect(west!.x).toBe(0);
    expect(west!.y).toBe(0);
    expect(west!.height).toBe(1);

    const east = sideQuad(quads, 'east'); // block east
    expect(east).toBeDefined();
    expect(east!.x).toBe(1);
    expect(east!.y).toBe(0);
    expect(east!.height).toBe(1);
  });

  it('emits a step side against lower same-fluid water', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0); // source, top 1
    world.setFluid(0, 0, -1, 4); // north level 4, top 0.5

    const quads = meshFluidSurface(world, WATER, light, 0, 0, 0);

    const north = sideQuad(quads, 'north');
    expect(north).toBeDefined();
    expect(north!.z).toBe(0);
    expect(north!.y).toBe(0.5);
    expect(north!.height).toBe(0.5);
  });

  it('emits no side against equal or higher same-fluid water', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0);
    world.setFluid(1, 0, 0, 0); // east source, equal top

    const quads = meshFluidSurface(world, WATER, light, 0, 0, 0);

    expect(sideQuad(quads, 'east')).toBeUndefined();

    // With the east neighbor removed, the side returns; with water above, no top face.
    world.clearFluid(1, 0, 0);
    world.setFluid(0, 1, 0, 0);
    const quads2 = meshFluidSurface(world, WATER, light, 0, 0, 0);
    expect(sideQuad(quads2, 'east')).toBeDefined();
    expect(upQuad(quads2)).toBeUndefined(); // covered above
  });

  it('emits a full-depth side against a different fluid', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0, WATER);
    world.setFluid(1, 0, 0, 0, LAVA);

    const quads = meshFluidSurface(world, WATER, light, 0, 0, 0);

    const east = sideQuad(quads, 'east');
    expect(east).toBeDefined();
    expect(east!.height).toBe(1);
  });

  it('produces no quads for empty or foreign cells', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0, LAVA);

    expect(meshFluidSurface(world, WATER, light, 0, 0, 0)).toEqual([]);
    expect(meshFluidSurface(world, WATER, light, 5, 5, 5)).toEqual([]);
  });

  it('attaches 070/071 corner data to every quad', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0);

    const quads = meshFluidSurface(world, WATER, light, 0, 0, 0);

    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) {
      expect(quad.vertexLights).toHaveLength(4);
      expect(quad.vertexLights.every((l) => l.sky === 7 && l.block === 3)).toBe(true);
      expect(quad.vertexAO).toHaveLength(4);
    }
  });

  it('is deterministic and batches in input order', () => {
    const world = new SurfaceWorld();
    world.setFluid(0, 0, 0, 0);
    world.setFluid(2, 0, 2, 4);

    const a = meshFluidSurface(world, WATER, light, 0, 0, 0);
    const b = meshFluidSurface(world, WATER, light, 0, 0, 0);
    expect(a).toEqual(b);

    const batched = meshFluidSurfaces(world, WATER, light, [
      [0, 0, 0],
      [2, 0, 2],
    ]);
    expect(batched).toEqual([...a, ...meshFluidSurface(world, WATER, light, 2, 0, 2)]);
  });
});
