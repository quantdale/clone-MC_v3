import { describe, it, expect } from 'vitest';
import {
  classifyNode,
  nodeCost,
  isPassable,
  canStandAt,
  movementCost,
  PathNodeType,
  type NavigationWorld,
} from '../../src/simulation/NavigationGridQuery';
import { BlockId } from '../../src/world/BlockRegistry';
import { VoxelShape } from '../../src/world/VoxelShape';

/** A fake NavigationWorld backed by maps; Stone is solid by default, everything else is not,
 *  unless explicitly overridden via setSolid. */
class FakeNavWorld implements NavigationWorld {
  private readonly blocks = new Map<string, number>();
  private readonly solidOverride = new Map<string, boolean>();

  private static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    this.blocks.set(FakeNavWorld.key(x, y, z), id);
  }

  setSolid(x: number, y: number, z: number, solid: boolean): void {
    this.solidOverride.set(FakeNavWorld.key(x, y, z), solid);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.blocks.get(FakeNavWorld.key(x, y, z)) ?? BlockId.Air;
  }

  getCollisionShape(x: number, y: number, z: number): VoxelShape {
    const key = FakeNavWorld.key(x, y, z);
    if (this.solidOverride.has(key)) {
      return this.solidOverride.get(key) ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
    }
    return this.getBlockId(x, y, z) === BlockId.Stone ? VoxelShape.FULL_CUBE : VoxelShape.EMPTY;
  }
}

describe('classifyNode', () => {
  it('classifies stone, lava, fire, water, and air correctly', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 0, 0, BlockId.Stone);
    world.setBlock(1, 0, 0, BlockId.Lava);
    world.setBlock(2, 0, 0, BlockId.Fire);
    world.setBlock(3, 0, 0, BlockId.Water);
    world.setBlock(4, 0, 0, BlockId.Air);

    expect(classifyNode(world, 0, 0, 0)).toBe(PathNodeType.Blocked);
    expect(classifyNode(world, 1, 0, 0)).toBe(PathNodeType.Lava);
    expect(classifyNode(world, 2, 0, 0)).toBe(PathNodeType.DamageFire);
    expect(classifyNode(world, 3, 0, 0)).toBe(PathNodeType.Water);
    expect(classifyNode(world, 4, 0, 0)).toBe(PathNodeType.Open);
  });

  it('treats a non-empty collision shape as Blocked even when the block id is Water', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 0, 0, BlockId.Water);
    world.setSolid(0, 0, 0, true);
    expect(classifyNode(world, 0, 0, 0)).toBe(PathNodeType.Blocked);
  });
});

describe('nodeCost / isPassable', () => {
  it('the cost ordering holds: Open < Water < DamageFire < Blocked === Lava === Infinity', () => {
    expect(nodeCost(PathNodeType.Open)).toBeLessThan(nodeCost(PathNodeType.Water));
    expect(nodeCost(PathNodeType.Water)).toBeLessThan(nodeCost(PathNodeType.DamageFire));
    expect(nodeCost(PathNodeType.DamageFire)).toBeLessThan(nodeCost(PathNodeType.Blocked));
    expect(nodeCost(PathNodeType.Blocked)).toBe(Infinity);
    expect(nodeCost(PathNodeType.Lava)).toBe(Infinity);
  });

  it('isPassable partitions the five types correctly', () => {
    expect(isPassable(PathNodeType.Open)).toBe(true);
    expect(isPassable(PathNodeType.Water)).toBe(true);
    expect(isPassable(PathNodeType.DamageFire)).toBe(true);
    expect(isPassable(PathNodeType.Blocked)).toBe(false);
    expect(isPassable(PathNodeType.Lava)).toBe(false);
  });
});

describe('canStandAt', () => {
  it('succeeds on solid ground with clear headroom', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Stone);
    world.setBlock(0, 5, 0, BlockId.Air);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(canStandAt(world, 0, 5, 0, 2)).toBe(true);
  });

  it('fails when the occupied body height is obstructed', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Stone);
    world.setBlock(0, 5, 0, BlockId.Air);
    world.setBlock(0, 6, 0, BlockId.Stone);
    expect(canStandAt(world, 0, 5, 0, 2)).toBe(false);
  });

  it('fails when there is no ground and the feet cell is not water', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Air);
    world.setBlock(0, 5, 0, BlockId.Air);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(canStandAt(world, 0, 5, 0, 2)).toBe(false);
  });

  it('succeeds while floating in water with no solid ground below', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Air);
    world.setBlock(0, 5, 0, BlockId.Water);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(canStandAt(world, 0, 5, 0, 2)).toBe(true);
  });

  it('fails on a lava feet cell even with ground below', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Stone);
    world.setBlock(0, 5, 0, BlockId.Lava);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(canStandAt(world, 0, 5, 0, 2)).toBe(false);
  });
});

describe('movementCost', () => {
  it('equals nodeCost(Open) for an occupiable open cell', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Stone);
    world.setBlock(0, 5, 0, BlockId.Air);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(movementCost(world, 0, 5, 0, 2)).toBe(nodeCost(PathNodeType.Open));
  });

  it('equals nodeCost(Water) for an occupiable water cell', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Air);
    world.setBlock(0, 5, 0, BlockId.Water);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(movementCost(world, 0, 5, 0, 2)).toBe(nodeCost(PathNodeType.Water));
  });

  it('is Infinity for an unoccupiable (obstructed) cell', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Stone);
    world.setBlock(0, 5, 0, BlockId.Air);
    world.setBlock(0, 6, 0, BlockId.Stone);
    expect(movementCost(world, 0, 5, 0, 2)).toBe(Infinity);
  });

  it('is Infinity when there is no ground and no water', () => {
    const world = new FakeNavWorld();
    world.setBlock(0, 4, 0, BlockId.Air);
    world.setBlock(0, 5, 0, BlockId.Air);
    world.setBlock(0, 6, 0, BlockId.Air);
    expect(movementCost(world, 0, 5, 0, 2)).toBe(Infinity);
  });
});
