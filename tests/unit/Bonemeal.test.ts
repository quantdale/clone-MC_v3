import { describe, it, expect } from 'vitest';
import {
  WHEAT_GROW_STEP,
  bonemealNextAge,
  fertilizeWheat,
  applyBonemeal,
  bonemealTarget,
  FertilizerRegistry,
  createDefaultFertilizerRegistry,
} from '../../src/simulation/Bonemeal';
import { BlockId } from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
} from '../../src/inventory/ItemRegistry';
import { createResourceId, resourceIdToString } from '../../src/data/ResourceId';
import type { BlockState } from '../../src/world/BlockStateRegistry';
import type { BlockWorldAccess } from '../../src/simulation/BlockBehavior';

/** A fake BlockWorldAccess holding block ids and wheat ages, recording state writes. */
class FakeWorld implements BlockWorldAccess {
  readonly ids = new Map<string, number>();
  readonly ages = new Map<string, number>();
  readonly stateWrites: Array<[number, number, number, number, number]> = [];
  /** When set, getBlockState throws (malformed-read simulation). */
  throwOnRead = false;

  key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    this.ids.set(this.key(x, y, z), id);
  }

  setWheat(x: number, y: number, z: number, age = 0): void {
    this.setBlock(x, y, z, BlockId.Wheat);
    this.ages.set(this.key(x, y, z), age);
  }

  getBlockId(x: number, y: number, z: number): number {
    return this.ids.get(this.key(x, y, z)) ?? BlockId.Air;
  }

  setBlockId(x: number, y: number, z: number, id: number): void {
    this.setBlock(x, y, z, id);
  }

  getBlockState(x: number, y: number, z: number): BlockState {
    if (this.throwOnRead) {
      throw new Error('boom');
    }
    const key = this.key(x, y, z);
    const age = this.ages.get(key);
    return {
      getProperty(name: string): string | undefined {
        return name === 'age' ? (age === undefined ? undefined : String(age)) : undefined;
      },
      assignments: [] as ReadonlyArray<readonly [string, string]>,
    } as unknown as BlockState;
  }

  setBlockState(
    x: number,
    y: number,
    z: number,
    blockId: number,
    properties: Record<string, boolean | number | string>,
  ): void {
    this.setBlock(x, y, z, blockId);
    const key = this.key(x, y, z);
    if (blockId === BlockId.Wheat && properties.age !== undefined) {
      this.ages.set(key, Number(properties.age));
    }
    this.stateWrites.push([x, y, z, blockId, Number(properties.age)]);
  }
}

describe('bone meal item definition (127)', () => {
  const registry = createDefaultItemRegistry();

  it('registers bone meal at id 34 with a 64-stack, non-placeable definition', () => {
    const def = registry.get(ItemId.BoneMeal);
    expect(def.id).toBe(34);
    expect(def.key).toBe('bone_meal');
    expect(resourceIdToString(def.resourceId)).toBe('minecraft:bone_meal');
    expect(def.name).toBe('Bone Meal');
    expect(def.stackSize).toBe(64);
  });

  it('resolves bone meal by id, key, and resource id to the same definition', () => {
    const byId = registry.getByLegacyId(ItemId.BoneMeal);
    const byKey = registry.getByKey('bone_meal');
    const byRid = registry.getByResourceId(createResourceId('minecraft', 'bone_meal'));
    expect(byId).toBeDefined();
    expect(byKey).toBe(byId);
    expect(byRid).toBe(byId);
    expect(registry.has(ItemId.BoneMeal)).toBe(true);
  });

  it('carries no placeable/food/tool/enchantment metadata', () => {
    const def = registry.get(ItemId.BoneMeal);
    expect(def.placeBlock).toBeUndefined();
    expect(def.isFood ?? false).toBe(false);
    expect(def.toolKind).toBeUndefined();
    expect(def.maxDurability).toBeUndefined();
    expect(def.foodHunger).toBeUndefined();
    expect(def.foodSaturation).toBeUndefined();
    expect(def.enchantability).toBeUndefined();
  });
});

describe('bonemealNextAge', () => {
  it('advances by WHEAT_GROW_STEP and clamps at MAX_AGE', () => {
    expect(WHEAT_GROW_STEP).toBe(2);
    expect(bonemealNextAge(0)).toBe(2);
    expect(bonemealNextAge(1)).toBe(3);
    expect(bonemealNextAge(5)).toBe(7);
    expect(bonemealNextAge(6)).toBe(7);
    expect(bonemealNextAge(7)).toBe(7);
  });

  it('normalizes invalid inputs to 0', () => {
    expect(bonemealNextAge(-3)).toBe(0);
    expect(bonemealNextAge(2.5)).toBe(0);
  });
});

