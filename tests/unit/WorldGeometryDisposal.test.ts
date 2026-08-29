import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { emptyMeshBuildResult, type ChunkMeshResult } from '../../src/world/MeshingTypes';
import { World } from '../../src/world/World';

function makeWorld(): World {
  const registry = createDefaultBlockRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();
  return new World({
    registry,
    stateRegistry,
    seed: 7,
    scene: new THREE.Scene(),
    mesher: { mesh: () => ({ opaque: null, transparent: null }) } as never,
    generator: { generateChunk: () => undefined, getHeightAt: () => 0 } as never,
    materials: {
      opaque: new THREE.MeshLambertMaterial(),
      transparent: new THREE.MeshLambertMaterial(),
    },
    renderDistance: 0,
    dimension: OVERWORLD_DIMENSION_TYPE,
  });
}

function result(overrides: Partial<ChunkMeshResult>): ChunkMeshResult {
  return {
    opaque: null,
    transparent: null,
    cutout: null,
    translucent: null,
    fluid: null,
    streams: emptyMeshBuildResult(),
    ...overrides,
  };
}

type RenderOwner = {
  attachCanonicalSection(
    key: string,
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    mesh: ChunkMeshResult,
  ): void;
};

describe('World geometry ownership and exact-once disposal', () => {
  it('disposes replaced canonical geometry once and releases the replacement on unload', () => {
    const world = makeWorld();
    const owner = world as unknown as RenderOwner;
    const first = new THREE.BufferGeometry();
    const replacement = new THREE.BufferGeometry();
    const firstDispose = vi.spyOn(first, 'dispose');
    const replacementDispose = vi.spyOn(replacement, 'dispose');

    owner.attachCanonicalSection('0,-4,0', 0, -4, 0, result({ opaque: first }));
    owner.attachCanonicalSection('0,-4,0', 0, -4, 0, result({ opaque: replacement }));
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(replacementDispose).not.toHaveBeenCalled();

    world.dispose();
    world.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(replacementDispose).toHaveBeenCalledTimes(1);
  });

  it('sweeps canonical section geometry that has no compatibility slab', () => {
    const world = makeWorld();
    const geometry = new THREE.BufferGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    const owner = world as unknown as RenderOwner;

    owner.attachCanonicalSection('12,19,-8', 12, 19, -8, result({ opaque: geometry }));
    world.dispose();
    world.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes a distinct legacy transparent alias when translucent is canonical', () => {
    const world = makeWorld();
    const canonical = new THREE.BufferGeometry();
    const alias = new THREE.BufferGeometry();
    const canonicalDispose = vi.spyOn(canonical, 'dispose');
    const aliasDispose = vi.spyOn(alias, 'dispose');
    const owner = world as unknown as RenderOwner;

    owner.attachCanonicalSection(
      '0,-4,0',
      0,
      -4,
      0,
      result({ translucent: canonical, transparent: alias }),
    );

    expect(aliasDispose).toHaveBeenCalledTimes(1);
    expect(canonicalDispose).not.toHaveBeenCalled();
    world.dispose();
    expect(aliasDispose).toHaveBeenCalledTimes(1);
    expect(canonicalDispose).toHaveBeenCalledTimes(1);
  });
});
