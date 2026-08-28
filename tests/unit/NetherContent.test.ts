import { describe, it, expect } from 'vitest';
import {
  BlockId,
  NETHER_WART_SCHEMA,
  createDefaultBlockRegistry,
} from '../../src/world/BlockRegistry';
import {
  ItemId,
  createDefaultItemRegistry,
  validateItemBlockCrossReferences,
} from '../../src/inventory/ItemRegistry';
import { createDefaultBlockStateRegistry } from '../../src/world/BlockStateRegistry';
import { resourceIdToString } from '../../src/data/ResourceId';
import { generateNetherColumn } from '../../src/worldgen/NetherTerrain';

describe('nether content registration', () => {
  const blockRegistry = createDefaultBlockRegistry();
  const itemRegistry = createDefaultItemRegistry();
  const stateRegistry = createDefaultBlockStateRegistry();

  it('registers netherrack, obsidian, soul sand, and nether wart with their keys', () => {
    const cases: Array<[BlockId, string, ItemId]> = [
      [BlockId.Netherrack, 'netherrack', ItemId.Netherrack],
      [BlockId.Obsidian, 'obsidian', ItemId.Obsidian],
      [BlockId.SoulSand, 'soul_sand', ItemId.SoulSand],
      [BlockId.NetherWart, 'nether_wart', ItemId.NetherWart],
    ];
    for (const [blockId, key, itemId] of cases) {
      expect(blockRegistry.get(blockId).key).toBe(key);
      expect(itemRegistry.get(itemId).key).toBe(key);
      expect(resourceIdToString(itemRegistry.get(itemId).placeBlock!)).toBe(`minecraft:${key}`);
    }
  });

  it('obsidian is a hard pickaxe-only block', () => {
    const obsidian = blockRegistry.get(BlockId.Obsidian);
    expect(obsidian.hardness).toBe(50);
    expect(obsidian.miningLevel).toBe(3);
  });

  it('netherrack, obsidian, and soul sand are stateless single-state blocks', () => {
    for (const id of [BlockId.Netherrack, BlockId.Obsidian, BlockId.SoulSand]) {
      expect(blockRegistry.getPropertySchema(id).isEmpty).toBe(true);
      expect(stateRegistry.statesForBlock(id).length).toBe(1);
    }
  });

  it('nether wart enumerates exactly 4 states (age 0..3) with default age 0', () => {
    const def = blockRegistry.get(BlockId.NetherWart);
    expect(blockRegistry.getPropertySchema(BlockId.NetherWart)).toBe(NETHER_WART_SCHEMA);
    expect(def.defaultState).toEqual({ age: 0 });
    const states = stateRegistry.statesForBlock(BlockId.NetherWart);
    expect(states.length).toBe(4);
    expect(states.map((s) => s.getProperty('age'))).toEqual(['0', '1', '2', '3']);
  });

  it('all four items place their blocks and cross-references pass', () => {
    expect(() => validateItemBlockCrossReferences(blockRegistry, itemRegistry)).not.toThrow();
  });
});

describe('nether terrain handoff (176 -> 179)', () => {
  it('default nether terrain now writes the registered netherrack block id', () => {
    const column = generateNetherColumn(42, 0, 0);
    // The terrain band is netherrack; at least one cell must carry BlockId.Netherrack (56).
    let netherrackCells = 0;
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        for (let y = 32; y < 127; y++) {
          if (column.getBlock(x, y, z) === BlockId.Netherrack) netherrackCells++;
        }
      }
    }
    expect(netherrackCells).toBeGreaterThan(0);
  });
});