describe('fertilizeWheat', () => {
  it('advances a growing wheat crop by WHEAT_GROW_STEP', () => {
    const world = new FakeWorld();
    world.setWheat(5, 6, 7, 1);
    expect(fertilizeWheat(world, 5, 6, 7)).toBe(true);
    expect(world.ages.get('5,6,7')).toBe(3);
    expect(world.stateWrites).toEqual([[5, 6, 7, BlockId.Wheat, 3]]);
  });

  it('is a no-op on mature wheat', () => {
    const world = new FakeWorld();
    world.setWheat(5, 6, 7, 7);
    expect(fertilizeWheat(world, 5, 6, 7)).toBe(false);
    expect(world.ages.get('5,6,7')).toBe(7);
    expect(world.stateWrites).toEqual([]);
  });

  it('is a no-op on a non-wheat block', () => {
    const world = new FakeWorld();
    world.setBlock(5, 6, 7, BlockId.Stone);
    expect(fertilizeWheat(world, 5, 6, 7)).toBe(false);
    expect(world.stateWrites).toEqual([]);
  });

  it('is a no-op without state capability and does not throw', () => {
    const minimal: BlockWorldAccess = {
      getBlockId: () => BlockId.Wheat,
      setBlockId: () => undefined,
    };
    expect(fertilizeWheat(minimal, 5, 6, 7)).toBe(false);
  });

  it('is a safe no-op when the state read throws', () => {
    const world = new FakeWorld();
    world.setWheat(5, 6, 7, 2);
    world.throwOnRead = true;
    expect(fertilizeWheat(world, 5, 6, 7)).toBe(false);
    expect(world.stateWrites).toEqual([]);
  });
});

describe('applyBonemeal', () => {
  it('grows fertilizable wheat and returns true', () => {
    const world = new FakeWorld();
    world.setWheat(5, 6, 7, 1);
    expect(applyBonemeal(world, 5, 6, 7)).toBe(true);
    expect(world.ages.get('5,6,7')).toBe(3);
  });

  it('is a no-op on air and unfertilizable blocks', () => {
    const world = new FakeWorld();
    world.setBlock(1, 1, 1, BlockId.Air);
    world.setBlock(2, 1, 1, BlockId.Stone);
    expect(applyBonemeal(world, 1, 1, 1)).toBe(false);
    expect(applyBonemeal(world, 2, 1, 1)).toBe(false);
    expect(world.stateWrites).toEqual([]);
  });

  it('matures a fresh crop in exactly ceil(7/2) uses, then no-ops', () => {
    const world = new FakeWorld();
    world.setWheat(0, 0, 0, 0);
    const seen: number[] = [];
    let uses = 0;
    while (applyBonemeal(world, 0, 0, 0)) {
      seen.push(world.ages.get('0,0,0')!);
      uses++;
    }
    expect(seen).toEqual([2, 4, 6, 7]);
    expect(uses).toBe(4);
    // Deterministic: further uses change nothing.
    expect(applyBonemeal(world, 0, 0, 0)).toBe(false);
  });

  it('honors a caller-supplied registry', () => {
    const world = new FakeWorld();
    world.setBlock(5, 6, 7, BlockId.Air);
    const reg = new FertilizerRegistry();
    // A no-op registered function for air id 0.
    reg.register(BlockId.Air, () => false);
    expect(applyBonemeal(world, 5, 6, 7, reg)).toBe(false);
  });
});

describe('bonemealTarget (apply + consume)', () => {
  it('consumes exactly once when growth is applied', () => {
    const world = new FakeWorld();
    world.setWheat(3, 4, 5, 3);
    let consumed = 0;
    const result = bonemealTarget(world, 3, 4, 5, () => consumed++);
    expect(result).toBe(true);
    expect(world.ages.get('3,4,5')).toBe(5);
    expect(consumed).toBe(1);
  });

  it('consumes nothing on a no-op target', () => {
    const world = new FakeWorld();
    world.setWheat(3, 4, 5, 7); // mature
    let consumed = 0;
    const result = bonemealTarget(world, 3, 4, 5, () => consumed++);
    expect(result).toBe(false);
    expect(consumed).toBe(0);
  });

  it('consumes nothing on air', () => {
    const world = new FakeWorld();
    let consumed = 0;
    expect(bonemealTarget(world, 9, 9, 9, () => consumed++)).toBe(false);
    expect(consumed).toBe(0);
  });
});

describe('FertilizerRegistry', () => {
  it('rejects invalid registrations', () => {
    const reg = new FertilizerRegistry();
    expect(() => reg.register(-1, () => true)).toThrow();
    expect(() => reg.register(1.5, () => true)).toThrow();
    expect(() => reg.register(BlockId.Wheat, 'nope' as never)).toThrow();
  });

  it('rejects duplicate registrations', () => {
    const reg = new FertilizerRegistry();
    reg.register(BlockId.Wheat, () => false);
    expect(() => reg.register(BlockId.Wheat, () => false)).toThrow();
  });

  it('resolves unregistered ids to undefined', () => {
    const reg = new FertilizerRegistry();
    reg.register(BlockId.Wheat, () => false);
    expect(reg.get(BlockId.Farmland)).toBeUndefined();
    expect(reg.has(BlockId.Farmland)).toBe(false);
    expect(reg.has(BlockId.Wheat)).toBe(true);
    expect(reg.size).toBe(1);
  });

  it('composes the default registry with exactly the wheat fertilizer', () => {
    const reg = createDefaultFertilizerRegistry();
    expect(reg.size).toBe(1);
    expect(reg.has(BlockId.Wheat)).toBe(true);
    expect(reg.get(BlockId.Wheat)).toBe(fertilizeWheat);
  });
});
