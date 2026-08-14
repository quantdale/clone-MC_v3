import { describe, expect, it } from 'vitest';
import {
  LootTableRegistry,
  buildCurrentLootTables,
  evaluate,
  lootTableResourceId,
  LootTableError,
  MAX_ROLLS,
  MAX_TABLE_OUTPUT,
  type LootTable,
  type LootContext,
  type RandomSource,
} from '../../src/inventory/LootTable';
import { ItemId, createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { BlockId, createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createResourceId } from '../../src/data/ResourceId';

const items = createDefaultItemRegistry();

function rid(path: string) {
  return createResourceId('minecraft', path);
}

function registryOf(tables: LootTable[]): LootTableRegistry {
  return new LootTableRegistry(tables, items);
}

function ctx(overrides: Partial<LootContext> = {}): LootContext {
  return {
    blockId: BlockId.Stone,
    toolItemId: undefined,
    itemRegistry: items,
    ...overrides,
  };
}

function seq(values: number[]): RandomSource {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('loot table registry validation', () => {
  it('registers unique tables and rejects a duplicate id', () => {
    const table: LootTable = {
      id: rid('loot/test'),
      pools: [{ rolls: 1, entries: [{ item: rid('stone'), weight: 1, min: 1, max: 1 }] }],
    };
    const reg = registryOf([table, { ...table, id: rid('loot/test2') }]);
    expect(reg.size).toBe(2);
    expect(reg.has(table.id)).toBe(true);
    expect(() => registryOf([table, { ...table }])).toThrow(LootTableError);
    expect(() => registryOf([table, { ...table }])).toThrow(/DUPLICATE_ID/);
  });

  it('rejects a missing item reference before evaluation', () => {
    const table: LootTable = {
      id: rid('loot/missing'),
      pools: [{ rolls: 1, entries: [{ item: rid('does_not_exist'), weight: 1, min: 1, max: 1 }] }],
    };
    expect(() => registryOf([table])).toThrow(LootTableError);
    expect(() => registryOf([table])).toThrow(/MISSING_ITEM/);
  });

  it('rejects invalid weights', () => {
    const bad = (weight: number): LootTable => ({
      id: rid('loot/w'),
      pools: [{ rolls: 1, entries: [{ item: rid('stone'), weight, min: 1, max: 1 }] }],
    });
    expect(() => registryOf([bad(0)])).toThrow(/INVALID_WEIGHT/);
    expect(() => registryOf([bad(-2)])).toThrow(/INVALID_WEIGHT/);
  });

  it('rejects invalid roll counts', () => {
    const bad = (rolls: number): LootTable => ({
      id: rid('loot/r'),
      pools: [{ rolls, entries: [{ item: rid('stone'), weight: 1, min: 1, max: 1 }] }],
    });
    expect(() => registryOf([bad(0)])).toThrow(/INVALID_ROLLS/);
    expect(() => registryOf([bad(1.5)])).toThrow(/INVALID_ROLLS/);
    expect(() => registryOf([bad(MAX_ROLLS + 1)])).toThrow(/INVALID_ROLLS/);
  });

  it('rejects invalid quantity ranges', () => {
    const bad = (min: number, max: number): LootTable => ({
      id: rid('loot/q'),
      pools: [{ rolls: 1, entries: [{ item: rid('stone'), weight: 1, min, max }] }],
    });
    expect(() => registryOf([bad(0, 1)])).toThrow(/INVALID_RANGE/);
    expect(() => registryOf([bad(3, 2)])).toThrow(/INVALID_RANGE/);
  });

  it('rejects output exceeding item stack size or the safety bound', () => {
    const overStack: LootTable = {
      id: rid('loot/over_stack'),
      pools: [{ rolls: 1, entries: [{ item: rid('stone'), weight: 1, min: 1, max: 65 }] }],
    };
    expect(() => registryOf([overStack])).toThrow(/INVALID_OUTPUT/);

    const overBound: LootTable = {
      id: rid('loot/over_bound'),
      pools: Array.from({ length: MAX_TABLE_OUTPUT }, () => ({
        rolls: 1,
        entries: [{ item: rid('stone'), weight: 1, min: 1, max: 2 }],
      })),
    };
    expect(() => registryOf([overBound])).toThrow(/INVALID_OUTPUT/);
  });
});

describe('loot table evaluation', () => {
  it('emits a single fixed stack for a fixed entry', () => {
    const table: LootTable = {
      id: rid('loot/fixed'),
      pools: [{ rolls: 1, entries: [{ item: rid('stone'), weight: 1, min: 1, max: 1 }] }],
    };
    const out = evaluate(table, ctx(), seq([]), items);
    expect(out).toEqual([{ item: ItemId.Stone, count: 1 }]);
  });

  it('emits multiple pools in deterministic order', () => {
    const table: LootTable = {
      id: rid('loot/multi'),
      pools: [
        { rolls: 1, entries: [{ item: rid('stone'), weight: 1, min: 1, max: 1 }] },
        { rolls: 1, entries: [{ item: rid('dirt'), weight: 1, min: 1, max: 1 }] },
      ],
    };
    const out = evaluate(table, ctx(), seq([]), items);
    expect(out.map((s) => s.item)).toEqual([ItemId.Stone, ItemId.Dirt]);
  });

  it('chooses weighted entries deterministically with a fake random source', () => {
    const table: LootTable = {
      id: rid('loot/weighted'),
      pools: [
        {
          rolls: 1,
          entries: [
            { item: rid('stone'), weight: 1, min: 1, max: 1 },
            { item: rid('dirt'), weight: 3, min: 1, max: 1 },
          ],
        },
      ],
    };
    // total weight = 4; roll in [0,1) -> first, [1,4) -> second.
    expect(evaluate(table, ctx(), seq([0.1]), items).map((s) => s.item)).toEqual([ItemId.Stone]);
    expect(evaluate(table, ctx(), seq([0.375]), items).map((s) => s.item)).toEqual([ItemId.Dirt]);
  });

  it('samples inclusive quantity endpoints from a range', () => {
    const table: LootTable = {
      id: rid('loot/range'),
      pools: [{ rolls: 1, entries: [{ item: rid('stone'), weight: 1, min: 2, max: 3 }] }],
    };
    expect(evaluate(table, ctx(), seq([0]), items)[0]!.count).toBe(2);
    expect(evaluate(table, ctx(), seq([0.999]), items)[0]!.count).toBe(3);
  });

  it('suppresses a pool when its condition is false', () => {
    const table: LootTable = {
      id: rid('loot/pool_cond'),
      pools: [
        {
          rolls: 1,
          conditions: [() => false],
          entries: [{ item: rid('stone'), weight: 1, min: 1, max: 1 }],
        },
      ],
    };
    expect(evaluate(table, ctx(), seq([]), items)).toEqual([]);
  });

  it('suppresses an entry when its condition is false and yields nothing if none eligible', () => {
    const table: LootTable = {
      id: rid('loot/entry_cond'),
      pools: [
        {
          rolls: 1,
          entries: [
            { item: rid('stone'), weight: 1, min: 1, max: 1, conditions: [() => false] },
            { item: rid('dirt'), weight: 1, min: 1, max: 1, conditions: [() => false] },
          ],
        },
      ],
    };
    expect(evaluate(table, ctx(), seq([]), items)).toEqual([]);
  });

  it('emits an entry whose condition passes', () => {
    const table: LootTable = {
      id: rid('loot/entry_pass'),
      pools: [
        {
          rolls: 1,
          entries: [
            { item: rid('stone'), weight: 1, min: 1, max: 1, conditions: [() => true] },
            { item: rid('dirt'), weight: 1, min: 1, max: 1, conditions: [() => false] },
          ],
        },
      ],
    };
    expect(evaluate(table, ctx(), seq([]), items).map((s) => s.item)).toEqual([ItemId.Stone]);
  });

  it('is pure: repeated evaluation returns the same outputs and never mutates input', () => {
    const table: LootTable = {
      id: rid('loot/pure'),
      pools: [{ rolls: 2, entries: [{ item: rid('stone'), weight: 1, min: 1, max: 1 }] }],
    };
    const snapshot = ctx();
    const first = evaluate(table, snapshot, seq([]), items);
    const second = evaluate(table, snapshot, seq([]), items);
    expect(second).toEqual(first);
    expect(first).toEqual([
      { item: ItemId.Stone, count: 1 },
      { item: ItemId.Stone, count: 1 },
    ]);
  });
});

describe('current block-output equivalence', () => {
  const blocks = createDefaultBlockRegistry();
  const reg = new LootTableRegistry(buildCurrentLootTables(blocks, items), items);

  it('builds one table per breakable block', () => {
    const breakable = blocks.all().filter((b) => b.breakable && b.dropItem !== undefined);
    expect(reg.size).toBe(breakable.length);
  });

  it('reproduces stone drop (one stone)', () => {
    const out = evaluate(reg.get(lootTableResourceId('stone')), ctx(), seq([]), items);
    expect(out).toEqual([{ item: ItemId.Stone, count: 1 }]);
  });

  it('reproduces coal ore drop (one coal)', () => {
    const out = evaluate(reg.get(lootTableResourceId('coal_ore')), ctx(), seq([]), items);
    expect(out).toEqual([{ item: ItemId.Coal, count: 1 }]);
  });

  it('reproduces leaves drop (leaves + apple)', () => {
    const out = evaluate(
      reg.get(lootTableResourceId('leaves')),
      ctx({ blockId: BlockId.Leaves }),
      seq([]),
      items,
    );
    expect(out.map((s) => s.item)).toEqual([ItemId.Leaves, ItemId.Apple]);
  });

  it('reproduces every breakable block as a single fixed drop (no extras except leaves)', () => {
    for (const def of blocks.all()) {
      if (!def.breakable || def.dropItem === undefined) continue;
      const table = reg.get(lootTableResourceId(def.key));
      const out = evaluate(table, ctx({ blockId: def.id }), seq([]), items);
      if (def.key === 'leaves') {
        expect(out).toEqual([
          { item: ItemId.Leaves, count: 1 },
          { item: ItemId.Apple, count: 1 },
        ]);
      } else {
        const expectedItem = items.getByResourceId(def.dropItem).id;
        expect(out).toEqual([{ item: expectedItem, count: 1 }]);
      }
    }
  });
});
