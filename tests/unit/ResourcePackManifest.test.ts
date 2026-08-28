import { describe, it, expect } from 'vitest';
import { createResourceId } from '../../src/data/ResourceId';
import {
  assetById,
  assetPath,
  assetsByNamespace,
  assetsOfType,
  createResourcePackManifest,
  validateResourcePackManifest,
  type ResourceAsset,
} from '../../src/data/ResourcePackManifest';

const TEXTURE: ResourceAsset = {
  id: createResourceId('minecraft', 'block/stone'),
  type: 'texture',
  path: 'textures/block/stone.png',
};
const SOUND: ResourceAsset = {
  id: createResourceId('minecraft', 'block/stone_hit'),
  type: 'sound',
  path: 'sounds/block/stone.ogg',
};
const METADATA: ResourceAsset = {
  id: createResourceId('minecraft', 'block/stone_meta'),
  type: 'metadata',
  path: 'block/stone.json',
  metadata: { tint: 'green' },
};

describe('construction', () => {
  it('builds and round-trips a valid manifest', () => {
    const manifest = createResourcePackManifest('Core', 'The internal pack', [TEXTURE, SOUND, METADATA]);
    expect(manifest.formatVersion).toBe(1);
    expect(validateResourcePackManifest(manifest)).toEqual(manifest);
    expect(manifest.assets).toHaveLength(3);
  });
});

describe('rejections', () => {
  const base = (assets: unknown[] = [TEXTURE]) => ({ formatVersion: 1, name: 'Core', description: 'x', assets });

  it('rejects bad payload shapes and fields', () => {
    expect(() => validateResourcePackManifest(null)).toThrow('ResourcePack: expected an object');
    expect(() => validateResourcePackManifest({ ...base(), formatVersion: 0 })).toThrow(
      'ResourcePack: unsupported format version 0',
    );
    expect(() => validateResourcePackManifest({ ...base(), name: '' })).toThrow(
      'ResourcePack: name must be a non-empty string',
    );
    expect(() => validateResourcePackManifest({ ...base(), description: '' })).toThrow(
      'ResourcePack: description must be a non-empty string',
    );
    expect(() => validateResourcePackManifest({ ...base(), assets: 'x' })).toThrow(
      'ResourcePack: assets must be an array',
    );
    expect(() => validateResourcePackManifest({ ...base(), extra: true })).toThrow(
      'ResourcePack: unknown key extra',
    );
  });

  it('rejects invalid asset ids, types, and paths', () => {
    expect(() => validateResourcePackManifest(base([{ ...TEXTURE, id: 'Bad Id' }]))).toThrow(
      'ResourcePack: assets 0.id must be a valid namespaced id',
    );
    expect(() => validateResourcePackManifest(base([{ ...TEXTURE, type: 'shader' }]))).toThrow(
      'ResourcePack: assets 0.type must be texture, model, sound, or metadata',
    );
    expect(() => validateResourcePackManifest(base([{ ...TEXTURE, path: '../secret.png' }]))).toThrow(
      "ResourcePack: assets 0.path must be a relative path without '..'",
    );
    expect(() => validateResourcePackManifest(base([{ ...TEXTURE, path: '' }]))).toThrow(
      "ResourcePack: assets 0.path must be a relative path without '..'",
    );
    expect(() => validateResourcePackManifest(base([{ ...TEXTURE, path: '/abs.png' }]))).toThrow(
      "ResourcePack: assets 0.path must be a relative path without '..'",
    );
  });

  it('rejects metadata misuse and duplicate ids', () => {
    expect(() => validateResourcePackManifest(base([{ ...TEXTURE, metadata: {} }]))).toThrow(
      'ResourcePack: assets 0.metadata must be an object on metadata assets',
    );
    expect(() => validateResourcePackManifest(base([{ ...METADATA, metadata: 'x' }]))).toThrow(
      'ResourcePack: assets 0.metadata must be an object on metadata assets',
    );
    expect(() => validateResourcePackManifest(base([TEXTURE, TEXTURE]))).toThrow(
      'ResourcePack: duplicate asset id minecraft:block/stone',
    );
  });
});

describe('queries', () => {
  const manifest = createResourcePackManifest('Core', 'x', [
    TEXTURE,
    SOUND,
    { id: createResourceId('custom', 'block/stone'), type: 'texture', path: 'custom/stone.png' },
  ]);

  it('looks up by string and ResourceId, undefined when missing', () => {
    expect(assetById(manifest, 'minecraft:block/stone')).toEqual(TEXTURE);
    expect(assetById(manifest, createResourceId('minecraft', 'block/stone_hit'))).toEqual(SOUND);
    expect(assetById(manifest, 'minecraft:nope')).toBeUndefined();
    expect(assetById(manifest, 'not a valid id')).toBeUndefined();
  });

  it('groups by namespace preserving registration order', () => {
    const groups = assetsByNamespace(manifest);
    expect(Object.keys(groups)).toEqual(['minecraft', 'custom']);
    expect(groups.minecraft!.map((a) => a.path)).toEqual([
      'textures/block/stone.png',
      'sounds/block/stone.ogg',
    ]);
    expect(groups.custom!.map((a) => a.id.path)).toEqual(['block/stone']);
  });

  it('filters by type in registration order', () => {
    expect(assetsOfType(manifest, 'texture').map((a) => a.id.path)).toEqual(['block/stone', 'block/stone']);
    expect(assetsOfType(manifest, 'metadata')).toEqual([]);
  });

  it('is total on empty manifests', () => {
    const empty = createResourcePackManifest('Empty', 'x', []);
    expect(assetById(empty, 'minecraft:a')).toBeUndefined();
    expect(assetsByNamespace(empty)).toEqual({});
    expect(assetsOfType(empty, 'texture')).toEqual([]);
  });
});

describe('canonical path', () => {
  it('produces assets/<namespace>/<type>/<path>', () => {
    expect(assetPath(SOUND)).toBe('assets/minecraft/sound/sounds/block/stone.ogg');
    expect(assetPath(TEXTURE)).toBe('assets/minecraft/texture/textures/block/stone.png');
  });
});
