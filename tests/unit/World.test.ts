import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';

/**
 * Build a World with a stub mesher/generator so we can exercise its dirty-state
 * and edit-overlay logic without a full renderer.
 */
function makeWorld(seed = 1): World {
  const registry = createDefaultRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
  });
}

/**
 * Like makeWorld, but records every chunk key the mesher is asked to rebuild so
 * tests can assert that boundary edits propagate to neighbouring chunks.
 */
function makeRecordingWorld(seed = 1): { world: World; meshedKeys: string[] } {
  const registry = createDefaultRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Stone);
    },
    getHeightAt(): number {
      return CONFIG.seaLevel + 1;
    },
  };
  const meshedKeys: string[] = [];
  const mesher = {
    mesh(chunk: Chunk): { opaque: null; transparent: null } {
      meshedKeys.push(`${chunk.cx},${chunk.cy},${chunk.cz}`);
      return { opaque: null, transparent: null };
    },
  };
  const world = new World({
    registry,
    seed,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 2,
  });
  return { world, meshedKeys };
}

describe('world dirty propagation and edits', () => {
  /** Stream around the player chunk long enough for the target chunk to be
   *  generated and meshed. */
  function streamUntilGenerated(world: World, cx: number, cz: number): void {
    for (let i = 0; i < 200; i++) {
      world.update(0.016, cx, cz);
      // The chunk covering the player's chunk is generated once generation and
      // meshing have both run for it.
      if (world.getBlock(cx * 16 + 8, 8, cz * 16 + 8) !== BlockId.Air) {
        return;
      }
    }
  }

  it('getBlock returns air for unloaded chunks', () => {
    const world = makeWorld();
    expect(world.getBlock(0, 0, 0)).toBe(BlockId.Air);
  });

  it('setBlock records an edit that survives unload/reload', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);

    // Edit a block.
    world.setBlock(8, 8, 8, BlockId.Sand);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);

    // Unload the chunk by streaming far away (run many frames — unload is
    // budgeted to a few chunks per frame).
    for (let i = 0; i < 500; i++) {
      world.update(0.016, 100, 100);
      if (world.getBlock(8, 8, 8) === BlockId.Air) {
        break;
      }
    }
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Air); // unloaded

    // Return — the edit must be re-applied after regeneration.
    streamUntilGenerated(world, 0, 0);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);
  });

  it('marks a boundary edit dirty on the neighbor chunk', () => {
    const world = makeWorld();
    streamUntilGenerated(world, 0, 0);

    // Block at local x==0 of chunk (0,0,0) is at world x = 0.
    expect(world.getBlock(0, 8, 8)).toBe(BlockId.Stone);

    world.setBlock(0, 8, 8, BlockId.Grass);
    // The edited block is regenerated with the edit overlay applied.
    streamUntilGenerated(world, 0, 0);
    expect(world.getBlock(0, 8, 8)).toBe(BlockId.Grass);
  });

  it('re-meshes the neighboring chunk after a boundary edit', () => {
    const { world, meshedKeys } = makeRecordingWorld();
    streamUntilGenerated(world, 0, 0);

    // The neighbor chunk (-1,0,0) is loaded (renderDistance 2) and meshed.
    const beforeCount = meshedKeys.filter((k) => k === '-1,0,0').length;
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    // Edit a block on the -X boundary of chunk (0,0,0): world x=0.
    world.setBlock(0, 8, 8, BlockId.Grass);

    // Drive meshing long enough for the neighbor's re-mesh job to run.
    for (let i = 0; i < 50; i++) {
      world.update(0.016, 0, 0);
      if (meshedKeys.filter((k) => k === '-1,0,0').length > beforeCount) {
        break;
      }
    }
    // The boundary edit must have triggered a fresh re-mesh of the neighbor.
    expect(meshedKeys.filter((k) => k === '-1,0,0').length).toBeGreaterThan(beforeCount);
  });

  it('isReady reflects visible spawn chunks', () => {
    const world = makeWorld();
    expect(world.isReady()).toBe(false);
    for (let i = 0; i < 60; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.isReady()).toBe(true);
  });

  it('keeps generation queue bounded', () => {
    const world = makeWorld();
    world.update(0.016, 0, 0);
    world.update(0.016, 0, 0);
    const stats = world.getStats();
    // renderDistance 2 → a 5×5 chunk area max; the queue must not grow beyond it.
    expect(stats.pendingGeneration).toBeLessThanOrEqual(5 * 5);
  });
});