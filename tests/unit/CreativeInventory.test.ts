import { describe, expect, it } from 'vitest';
import { createDefaultBlockRegistry } from '../../src/world/BlockRegistry';
import { createDefaultItemRegistry } from '../../src/inventory/ItemRegistry';
import { listCreativeItems, searchCreativeItems } from '../../src/simulation/CreativeInventory';

describe('CreativeInventory', () => {
  it('lists only placeable items in registration order', () => {
    const items = createDefaultItemRegistry();
    const blocks = createDefaultBlockRegistry();
    const views = listCreativeItems(items, blocks);
    expect(views.length).toBeGreaterThan(0);
    const all = items.all();
    const expectedOrder = all.filter((d) => d.placeBlock).map((d) => d.id);
    expect(views.map((v) => v.id)).toEqual(expectedOrder);
    for (const view of views) {
      expect(view.stackSize).toBe(items.getByLegacyId(view.id)?.stackSize);
    }
  });

  it('excludes non-placeable items', () => {
    const items = createDefaultItemRegistry();
    const blocks = createDefaultBlockRegistry();
    const views = listCreativeItems(items, blocks);
    const ids = new Set(views.map((v) => v.id));
    for (const def of items.all()) {
      if (!def.placeBlock) expect(ids.has(def.id)).toBe(false);
    }
  });

  it('resolves block ids for placeable rows', () => {
    const items = createDefaultItemRegistry();
    const blocks = createDefaultBlockRegistry();
    const views = listCreativeItems(items, blocks);
    const dirt = views.find((v) => v.key === 'dirt');
    expect(dirt).toBeDefined();
    expect(dirt?.blockId).toBe(blocks.getByResourceId(items.getByLegacyId(dirt!.id)!.placeBlock!).id);
  });

  it('keeps rows with unresolvable block references as null instead of throwing', () => {
    const items = createDefaultItemRegistry();
    const throwingBlocks = {
      getByResourceId: () => {
        throw new Error('unknown block resource id');
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: stub registry for drift probe.
    const views = listCreativeItems(items, throwingBlocks as never);
    expect(views.length).toBeGreaterThan(0);
    for (const view of views) expect(view.blockId).toBeNull();
  });

  it('returns an empty list for an empty item registry', () => {
    const blocks = createDefaultBlockRegistry();
    const empty = { all: () => [] };
    expect(listCreativeItems(empty as never, blocks)).toEqual([]);
  });

  it('blank or whitespace queries return every row in order', () => {
    const views = listCreativeItems(createDefaultItemRegistry(), createDefaultBlockRegistry());
    expect(searchCreativeItems(views, '')).toEqual(views);
    expect(searchCreativeItems(views, '   ')).toEqual(views);
    expect(searchCreativeItems(views, '\t\n ')).toEqual(views);
  });

  it('matches case-insensitively over name and key', () => {
    const views = listCreativeItems(createDefaultItemRegistry(), createDefaultBlockRegistry());
    const byName = searchCreativeItems(views, 'DIRT');
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((v) => v.name.toLowerCase().includes('dirt') || v.key.includes('dirt'))).toBe(true);
    const byKey = searchCreativeItems(views, 'dirt');
    expect(byKey.map((v) => v.id)).toEqual(byName.map((v) => v.id));
  });

  it('trims the query and preserves registry order', () => {
    const views = listCreativeItems(createDefaultItemRegistry(), createDefaultBlockRegistry());
    const spaced = searchCreativeItems(views, '  stone  ');
    const plain = searchCreativeItems(views, 'stone');
    expect(spaced).toEqual(plain);
    const ids = spaced.map((v) => v.id);
    const order = views.map((v) => v.id);
    expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
  });

  it('returns an empty array when nothing matches', () => {
    const views = listCreativeItems(createDefaultItemRegistry(), createDefaultBlockRegistry());
    expect(searchCreativeItems(views, 'zzz-no-such-block-zzz')).toEqual([]);
  });

  it('never mutates the input array', () => {
    const views = listCreativeItems(createDefaultItemRegistry(), createDefaultBlockRegistry());
    const before = [...views];
    searchCreativeItems(views, 'stone');
    expect(views).toEqual(before);
  });
});
