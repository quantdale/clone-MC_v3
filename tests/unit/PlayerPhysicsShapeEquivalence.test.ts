import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/world/World';
import { PlayerPhysics } from '../../src/player/PlayerPhysics';
import { createDefaultBlockRegistry, BlockId } from '../../src/world/BlockRegistry';
import { Chunk } from '../../src/world/Chunk';
import { CONFIG } from '../../src/config';
import { VoxelShape, BlockShapeTable } from '../../src/world/VoxelShape';
import type { ShapeWorld } from '../../src/world/CollisionResolver';

/**
 * Change 254 R7: the single-lookup shape adapter must return shapes identical
 * to the historical two-lookup adapter (`isSolid` then `getBlock`) for every
 * cell, including the invisible sub-bedrock floor.
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

function referenceShape(world: World, shapes: BlockShapeTable) {
  return (x: number, y: number, z: number): VoxelShape => {
    if (!world.isSolid(x, y, z)) {
      return VoxelShape.EMPTY;
    }
    return shapes.getCollisionShape(world.getBlock(x, y, z));
  };
}

describe('PlayerPhysics shape adapter equivalence (254 R7)', () => {
  it('matches the two-lookup reference across a mixed-terrain sweep including sub-floor cells', () => {
    const world = makeWorld();
    for (let i = 0; i < 200; i++) world.update(0.016, 0, 0);
    // Carve variety into the generated stone so solidity varies over the sweep.
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) {
        if ((x + z) % 3 === 0) world.setBlock(x, 10, z, BlockId.Air);
        if ((x * z) % 5 === 0) world.setBlock(x, 11, z, BlockId.Water);
        world.setBlock(x, 12, z, (x & 1) === 0 ? BlockId.Dirt : BlockId.Air);
      }
    }

    const registry = createDefaultBlockRegistry();
    const shapes = new BlockShapeTable();
    const physics = new PlayerPhysics(world, registry, {});
    const adapter = (physics as unknown as { shapeWorld: ShapeWorld }).shapeWorld;
    const reference = referenceShape(world, shapes);

    for (let x = -6; x <= 6; x += 2) {
      for (let z = -6; z <= 6; z += 2) {
        for (const y of [-3, -1, 0, 1, 9, 10, 11, 12, 13, 40]) {
          expect(adapter.getCollisionShape(x, y, z)).toBe(reference(x, y, z));
        }
      }
    }
  });

  it('sub-bedrock cells answer the shape table entry of their block id exactly as before', () => {
    const world = makeWorld();
    for (let i = 0; i < 200; i++) world.update(0.016, 0, 0);
    const registry = createDefaultBlockRegistry();
    const shapes = new BlockShapeTable();
    const physics = new PlayerPhysics(world, registry, {});
    const adapter = (physics as unknown as { shapeWorld: ShapeWorld }).shapeWorld;
    // Below the world there are no chunks: id is Air, yet isSolid is true.
    expect(adapter.getCollisionShape(5, -3, 5)).toBe(shapes.getCollisionShape(BlockId.Air));
    expect(adapter.getCollisionShape(5, -3, 5)).not.toBe(VoxelShape.EMPTY);
  });
});
