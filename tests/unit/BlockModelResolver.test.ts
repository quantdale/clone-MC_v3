import { describe, it, expect } from 'vitest';
import { BlockModelResolver } from '../../src/data/BlockModelResolver';

describe('BlockModelResolver', () => {
  it('resolves the default when no variant matches', () => {
    const resolver = new BlockModelResolver();
    resolver.setDefault('minecraft:dirt', 'minecraft:block/dirt');

    expect(resolver.resolve('minecraft:dirt', {})).toBe('minecraft:block/dirt');
    expect(resolver.resolve('minecraft:dirt', { weird: 'x' })).toBe('minecraft:block/dirt');
  });

  it('variant override wins over the default', () => {
    const resolver = new BlockModelResolver();
    resolver.setDefault('minecraft:slab', 'minecraft:block/slab');
    resolver.setVariant('minecraft:slab', 'type', 'double', 'minecraft:block/slab_double');

    expect(resolver.resolve('minecraft:slab', { type: 'double' })).toBe('minecraft:block/slab_double');
    expect(resolver.resolve('minecraft:slab', { type: 'bottom' })).toBe('minecraft:block/slab');
  });

  it('first registered matching variant wins (deterministic)', () => {
    const resolver = new BlockModelResolver();
    resolver.setDefault('b', 'default');
    resolver.setVariant('b', 'a', '1', 'modelA');
    resolver.setVariant('b', 'a', '1', 'modelB');
    resolver.setVariant('b', 'a', '2', 'modelC');

    expect(resolver.resolve('b', { a: '1' })).toBe('modelA');
    expect(resolver.resolve('b', { a: '2' })).toBe('modelC');
  });

  it('returns null for unknown blocks', () => {
    const resolver = new BlockModelResolver();
    expect(resolver.resolve('minecraft:missing', {})).toBeNull();
    expect(resolver.resolve('minecraft:missing', { a: '1' })).toBeNull();
  });

  it('validates registration and exposes state', () => {
    const resolver = new BlockModelResolver();
    resolver.setDefault('a', 'ma');
    resolver.setVariant('a', 'p', 'v', 'mv');
    resolver.setDefault('b', 'mb');

    expect(() => resolver.setDefault('a', 'other')).toThrow(/duplicate/i);
    expect(() => resolver.setDefault('', 'm')).toThrow();
    expect(() => resolver.setVariant('a', '', 'v', 'm')).toThrow();

    expect(resolver.has('a')).toBe(true);
    expect(resolver.has('c')).toBe(false);
    expect(resolver.size).toBe(2);

    resolver.clear();
    expect(resolver.size).toBe(0);
    expect(resolver.resolve('a', {})).toBeNull();
  });
});
