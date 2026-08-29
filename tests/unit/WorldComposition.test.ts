import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { createOverworldComposition, worldCompositionBounds } from '../../src/engine/WorldComposition';

function composition() {
  const registry = createDefaultBlockRegistry();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
    cutout: new THREE.MeshLambertMaterial(),
    fluid: new THREE.MeshLambertMaterial(),
  };
  const result = createOverworldComposition({
    scene: new THREE.Scene(),
    registry,
    stateRegistry: createDefaultBlockStateRegistry(),
    atlas: { uv: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) },
    mesher: { mesh: () => ({ opaque: null, transparent: null }) } as never,
    materials,
    seed: 1337,
    renderDistance: 1,
    simulationDistance: 1,
  });
  return { result, materials };
}

describe('WorldComposition contract', () => {
  it('binds one canonical Overworld composition and exposes dimension bounds', () => {
    const { result, materials } = composition();
    expect(result.dimension).toBe(OVERWORLD_DIMENSION_TYPE);
    expect(result.world.dimension).toBe(OVERWORLD_DIMENSION_TYPE);
    expect(worldCompositionBounds(result)).toEqual({
      minY: -64,
      maxY: 319,
      minSectionY: -4,
      sectionCount: 24,
    });
    expect(result.world.getBlockState(0, -65, 0).blockId).toBe(0);
    expect(result.world.getBlockState(0, 320, 0).blockId).toBe(0);
    expect(result.worldBlockAccess.getBlockId(0, -65, 0)).toBe(0);
    result.world.dispose();
    result.worldLife.dispose();
    for (const material of Object.values(materials)) material.dispose();
  });
});
