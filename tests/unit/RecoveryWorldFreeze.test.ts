/**
 * 257 blocker C: recovery state must freeze world mutation.
 * Prove counters/state/hash do not advance under repeated recovery frames.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { CONFIG } from '../../src/config';
import { Chunk } from '../../src/world/Chunk';

function makeWorld(): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  const scene = new THREE.Scene();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void { chunk.fill(BlockId.Stone); },
    getHeightAt(): number { return CONFIG.seaLevel + 1; },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } { return { opaque: null, transparent: null }; },
    meshSection(): any { return { opaque: null, transparent: null, cutout: null, translucent: null, fluid: null, streams: { opaque: { positions: new Float32Array(), normals: new Float32Array(), indices: [], light: new Float32Array() }, cutout: null, translucent: null, fluid: null } }; }
  };
  return new World({
    registry,
    stateRegistry,
    seed: 1,
    scene,
    mesher: mesher as any,
    generator: generator as any,
    materials: materials as any,
    renderDistance: 2,
    dimension: OVERWORLD_DIMENSION_TYPE,
  });
}

describe('257 recovery freeze', () => {
  it('World.update is no-op when recoveryFrozen, preserving stats and performance snapshot', () => {
    const world = makeWorld();
    // Populate a falling block scenario: place sand above air
    world.setBlock(0, 70, 0, BlockId.Sand);
    world.setBlock(0, 69, 0, BlockId.Air);
    const statsBefore = JSON.stringify(world.getStats());
    const perfBefore = JSON.stringify(world.performanceSnapshot());
    const hashBefore = world.getStats().loadedChunks + world.getStats().dirtySections;

    world.setRecoveryFrozen(true);
    expect(world.isRecoveryFrozen).toBe(true);

    for (let i = 0; i < 20; i++) {
      world.update(0.016, 0, 0);
    }

    const statsAfter = JSON.stringify(world.getStats());
    const perfAfter = JSON.stringify(world.performanceSnapshot());
    const hashAfter = world.getStats().loadedChunks + world.getStats().dirtySections;

    expect(statsAfter).toBe(statsBefore);
    expect(perfAfter).toBe(perfBefore);
    expect(hashAfter).toBe(hashBefore);

    // Unfreeze allows mutation (smoke: should not throw)
    world.setRecoveryFrozen(false);
    expect(world.isRecoveryFrozen).toBe(false);
    world.update(0.016, 0, 0);
  });

  it('repeated frozen frames do not advance fallingQueue or generation', () => {
    const world = makeWorld();
    // Ensure world has at least one chunk loaded by ensuring at center
    world.update(0.016, 0, 0); // first update loads some chunks
    void world.getStats();
    world.setRecoveryFrozen(true);
    const frozenStats = JSON.stringify(world.getStats());
    for (let i = 0; i < 30; i++) world.update(0.016, 0, 0);
    const after = JSON.stringify(world.getStats());
    expect(after).toBe(frozenStats);
    // Also ensure isRecoveryFrozen getter works
    expect(world.isRecoveryFrozen).toBe(true);
  });
});
