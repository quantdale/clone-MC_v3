import { describe, it, expect } from 'vitest';
import {
  createDefaultConfiguredFeatures,
  ConfiguredFeatureRegistry,
  validateConfiguredFeature,
  validateConfiguredFeatureConfig,
  type ConfiguredFeatureConfig,
} from '../../src/worldgen/ConfiguredFeature';

describe('validateConfiguredFeatureConfig', () => {
  it('accepts valid core configs', () => {
    const simple: ConfiguredFeatureConfig = { type: 'simpleBlock', blockId: 3 };
    const patch: ConfiguredFeatureConfig = { type: 'blockPatch', blockId: 13, tries: 32, radiusXZ: 3, radiusY: 2 };
    expect(validateConfiguredFeatureConfig(simple)).toEqual(simple);
    expect(validateConfiguredFeatureConfig(patch)).toEqual(patch);
  });

  it('rejects unknown types and malformed fields naming the field', () => {
    expect(() => validateConfiguredFeatureConfig({ type: 'portal' })).toThrow(/unknown feature type/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'simpleBlock' })).toThrow(/blockId/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'simpleBlock', blockId: -1 })).toThrow(/blockId/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'blockPatch', blockId: 1, tries: 0, radiusXZ: 3, radiusY: 2 })).toThrow(/tries/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'blockPatch', blockId: 1, tries: 2, radiusXZ: 1.5, radiusY: 2 })).toThrow(/radiusXZ/i);
    expect(() => validateConfiguredFeatureConfig(null)).toThrow(/object/i);
  });
});

describe('validateConfiguredFeature', () => {
  it('accepts a keyed feature and rejects bad keys', () => {
    const feature = { key: 'overworld/dirt_patch', config: { type: 'blockPatch', blockId: 3, tries: 64, radiusXZ: 4, radiusY: 3 } };
    expect(validateConfiguredFeature(feature)).toEqual(feature);
    expect(() => validateConfiguredFeature({ key: '', config: { type: 'simpleBlock', blockId: 1 } })).toThrow(/key/i);
    expect(() => validateConfiguredFeature({ key: 'x', config: { type: 'moon' } })).toThrow(/unknown feature type/i);
  });
});

describe('ConfiguredFeatureRegistry', () => {
  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new ConfiguredFeatureRegistry();
    const config: ConfiguredFeatureConfig = { type: 'simpleBlock', blockId: 3 };

    registry.register('minecraft:test', config);
    expect(registry.get('minecraft:test')).toEqual({ key: 'minecraft:test', config });
    expect(registry.has('minecraft:test')).toBe(true);
    expect(registry.has('minecraft:missing')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('minecraft:test')).toBeNull();
  });

  it('rejects duplicates and invalid configs atomically', () => {
    const registry = new ConfiguredFeatureRegistry();
    const config: ConfiguredFeatureConfig = { type: 'simpleBlock', blockId: 3 };
    registry.register('a', config);

    expect(() => registry.register('a', config)).toThrow(/duplicate/i);
    expect(() => registry.register('b', { type: 'blockPatch', blockId: 1, tries: 0, radiusXZ: 1, radiusY: 1 })).toThrow(/tries/i);
    expect(registry.size).toBe(1);
    expect(registry.has('b')).toBe(false);
  });
});

describe('createDefaultConfiguredFeatures', () => {
  it('registers the documented defaults deterministically', () => {
    const a = createDefaultConfiguredFeatures();
    const b = createDefaultConfiguredFeatures();
    expect(a.size).toBe(2);
    expect(a.get('overworld/dirt_patch')).toEqual({
      key: 'overworld/dirt_patch',
      config: { type: 'blockPatch', blockId: 3, tries: 64, radiusXZ: 4, radiusY: 3 },
    });
    expect(a.get('overworld/gravel_patch')).toEqual({
      key: 'overworld/gravel_patch',
      config: { type: 'blockPatch', blockId: 13, tries: 32, radiusXZ: 3, radiusY: 2 },
    });
    expect(a.get('overworld/dirt_patch')).toEqual(b.get('overworld/dirt_patch'));
  });
});
