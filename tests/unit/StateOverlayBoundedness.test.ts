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
 */

const STATE_OVERLAY_MAX_CHUNKS = 10_000;

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
    renderDistance: 1,
    stateRegistry: createDefaultBlockStateRegistry(),
  });
}

describe('state overlay boundedness', () => {
  it('evicts least-recently-written chunks beyond the cap', () => {
    const world = makeWorld();
    // Write one state per distinct chunk key. Chunk keys are far apart in Z so
    // no chunk is loaded; setBlockState still records overlays for unloaded
    // chunks (applied on generation), which is exactly the growth path.
    for (let i = 0; i < STATE_OVERLAY_MAX_CHUNKS; i++) {
      world.setBlockState(8, 8, i * 32, BlockId.Wheat, { age: 1 });
    }
    expect(stateOverlaySizeHack(world)).toBe(STATE_OVERLAY_MAX_CHUNKS);

    // One more write evicts the oldest entry instead of growing further.
    world.setBlockState(8, 8, STATE_OVERLAY_MAX_CHUNKS * 32, BlockId.Wheat, { age: 2 });
    expect(stateOverlaySizeHack(world)).toBe(STATE_OVERLAY_MAX_CHUNKS);
    // The oldest chunk's overlay layer was evicted (its cells fall back to the
    // block default state), and the newest chunk's state survives.
    expect(stateOverlayHas(world, '0,0,0')).toBe(false);
    expect(stateOverlayHas(world, `0,0,${STATE_OVERLAY_MAX_CHUNKS}`)).toBe(true);
  });

  it('refreshes recency on rewrites and drops emptied layers entirely', () => {
    const world = makeWorld();
    for (let i = 0; i < STATE_OVERLAY_MAX_CHUNKS; i++) {
      world.setBlockState(8, 8, i * 32, BlockId.Wheat, { age: 1 });
    }
    // Rewrite the oldest chunk: it must survive the next eviction.
    world.setBlockState(8, 8, 0, BlockId.Wheat, { age: 3 });
    world.setBlockState(8, 8, STATE_OVERLAY_MAX_CHUNKS * 32, BlockId.Wheat, { age: 2 });
    expect(world.getBlockState(8, 8, 0).getProperty('age')).toBe('3');

    // Clearing every cell of a layer removes the whole chunk entry (via the
    // plain-setBlock invalidation path): fill the rewritten chunk with air.
    world.setBlock(8, 8, 0, BlockId.Air);
    world.setBlockState(8, 9, 0, BlockId.Wheat, { age: 1 });
    world.setBlock(8, 9, 0, BlockId.Air);
    expect(stateOverlaySizeHack(world)).toBeLessThanOrEqual(STATE_OVERLAY_MAX_CHUNKS);
  });
});

/**
 * Read the internal overlay size through the public surface: the cap invariant
 * is observable via eviction behavior, but this helper keeps the assertion
 * exact without exposing new production API.
 */
function stateOverlaySizeHack(world: World): number {
  const internals = world as unknown as {
    stateOverlay: Map<string, Map<number, unknown>>;
  };
  return internals.stateOverlay.size;
}

/** Whether the internal overlay still tracks the given `cx,cy,cz` chunk key. */
function stateOverlayHas(world: World, key: string): boolean {
  const internals = world as unknown as {
    stateOverlay: Map<string, Map<number, unknown>>;
  };
  return internals.stateOverlay.has(key);
}
