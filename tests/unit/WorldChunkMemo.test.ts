import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';

/**
 * Change 254 R2: the one-entry chunk lookup memo must never surface stale
 * chunk data across unload/reload cycles.
 */

function makeWorld(seed = 1337): World {
  const registry = createDefaultBlockRegistry();
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

describe('World chunk memo lifecycle (254 R2)', () => {
  it('keeps canonical reads stable after the resident chunk projection unloads', () => {
    const world = makeWorld();
    const manager = (world as unknown as {
      chunkManager: { getChunk: (cx: number, cy: number, cz: number) => Chunk | undefined };
    }).chunkManager;
    // Warm the canonical read and the resident projection for chunk (0,0,0).
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      world.update(0.016, 0, 0);
      ready = world.getBlock(8, 8, 8) !== BlockId.Air;
    }
    expect(ready).toBe(true);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);
    expect(manager.getChunk(0, 0, 0)).toBeDefined();

    // Stream far away until the resident slab projection is evicted. The
    // canonical column remains materialized and remains the public read truth.
    let unloaded = false;
    for (let i = 0; i < 400 && !unloaded; i++) {
      world.update(0.016, 12, 0);
      unloaded = manager.getChunk(0, 0, 0) === undefined;
    }
    expect(unloaded).toBe(true);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);

    // Return home: the slab projection regenerates without changing canonical data.
    let reloaded = false;
    for (let i = 0; i < 200 && !reloaded; i++) {
      world.update(0.016, 0, 0);
      reloaded = manager.getChunk(0, 0, 0)?.generated === true;
    }
    expect(reloaded).toBe(true);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);
  });

  it('retains dirty canonical ownership after the resident slab unloads', () => {
    const world = makeWorld();
    const manager = (world as unknown as {
      chunkManager: { getChunk: (cx: number, cy: number, cz: number) => Chunk | undefined };
    }).chunkManager;

    for (let i = 0; i < 200 && manager.getChunk(0, 0, 0) === undefined; i++) {
      world.update(0.016, 0, 0);
    }
    expect(manager.getChunk(0, 0, 0)).toBeDefined();
    world.storage.clearDirty();
    world.setBlock(8, 8, 8, BlockId.Sand);
    expect(world.storage.getBlock(8, 8, 8)).toBe(BlockId.Sand);
    expect(world.isStorageDirty).toBe(true);

    let unloaded = false;
    for (let i = 0; i < 400 && !unloaded; i++) {
      world.update(0.016, 12, 0);
      unloaded = manager.getChunk(0, 0, 0) === undefined;
    }
    expect(unloaded).toBe(true);
    expect(world.getDirtyColumns().some((column) => column.chunkX === 0 && column.chunkZ === 0)).toBe(true);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Sand);
  });

  it('interleaved reads of two chunks never cross-contaminate', () => {
    const world = makeWorld();
    for (let i = 0; i < 300; i++) world.update(0.016, 0, 0);
    // Chunks (0,0,0), (1,1,0), (-1,-1,0), (-2,-2,0) all stone-filled;
    // alternate hot reads across them.
    for (let i = 0; i < 64; i++) {
      expect(world.getBlock(i & 15, 8, i & 15)).toBe(BlockId.Stone);
      expect(world.getBlock(16 + (i & 15), 8, 16 + (i & 15))).toBe(BlockId.Stone);
      expect(world.getBlock(-16 - (i & 15), 8, -16 - (i & 15))).toBe(BlockId.Stone);
    }
  });
});
