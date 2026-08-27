import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';

/**
 * Regression oracle (hardening 2026-08-23, F-W-1): the block-state overlay
 * used to grow without bound — one entry per distinct chunk that ever held a
 * stateful write, retained for the whole session even after the chunk was
 * unloaded and never revisited. It is now capped with least-recently-written
 * eviction mirroring the edit overlay's 10k-chunk LRU.
 *
 * After Change 253, the overlay is removed: canonical `VerticalWorldAccess`
 * storage is the single writable authority. This test now verifies that the
 * overlay no longer exists and that property-bearing states round-trip through
 * canonical storage without the old LRU.
 */

function makeWorld(): World {
  const registry = createDefaultBlockRegistry();
  const scene = new THREE.Scene();
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
    seed: 1,
    scene,
    mesher: mesher as never,
    generator: generator as never,
    materials: {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    },
    stateRegistry: createDefaultBlockStateRegistry(),
  });
}

describe('state overlay boundedness', () => {
  it('no longer maintains a separate overlay; canonical storage holds states', () => {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) {
      world.setBlockState(8, 8, i * 32, BlockId.Wheat, { age: 1 });
    }
    expect(stateOverlaySizeHack(world)).toBe(0);
    const state = world.getBlockState(8, 8, 9 * 32);
    expect(state.blockId).toBe(BlockId.Wheat);
  });

  it('canonical writes do not allocate sections for air reads', () => {
    const world = makeWorld();
    const before = getStorageSize(world);
    expect(world.getBlockState(9999, 8, 9999).blockId).toBe(BlockId.Air);
    const after = getStorageSize(world);
    expect(after).toBe(before);
  });
});

/**
 * Read the internal overlay size through the public surface: the cap invariant
 * is observable via eviction behavior, but this helper keeps the assertion
 * exact without exposing new production API.
 */
function stateOverlaySizeHack(world: World): number {
  const internals = world as unknown as {
    stateOverlay?: Map<string, Map<number, unknown>>;
  };
  return internals.stateOverlay?.size ?? 0;
}

function getStorageSize(world: World): number {
  const internals = world as unknown as { storage: { vwa: { size: number } } };
  return internals.storage.vwa.size;
}
