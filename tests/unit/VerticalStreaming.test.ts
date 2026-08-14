import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { DimensionType } from '../../src/data/DimensionType';
import { createResourceId } from '../../src/data/ResourceId';
import { CONFIG } from '../../src/config';

/** Two-layer dimension (128 blocks tall => 2 chunk layers of 64 blocks each). */
const twoLayer = new DimensionType({
  id: createResourceId('minecraft', 'vertical_streaming_test'),
  minY: 0,
  height: 128,
  logicalHeight: 128,
  hasSkylight: true,
});

function makeWorld(seed = 1, dimension?: DimensionType, renderDistance = 2): World {
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
    renderDistance,
    dimension,
  });
}

describe('World vertical streaming window', () => {
  it('defaults to a single chunk layer', () => {
    const world = makeWorld();
    expect(world.getMinChunkY()).toBe(0);
    expect(world.getChunkLayerCount()).toBe(1);
  });

  it('derives the window from a two-layer dimension', () => {
    const world = makeWorld(1, twoLayer);
    expect(world.getMinChunkY()).toBe(0);
    expect(world.getChunkLayerCount()).toBe(2);
  });

  it('streams only cy=0 for the default single-layer world', () => {
    const world = makeWorld();
    for (let i = 0; i < 200; i++) {
      world.update(0.016, 0, 0);
      if (world.getBlock(8, 8, 8) !== BlockId.Air) break;
    }
    // cy=0 column generated; no cy=1 chunk exists by default.
    expect(world.getBlock(8, 8, 8)).not.toBe(BlockId.Air);
    expect(world.getBlock(8, 72, 8)).toBe(BlockId.Air);
    expect(world.getStats().pendingGeneration).toBeLessThanOrEqual(5 * 5);
  });

  it('streams every layer in the window for a multi-layer dimension', () => {
    const world = makeWorld(1, twoLayer, 2);
    for (let i = 0; i < 300; i++) {
      world.update(0.016, 0, 0);
      if (world.getBlock(1 * 16 + 8, 8, 0) !== BlockId.Air && world.getBlock(1 * 16 + 8, 64 + 8, 0) !== BlockId.Air) break;
    }
    // Column (1,0) now has both chunk layers generated.
    expect(world.getBlock(1 * 16 + 8, 8, 0)).not.toBe(BlockId.Air); // cy=0
    expect(world.getBlock(1 * 16 + 8, 64 + 8, 0)).not.toBe(BlockId.Air); // cy=1
    // Generation queue bound scales by the layer count (5x5 * 2 layers).
    expect(world.getStats().pendingGeneration).toBeLessThanOrEqual(5 * 5 * 2);
  });

  it('preload covers every layer in the window', () => {
    const world = makeWorld(1, twoLayer, 2);
    world.preloadChunks(0, 0, 0);
    // One column (radius 0) × two layers, none generated yet.
    expect(world.getStats().pendingGeneration).toBe(2);
  });

  it('preload of the default single-layer world enqueues exactly one chunk', () => {
    const world = makeWorld();
    world.preloadChunks(0, 0, 0);
    expect(world.getStats().pendingGeneration).toBe(1);
  });

  it('readiness reaches 1 on the default single-layer world (no regression)', () => {
    const world = makeWorld();
    expect(world.isReady()).toBe(false);
    for (let i = 0; i < 60; i++) {
      world.update(0.016, 0, 0);
    }
    expect(world.isReady()).toBe(true);
  });
});
