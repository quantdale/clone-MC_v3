import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  contentById,
  contentsOfKind,
  createContentDefinition,
  createContentExpansion,
} from '../../src/data/ContentExpansion';

describe('creation', () => {
  it('applies explicit fields and documented defaults', () => {
    const block = createContentDefinition({
      id: 'minecraft:obsidian_alt',
      kind: 'block',
      name: 'block.obsidian_alt',
      stackSize: 64,
      hardness: 50,
      tags: ['pickaxe'],
    });
    expect(block).toMatchObject({
      kind: 'block',
      name: 'block.obsidian_alt',
      stackSize: 64,
      hardness: 50,
      tags: ['pickaxe'],
    });

    const item = createContentDefinition({
      id: createResourceId('minecraft', 'emerald_alt'),
      kind: 'item',
      name: 'item.emerald_alt',
    });
    expect(item.stackSize).toBe(64);
    expect(item.hardness).toBe(0);
    expect(item.tags).toEqual([]);
  });
});

describe('rejections', () => {
  const base = { id: 'minecraft:stone_alt', kind: 'block' as const, name: 'block.stone_alt' };

  it('rejects invalid ids and prefixed paths', () => {
    expect(() => createContentDefinition({ ...base, id: 'Bad Id' })).toThrow(
      'Content: id must be a valid namespaced id',
    );
    expect(() => createContentDefinition({ ...base, id: 'minecraft:block/stone' })).toThrow(
      "Content: id path must not start with 'block/' or 'item/'",
    );
    expect(() => createContentDefinition({ ...base, id: 'minecraft:item/sword' })).toThrow(
      "Content: id path must not start with 'block/' or 'item/'",
    );
  });

  it('rejects empty names', () => {
    expect(() => createContentDefinition({ ...base, name: '' })).toThrow(
      'Content: name must be a non-empty string',
    );
  });

  it('rejects bad stack sizes and hardnesses', () => {
    for (const stackSize of [0, 65, 1.5]) {
      expect(() => createContentDefinition({ ...base, stackSize })).toThrow(
        'Content: stackSize must be an integer in [1, 64]',
      );
    }
    for (const hardness of [-1, NaN]) {
      expect(() => createContentDefinition({ ...base, hardness })).toThrow(
        'Content: hardness must be a finite number >= 0',
      );
    }
  });

  it('rejects malformed tags', () => {
    expect(() => createContentDefinition({ ...base, tags: [''] })).toThrow(
      'Content: tags must be non-empty strings',
    );
    expect(() => createContentDefinition({ ...base, tags: [5 as unknown as string] })).toThrow(
      'Content: tags must be non-empty strings',
    );
  });
});

describe('expansion', () => {
  const a = createContentDefinition({ id: 'minecraft:a', kind: 'block', name: 'block.a' });
  const b = createContentDefinition({ id: 'minecraft:b', kind: 'item', name: 'item.b' });
  const c = createContentDefinition({ id: 'minecraft:c', kind: 'block', name: 'block.c' });

  it('groups by kind preserving registration order', () => {
    const expansion = createContentExpansion([a, b, c]);
    expect(expansion.blocks).toEqual([a, c]);
    expect(expansion.items).toEqual([b]);
    expect(contentsOfKind(expansion, 'block')).toEqual([a, c]);
    expect(contentsOfKind(expansion, 'item')).toEqual([b]);
  });

  it('looks up by string and ResourceId, undefined when missing', () => {
    const expansion = createContentExpansion([a, b]);
    expect(contentById(expansion, 'minecraft:b')).toEqual(b);
    expect(contentById(expansion, createResourceId('minecraft', 'a'))).toEqual(a);
    expect(contentById(expansion, 'minecraft:nope')).toBeUndefined();
  });

  it('rejects duplicates and supports empty expansions', () => {
    expect(() => createContentExpansion([a, a])).toThrow(
      'Content: duplicate content id minecraft:a',
    );
    const empty = createContentExpansion([]);
    expect(empty.blocks).toEqual([]);
    expect(empty.items).toEqual([]);
    expect(contentById(empty, 'minecraft:a')).toBeUndefined();
  });
});
