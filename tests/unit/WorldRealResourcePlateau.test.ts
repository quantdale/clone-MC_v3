import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { tileUV } from '../../src/rendering/TextureAtlas';
import type { TextureAtlas } from '../../src/rendering/TextureAtlas';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { ChunkMesher } from '../../src/world/ChunkMesher';
import { TerrainGenerator } from '../../src/world/TerrainGenerator';
import { World } from '../../src/world/World';

function makeWorld(renderDistance = 1): World {
  const registry = createDefaultBlockRegistry();
  return new World({
    registry,
    stateRegistry: createDefaultBlockStateRegistry(),
    seed: 1337,
    scene: new THREE.Scene(),
    mesher: new ChunkMesher({
      registry,
      atlas: { uv: tileUV } as unknown as TextureAtlas,
    }),
    generator: new TerrainGenerator(registry, 1337),
    materials: {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    },
    renderDistance,
    dimension: OVERWORLD_DIMENSION_TYPE,
  });
}

type Plateau = {
  residentColumns: number;
  allocatedSections: number;
  sectionGeometries: number;
  pendingGeneration: number;
  pendingMesh: number;
  pendingUnload: number;
};

function snapshot(world: World): Plateau {
  const stats = world.getStats();
  return {
    residentColumns: stats.residentColumns,
    allocatedSections: stats.allocatedSections,
    sectionGeometries: stats.geometries,
    pendingGeneration: stats.pendingGeneration,
    pendingMesh: stats.pendingMesh,
    pendingUnload: stats.pendingUnload,
  };
}

function settle(world: World, x: number, z: number): Plateau {
  let last = snapshot(world);
  let stableFrames = 0;
  for (let frame = 0; frame < 900; frame++) {
    world.update(1 / 60, x, z);
    const current = snapshot(world);
    const stable =
      current.pendingGeneration === 0 &&
      current.pendingMesh === 0 &&
      current.pendingUnload === 0;
    if (
      stable &&
      current.residentColumns === last.residentColumns &&
      current.sectionGeometries === last.sectionGeometries
    ) {
      stableFrames++;
      if (stableFrames >= 8) return current;
    } else {
      stableFrames = 0;
    }
    last = current;
  }
  throw new Error(`stream did not settle at (${x},${z}): ${JSON.stringify(last)}`);
}

describe('real canonical resource plateau', () => {
  it('reaches full readiness after bounded canonical mesh displacement', () => {
    const world = makeWorld(2);
    try {
      let ready = 0;
      for (let frame = 0; frame < 1800 && ready < 1; frame++) {
        world.update(1 / 60, 0, 0);
        ready = world.getReadyProgress(0, 0);
      }
      expect(ready).toBe(1);
      expect(world.getStats().pendingGeneration).toBe(0);
      expect(world.getStats().pendingMesh).toBeLessThanOrEqual(96 + world.getStats().loadedChunks);
      expect(world.getStats().pendingUnload).toBe(0);
    } finally {
      world.dispose();
    }
  }, 120_000);

  it('keeps resident columns, sections, geometries, and jobs bounded across teleport churn', () => {
    const world = makeWorld();
    const centers: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [20, 20],
      [-20, 20],
      [20, -20],
      [-20, -20],
      [0, 0],
      [0, 0],
    ];
    const settled: Plateau[] = [];
    try {
      for (const [x, z] of centers) settled.push(settle(world, x, z));
    } finally {
      world.dispose();
    }

    console.log(`[253 real plateau] ${JSON.stringify(settled)}`);
    expect(Math.max(...settled.map((s) => s.residentColumns))).toBeLessThanOrEqual(25);
    expect(Math.max(...settled.map((s) => s.allocatedSections))).toBeLessThan(25 * 24);
    expect(Math.max(...settled.map((s) => s.sectionGeometries))).toBeLessThanOrEqual(2 * 25 + 40);
    expect(
      settled.every(
        (s) => s.pendingGeneration === 0 && s.pendingMesh === 0 && s.pendingUnload === 0,
      ),
    ).toBe(true);

    const final = settled.slice(-2).map((s) => s.sectionGeometries);
    expect(Math.max(...final) - Math.min(...final)).toBeLessThanOrEqual(0);
  }, 120_000);
});
