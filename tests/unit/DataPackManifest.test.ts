import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  createDataPackManifest,
  entriesByKind,
  entriesOfKind,
  entryById,
  entryPath,
  resolveEntries,
  validateDataPackManifest,
  type DataPackEntry,
} from '../../src/data/DataPackManifest';

const RECIPE: DataPackEntry = {
  id: createResourceId('minecraft', 'planks'),
  kind: 'recipe',
  path: 'recipe/planks.json',
};
const TAG: DataPackEntry = {
  id: createResourceId('minecraft', 'logs'),
  kind: 'tag',
  path: 'tags/block/logs.json',
};
const ADVANCEMENT: DataPackEntry = {
  id: createResourceId('custom', 'first_join'),
  kind: 'advancement',
  path: 'advancement/first_join.json',
};
const LOOT: DataPackEntry = {
  id: createResourceId('minecraft', 'chests/simple'),
  kind: 'loot_table',
  path: 'loot_table/chests/simple.json',
};
const WORLDGEN: DataPackEntry = {
  id: createResourceId('minecraft', 'overworld/caves'),
  kind: 'worldgen',
  path: 'worldgen/caves.json',
};

describe('construction', () => {
  it('builds and round-trips a manifest across all five kinds', () => {
    const manifest = createDataPackManifest('Core', 'The internal pack', [
      RECIPE,
      TAG,
      ADVANCEMENT,
      LOOT,
      WORLDGEN,
    ]);
    expect(manifest.formatVersion).toBe(1);
    expect(validateDataPackManifest(manifest)).toEqual(manifest);
    expect(manifest.entries).toHaveLength(5);
  });
});

describe('rejections', () => {
  const base = (entries: unknown[] = [RECIPE]) => ({ formatVersion: 1, name: 'Core', description: 'x', entries });

  it('rejects bad payload shapes and fields', () => {
    expect(() => validateDataPackManifest(null)).toThrow('DataPack: expected an object');
    expect(() => validateDataPackManifest({ ...base(), formatVersion: 0 })).toThrow(
      'DataPack: unsupported format version 0',
    );
    expect(() => validateDataPackManifest({ ...base(), name: '' })).toThrow(
      'DataPack: name must be a non-empty string',
    );
    expect(() => validateDataPackManifest({ ...base(), description: '' })).toThrow(
      'DataPack: description must be a non-empty string',
    );
    expect(() => validateDataPackManifest({ ...base(), entries: 'x' })).toThrow(
      'DataPack: entries must be an array',
    );
    expect(() => validateDataPackManifest({ ...base(), extra: true })).toThrow(
      'DataPack: unknown key extra',
    );
  });

  it('rejects invalid entry ids, kinds, and paths', () => {
    expect(() => validateDataPackManifest(base([{ ...RECIPE, id: 'Bad Id' }]))).toThrow(
      'DataPack: entries 0.id must be a valid namespaced id',
    );
    expect(() => validateDataPackManifest(base([{ ...RECIPE, kind: 'biome' }]))).toThrow(
      'DataPack: entries 0.kind must be recipe, loot_table, tag, worldgen, or advancement',
    );
    expect(() => validateDataPackManifest(base([{ ...RECIPE, path: '../x.json' }]))).toThrow(
      "DataPack: entries 0.path must be a relative path without '..'",
    );
    expect(() => validateDataPackManifest(base([{ ...RECIPE, path: '/abs.json' }]))).toThrow(
      "DataPack: entries 0.path must be a relative path without '..'",
    );
  });

  it('rejects duplicate id+kind but allows the same id across kinds', () => {
    expect(() => validateDataPackManifest(base([RECIPE, RECIPE]))).toThrow(
      'DataPack: duplicate entry recipe minecraft:planks',
    );
    expect(() =>
      validateDataPackManifest(base([RECIPE, { ...TAG, id: RECIPE.id }])),
    ).not.toThrow();
  });
});

describe('queries', () => {
  const manifest = createDataPackManifest('Core', 'x', [RECIPE, TAG, { ...RECIPE, id: createResourceId('minecraft', 'stick') }]);

  it('looks up by id across kinds, undefined when missing', () => {
    expect(entryById(manifest, 'minecraft:planks')).toEqual(RECIPE);
    expect(entryById(manifest, createResourceId('minecraft', 'stick'))?.kind).toBe('recipe');
    expect(entryById(manifest, 'minecraft:nope')).toBeUndefined();
  });

  it('filters by kind in registration order and groups with empty arrays', () => {
    expect(entriesOfKind(manifest, 'recipe').map((e) => e.id.path)).toEqual(['planks', 'stick']);
    const groups = entriesByKind(manifest);
    expect(groups.recipe!.map((e) => e.id.path)).toEqual(['planks', 'stick']);
    expect(groups.loot_table).toEqual([]);
    expect(groups.worldgen).toEqual([]);
    expect(groups.advancement).toEqual([]);
  });

  it('produces the canonical path', () => {
    expect(entryPath(TAG)).toBe('data/minecraft/tag/tags/block/logs.json');
  });
});

describe('resolution', () => {
  const manifest = createDataPackManifest('Core', 'x', [RECIPE, TAG, ADVANCEMENT]);

  it('reports missing entries in registration order', () => {
    const missing = resolveEntries(manifest, (kind, id) => kind === 'recipe' && id.path === 'planks');
    expect(missing.map((e) => `${e.kind}:${e.id.path}`)).toEqual([
      'tag:logs',
      'advancement:first_join',
    ]);
  });

  it('yields empty lists when everything resolves and for empty manifests', () => {
    expect(resolveEntries(manifest, () => true)).toEqual([]);
    const empty = createDataPackManifest('Empty', 'x', []);
    expect(resolveEntries(empty, () => false)).toEqual([]);
  });
});
