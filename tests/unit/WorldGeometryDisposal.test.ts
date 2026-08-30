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
  scene: THREE.Scene;
  attachCanonicalSection(
    key: string,
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    mesh: ChunkMeshResult,
  ): void;
  attachCanonicalWorkerSection(
    key: string,
    sectionX: number,
    sectionY: number,
    sectionZ: number,
    entries: ReadonlyArray<{
      geometry: THREE.BufferGeometry | null;
      material: THREE.MeshLambertMaterial | undefined;
      renderOrder: number;
      castShadow: boolean;
    }>,
  ): void;
  disposeWorkerMeshBatchGeometries(batch: { geometries: Array<{ geometry: THREE.BufferGeometry | null }> }): void;
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

  it('disposes optional-material geometry instead of attaching an unowned resource', () => {
    const world = makeWorld();
    const owner = world as unknown as RenderOwner;
    const cutout = new THREE.BufferGeometry();
    const fluid = new THREE.BufferGeometry();
    const cutoutDispose = vi.spyOn(cutout, 'dispose');
    const fluidDispose = vi.spyOn(fluid, 'dispose');

    owner.attachCanonicalWorkerSection('optional', 0, -4, 0, [
      { geometry: cutout, material: undefined, renderOrder: 0, castShadow: true },
      { geometry: fluid, material: undefined, renderOrder: 2, castShadow: false },
    ]);

    expect(cutoutDispose).toHaveBeenCalledTimes(1);
    expect(fluidDispose).toHaveBeenCalledTimes(1);
    expect(world.getStats().geometries).toBe(0);
    world.dispose();
  });

  it('releases every temporary batch geometry exactly once across repeated cleanup', () => {
    const world = makeWorld();
    const owner = world as unknown as RenderOwner;
    const first = new THREE.BufferGeometry();
    const second = new THREE.BufferGeometry();
    const firstDispose = vi.spyOn(first, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');
    const batch = { geometries: [{ geometry: first }, { geometry: second }] };

    owner.disposeWorkerMeshBatchGeometries(batch);
    owner.disposeWorkerMeshBatchGeometries(batch);

    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(batch.geometries).toHaveLength(0);
    world.dispose();
  });

  it('keeps the old visible group when replacement construction fails', () => {
    const world = makeWorld();
    const owner = world as unknown as RenderOwner;
    const current = new THREE.BufferGeometry();
    const replacement = new THREE.BufferGeometry();
    const currentDispose = vi.spyOn(current, 'dispose');
    const replacementDispose = vi.spyOn(replacement, 'dispose');
    Object.defineProperty(replacement, 'index', {
      configurable: true,
      get: () => { throw new Error('synthetic triangle-count failure'); },
    });

    owner.attachCanonicalSection('0,-4,0', 0, -4, 0, result({ opaque: current }));
    expect(() => owner.attachCanonicalWorkerSection('0,-4,0', 0, -4, 0, [
      { geometry: replacement, material: (world as unknown as { materials: { opaque: THREE.MeshLambertMaterial } }).materials.opaque, renderOrder: 0, castShadow: true },
    ])).not.toThrow();

    expect(currentDispose).not.toHaveBeenCalled();
    expect(replacementDispose).toHaveBeenCalledTimes(1);
    expect(world.getStats().geometries).toBe(1);
    expect((owner.scene as THREE.Scene).children).toHaveLength(1);
    world.dispose();
    expect(currentDispose).toHaveBeenCalledTimes(1);
  });

  it('cleans visible geometry exactly once on context loss and gates updates until restore', () => {
    const world = makeWorld();
    const owner = world as unknown as RenderOwner;
    const geometry = new THREE.BufferGeometry();
    const dispose = vi.spyOn(geometry, 'dispose');
    owner.attachCanonicalSection('0,-4,0', 0, -4, 0, result({ opaque: geometry }));

    expect(world.getStats().geometries).toBe(1);
    expect(world.isContextLost).toBe(false);
    world.handleContextLost();
    world.handleContextLost();

    expect(world.isContextLost).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(world.getStats().geometries).toBe(0);
    expect((owner.scene as THREE.Scene).children).toHaveLength(0);

    world.update(1 / 60, 0, 0);
    expect(world.isContextLost).toBe(true);
    world.handleContextRestored();
    world.handleContextRestored();
    expect(world.isContextLost).toBe(false);
    world.dispose();
  });
});
