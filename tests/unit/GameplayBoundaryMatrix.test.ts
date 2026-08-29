import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OVERWORLD_DIMENSION_TYPE } from '../../src/data/DimensionTypes';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { BlockShapeTable, VoxelShape } from '../../src/world/VoxelShape';
import { CollisionResolver } from '../../src/world/CollisionResolver';
import { raycastSelection } from '../../src/world/ShapeRaycast';
import { World } from '../../src/world/World';
import { Chunk } from '../../src/world/Chunk';

function makeWorld(): World {
  const registry = createDefaultBlockRegistry();
  const materials = {
    opaque: new THREE.MeshLambertMaterial(),
    transparent: new THREE.MeshLambertMaterial(),
  };
  const generator = {
    generateChunk(chunk: Chunk): void {
      chunk.fill(BlockId.Air);
    },
    getHeightAt(): number {
      return OVERWORLD_DIMENSION_TYPE.minY;
    },
  };
  const mesher = {
    mesh(): { opaque: null; transparent: null } {
      return { opaque: null, transparent: null };
    },
  };
  return new World({
    registry,
    seed: 253,
    scene: new THREE.Scene(),
    mesher: mesher as never,
    generator: generator as never,
    materials,
    renderDistance: 1,
    dimension: OVERWORLD_DIMENSION_TYPE,
  });
}

function shapeWorld(world: World): { getCollisionShape(x: number, y: number, z: number): VoxelShape; getSelectionShape(x: number, y: number, z: number): VoxelShape } {
  const shapes = new BlockShapeTable()
    .set(BlockId.Air, { collision: VoxelShape.EMPTY, selection: VoxelShape.EMPTY })
    .set(BlockId.Stone, { collision: VoxelShape.FULL_CUBE, selection: VoxelShape.FULL_CUBE });
  return {
    getCollisionShape: (x, y, z) => shapes.getCollisionShape(world.getBlock(x, y, z)),
    getSelectionShape: (x, y, z) => shapes.getSelectionShape(world.getBlock(x, y, z)),
  };
}

describe('canonical gameplay boundary matrix (253)', () => {
  it('routes valid vertical and horizontal seam writes through one canonical column', () => {
    const world = makeWorld();
    const cells: Array<[number, number, number, number]> = [
      [15, -64, 0, BlockId.Stone],
      [16, -1, 0, BlockId.Dirt],
      [15, 0, 0, BlockId.Stone],
      [16, 15, 0, BlockId.Dirt],
      [15, 16, 0, BlockId.Stone],
      [16, 63, 0, BlockId.Dirt],
      [15, 64, 0, BlockId.Stone],
      [16, 319, 0, BlockId.Dirt],
    ];
    for (const [x, y, z, id] of cells) world.setBlock(x, y, z, id);

    for (const [x, y, z, id] of cells) {
      expect(world.getBlock(x, y, z), `${x},${y},${z}`).toBe(id);
    }
    expect(world.getBlock(15, -63, 0)).toBe(BlockId.Air);
    expect(world.getBlock(16, 320, 0)).toBe(BlockId.Air);
    expect(world.storage.size).toBe(2);
    expect(world.getStats().allocatedSections).toBe(8);
    world.dispose();
  });

  it('rejects -65 and 320 without allocation or state change', () => {
    const world = makeWorld();
    world.setBlock(0, -65, 0, BlockId.Stone);
    world.setBlock(0, 320, 0, BlockId.Stone);
    expect(world.getBlock(0, -65, 0)).toBe(BlockId.Air);
    expect(world.getBlock(0, 320, 0)).toBe(BlockId.Air);
    expect(world.getStats().residentColumns).toBe(0);
    expect(world.getStats().allocatedSections).toBe(0);
    world.dispose();
  });

  it('preserves a property-bearing state at the negative boundary', () => {
    const world = makeWorld();
    world.setBlockState(0, -1, 0, BlockId.Wheat, { age: 5 });
    expect(world.getBlockState(0, -1, 0).getProperty('age')).toBe('5');
    expect(world.getBlock(0, -1, 0)).toBe(BlockId.Wheat);
    world.dispose();
  });

  it('uses canonical blocks for collision at both vertical world bounds', () => {
    const world = makeWorld();
    world.setBlock(0, -64, 0, BlockId.Stone);
    world.setBlock(0, 319, 0, BlockId.Stone);
    const shapes = shapeWorld(world);
    const resolver = new CollisionResolver();

    const below = resolver.move(
      shapes,
      { x: 0.25, y: -62, z: 0.25, width: 0.5, height: 1, depth: 0.5 },
      0,
      -10,
      0,
    );
    expect(below.collidedY).toBe(true);
    expect(below.y).toBeCloseTo(-63, 6);

    const above = resolver.move(
      shapes,
      { x: 0.25, y: 317, z: 0.25, width: 0.5, height: 1, depth: 0.5 },
      0,
      10,
      0,
    );
    expect(above.collidedY).toBe(true);
    expect(above.y).toBeCloseTo(318, 6);
    world.dispose();
  });

  it('selects canonical blocks at -64, 319, and across the 15/16 horizontal seam', () => {
    const world = makeWorld();
    world.setBlock(2, -64, 0, BlockId.Stone);
    world.setBlock(2, 319, 0, BlockId.Stone);
    world.setBlock(15, 0, 0, BlockId.Stone);
    world.setBlock(16, 0, 0, BlockId.Stone);
    const shapes = shapeWorld(world);

    const lower = raycastSelection(shapes, 2.5, -62, 0.5, 0, -1, 0, 10);
    expect(lower?.blockX).toBe(2);
    expect(lower?.blockY).toBe(-64);

    const upper = raycastSelection(shapes, 2.5, 321, 0.5, 0, -1, 0, 10);
    expect(upper?.blockX).toBe(2);
    expect(upper?.blockY).toBe(319);

    const seam = raycastSelection(shapes, 14, 0.5, 0.5, 1, 0, 0, 10);
    expect(seam?.blockX).toBe(15);
    world.dispose();
  });
});
