import { describe, it, expect } from 'vitest';
import {
  LootTableRegistry,
  buildCurrentLootTables,
  evaluate,
  lootTableResourceId,
  type LootContext,
  type RandomSource,
} from '../../src/inventory/LootTable';
import { ItemId, createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createResourceId } from '../../src/data/ResourceId';

const items = createDefaultItemRegistry();
const blocks = createDefaultBlockRegistry();
const reg = new LootTableRegistry(buildCurrentLootTables(blocks, items), items);

function ctx(overrides: Partial<LootContext> = {}): LootContext {
  return {
    blockId: BlockId.Wheat,
    toolItemId: undefined,
    itemRegistry: items,
    ...overrides,
  };
}

function seq(values: number[]): RandomSource {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('wheat crop loot (125)', () => {
  it('registers the wheat loot table and wires it to the wheat block', () => {
    const table = reg.get(lootTableResourceId('wheat'));
    expect(table).toBeDefined();
    expect(blocks.get(BlockId.Wheat).lootTable).toEqual(createResourceId('minecraft', 'loot/wheat'));
  });

  it('immature wheat drops only seeds', () => {
    const out = evaluate(
      reg.get(lootTableResourceId('wheat')),
      ctx({ properties: { age: '3' } }),
      seq([]),
      items,
    );
    expect(out).toEqual([{ item: ItemId.WheatSeeds, count: 1 }]);
  });

  it('mature wheat drops wheat and seeds', () => {
    const out = evaluate(
      reg.get(lootTableResourceId('wheat')),
      ctx({ properties: { age: '7' } }),
      seq([]),
      items,
    );
    expect(out).toEqual([
      { item: ItemId.WheatSeeds, count: 1 },
      { item: ItemId.Wheat, count: 1 },
    ]);
  });

  it('absent age behaves like immature (seeds only)', () => {
    const out = evaluate(reg.get(lootTableResourceId('wheat')), ctx(), seq([]), items);
    expect(out).toEqual([{ item: ItemId.WheatSeeds, count: 1 }]);
  });
});
