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
  it('a warm memo reverts to air after the chunk unloads and sees it again on reload', () => {
    const world = makeWorld();
    // Warm the memo for chunk (0,0,0) with a real read.
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) {
      world.update(0.016, 0, 0);
      ready = world.getBlock(8, 8, 8) !== BlockId.Air;
    }
    expect(ready).toBe(true);
    expect(world.getBlock(8, 8, 8)).toBe(BlockId.Stone);

    // Stream far away so (0,0,0) leaves render distance + hysteresis and is
    // unloaded while the memo still holds its coordinates.
    let unloaded = false;
    for (let i = 0; i < 400 && !unloaded; i++) {
      world.update(0.016, 12, 0);
      unloaded = world.getBlock(8, 8, 8) === BlockId.Air;
    }
    expect(unloaded).toBe(true);

    // Return home: the chunk regenerates and reads become live again.
    let reloaded = false;
    for (let i = 0; i < 200 && !reloaded; i++) {
      world.update(0.016, 0, 0);
      reloaded = world.getBlock(8, 8, 8) === BlockId.Stone;
    }
    expect(reloaded).toBe(true);
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
