import { describe, expect, it } from 'vitest';
import { createResourceId, type ResourceId } from '../../src/data/ResourceId';
import { VersionedCodec, type VersionedSerializers } from '../../src/data/VersionedCodec';
import { ResourceDataLoader, loadIntoRegistry, type ResourceReader } from '../../src/data/ResourceDataLoader';

interface Item {
  id: string;
  label: string;
}

const serializers: VersionedSerializers<Item> = {
  encode: (v) => ({ id: v.id, label: v.label }),
  decode: (d) => {
    const o = d as { id: unknown; label: unknown };
    if (typeof o.id !== 'string' || typeof o.label !== 'string') {
      throw new Error('shape');
    }
    return { id: o.id, label: o.label };
  },
};

const codec = new VersionedCodec<Item>({ currentVersion: 1, codecs: { 1: serializers } });
const encode = (item: Item) => codec.encode(item);

function inMemory(files: Record<string, string>): ResourceReader {
  return (name) => files[name];
}

describe('resource data loader', () => {
  it('loads all files in order', () => {
    const reader = inMemory({
      'a.json': encode({ id: 'a', label: 'A' }),
      'b.json': encode({ id: 'b', label: 'B' }),
      'c.json': encode({ id: 'c', label: 'C' }),
    });
    const loader = new ResourceDataLoader<Item>({ codec, reader, files: ['a.json', 'b.json', 'c.json'] });
    const result = loader.load();
    expect(result.ok).toBe(true);
    expect(result.values.map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('records a missing file without aborting the batch', () => {
    const reader = inMemory({
      'a.json': encode({ id: 'a', label: 'A' }),
      'c.json': encode({ id: 'c', label: 'C' }),
    });
    const loader = new ResourceDataLoader<Item>({ codec, reader, files: ['a.json', 'missing.json', 'c.json'] });
    const result = loader.load();
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toBe('MISSING');
    expect(result.errors[0]?.file).toBe('missing.json');
    expect(result.values.map((v) => v.id)).toEqual(['a', 'c']);
  });

  it('records a decode failure without aborting the batch', () => {
    const reader = inMemory({
      'a.json': encode({ id: 'a', label: 'A' }),
      'bad.json': '{ not valid envelope',
      'c.json': encode({ id: 'c', label: 'C' }),
    });
    const loader = new ResourceDataLoader<Item>({ codec, reader, files: ['a.json', 'bad.json', 'c.json'] });
    const result = loader.load();
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toBe('DECODE');
    expect(result.values.map((v) => v.id)).toEqual(['a', 'c']);
  });
});

describe('loadIntoRegistry', () => {
  const keyOf = (v: Item): ResourceId => createResourceId('test', `item/${v.id}`);

  it('builds a registry keyed by ResourceId', () => {
    const reader = inMemory({
      'a.json': encode({ id: 'a', label: 'A' }),
      'b.json': encode({ id: 'b', label: 'B' }),
    });
    const loader = new ResourceDataLoader<Item>({ codec, reader, files: ['a.json', 'b.json'] });
    const { registry, errors } = loadIntoRegistry(loader, keyOf);
    expect(errors).toHaveLength(0);
    expect(registry.size).toBe(2);
    expect(registry.get(createResourceId('test', 'item/a')).label).toBe('A');
  });

  it('surfaces a duplicate key as an error', () => {
    const reader = inMemory({
      'a.json': encode({ id: 'dup', label: 'first' }),
      'b.json': encode({ id: 'dup', label: 'second' }),
    });
    const loader = new ResourceDataLoader<Item>({ codec, reader, files: ['a.json', 'b.json'] });
    const { registry, errors } = loadIntoRegistry(loader, keyOf);
    expect(errors.some((e) => e.detail.includes('DUPLICATE_ID'))).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.get(createResourceId('test', 'item/dup')).label).toBe('first');
  });
});
