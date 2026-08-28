import { describe, it, expect } from 'vitest';
import { validateConfiguredFeatureConfig, type ConfiguredFeatureConfig } from '../../src/worldgen/ConfiguredFeature';
import {
  createDefaultOreBlockTags,
  createDefaultOreConfiguredFeatures,
  createDefaultOrePlacedFeatures,
  OreBlockTagRegistry,
  resolveOreTargetBlockIds,
  validateOreBlockTag,
} from '../../src/worldgen/OreFeature';

const validOre: ConfiguredFeatureConfig = {
  type: 'ore',
  blockId: 14,
  size: 17,
  discardChanceOnAirExposure: 0,
  targetTags: ['overworld/stone_ore_replaceables', 'overworld/soil_ore_replaceables'],
};

describe('ore config validation (094 union extension)', () => {
  it('accepts a valid ore config', () => {
    expect(validateConfiguredFeatureConfig(validOre)).toEqual(validOre);
  });

  it('accepts a discard chance of 1 and a zero-size-free boundary config', () => {
    const boundary: ConfiguredFeatureConfig = {
      type: 'ore',
      blockId: 0,
      size: 1,
      discardChanceOnAirExposure: 1,
      targetTags: ['t'],
    };
    expect(validateConfiguredFeatureConfig(boundary)).toEqual(boundary);
  });

  it('rejects malformed ore configs naming the field', () => {
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', size: 17, discardChanceOnAirExposure: 0, targetTags: ['t'] })).toThrow(/blockId/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: -1, size: 17, discardChanceOnAirExposure: 0, targetTags: ['t'] })).toThrow(/blockId/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 0, discardChanceOnAirExposure: 0, targetTags: ['t'] })).toThrow(/size/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 2.5, discardChanceOnAirExposure: 0, targetTags: ['t'] })).toThrow(/size/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: -0.1, targetTags: ['t'] })).toThrow(/discardChanceOnAirExposure/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 1.1, targetTags: ['t'] })).toThrow(/discardChanceOnAirExposure/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: Number.NaN, targetTags: ['t'] })).toThrow(/discardChanceOnAirExposure/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 'x', targetTags: ['t'] })).toThrow(/discardChanceOnAirExposure/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 0 })).toThrow(/targetTags/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 0, targetTags: [] })).toThrow(/targetTags/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 0, targetTags: [''] })).toThrow(/targetTags/i);
    expect(() => validateConfiguredFeatureConfig({ type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 0, targetTags: [3] })).toThrow(/targetTags/i);
  });
});

describe('validateOreBlockTag', () => {
  it('accepts a valid tag', () => {
    expect(validateOreBlockTag({ key: 'overworld/stone_ore_replaceables', blockIds: [3, 2, 11] })).toEqual({
      key: 'overworld/stone_ore_replaceables',
      blockIds: [3, 2, 11],
    });
  });

  it('rejects malformed tags naming the field', () => {
    expect(() => validateOreBlockTag({ key: '', blockIds: [3] })).toThrow(/key/i);
    expect(() => validateOreBlockTag({ key: 't' })).toThrow(/blockIds/i);
    expect(() => validateOreBlockTag({ key: 't', blockIds: [] })).toThrow(/blockIds/i);
    expect(() => validateOreBlockTag({ key: 't', blockIds: [-1] })).toThrow(/blockIds/i);
    expect(() => validateOreBlockTag({ key: 't', blockIds: [1.5] })).toThrow(/blockIds/i);
    expect(() => validateOreBlockTag({ key: 't', blockIds: [3, 3] })).toThrow(/duplicate/i);
    expect(() => validateOreBlockTag(null)).toThrow(/object/i);
  });
});

describe('OreBlockTagRegistry', () => {
  it('registers, gets, checks, sizes, and clears', () => {
    const registry = new OreBlockTagRegistry();
    registry.register('a', [3, 2]);
    expect(registry.get('a')).toEqual({ key: 'a', blockIds: [3, 2] });
    expect(registry.has('a')).toBe(true);
    expect(registry.has('b')).toBe(false);
    expect(registry.size).toBe(1);

    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.get('a')).toBeNull();
  });

  it('rejects duplicates and invalid tags atomically', () => {
    const registry = new OreBlockTagRegistry();
    registry.register('a', [3]);

    expect(() => registry.register('a', [2])).toThrow(/duplicate/i);
    expect(() => registry.register('b', [])).toThrow(/blockIds/i);
    expect(() => registry.register('b', [1, 1])).toThrow(/duplicate/i);
    expect(registry.size).toBe(1);
    expect(registry.has('b')).toBe(false);
  });
});

describe('resolveOreTargetBlockIds', () => {
  it('resolves tags in targetTags order preserving member order', () => {
    const tags = new OreBlockTagRegistry();
    tags.register('t1', [3, 2]);
    tags.register('t2', [11, 4]);
    expect(resolveOreTargetBlockIds(['t1', 't2'], tags)).toEqual([3, 2, 11, 4]);
  });

  it('dedupes shared ids keeping the first occurrence', () => {
    const tags = new OreBlockTagRegistry();
    tags.register('t1', [3, 2]);
    tags.register('t2', [2, 4, 3]);
    expect(resolveOreTargetBlockIds(['t1', 't2'], tags)).toEqual([3, 2, 4]);
  });

  it('throws on unknown tags', () => {
    const tags = new OreBlockTagRegistry();
    tags.register('t1', [3]);
    expect(() => resolveOreTargetBlockIds(['t1', 'missing'], tags)).toThrow(/unknown target tag: missing/i);
  });
});

describe('defaults', () => {
  it('createDefaultOreBlockTags registers the documented tags deterministically', () => {
    const a = createDefaultOreBlockTags();
    const b = createDefaultOreBlockTags();
    expect(a.size).toBe(2);
    expect(a.get('overworld/stone_ore_replaceables')).toEqual({ key: 'overworld/stone_ore_replaceables', blockIds: [3] });
    expect(a.get('overworld/soil_ore_replaceables')).toEqual({ key: 'overworld/soil_ore_replaceables', blockIds: [2, 11, 4] });
    expect(a.get('overworld/stone_ore_replaceables')).toEqual(b.get('overworld/stone_ore_replaceables'));
  });

  it('createDefaultOreConfiguredFeatures registers the documented ore features deterministically', () => {
    const a = createDefaultOreConfiguredFeatures();
    const b = createDefaultOreConfiguredFeatures();
    expect(a.size).toBe(2);
    expect(a.get('overworld/coal_ore')).toEqual({
      key: 'overworld/coal_ore',
      config: { type: 'ore', blockId: 14, size: 17, discardChanceOnAirExposure: 0, targetTags: ['overworld/stone_ore_replaceables', 'overworld/soil_ore_replaceables'] },
    });
    expect(a.get('overworld/iron_ore')).toEqual({
      key: 'overworld/iron_ore',
      config: { type: 'ore', blockId: 15, size: 9, discardChanceOnAirExposure: 0, targetTags: ['overworld/stone_ore_replaceables', 'overworld/soil_ore_replaceables'] },
    });
    expect(a.get('overworld/coal_ore')).toEqual(b.get('overworld/coal_ore'));
  });

  it('createDefaultOrePlacedFeatures registers the documented placed features deterministically', () => {
    const a = createDefaultOrePlacedFeatures();
    const b = createDefaultOrePlacedFeatures();
    expect(a.size).toBe(2);
    expect(a.get('overworld/coal_ore')).toEqual({
      key: 'overworld/coal_ore',
      featureKey: 'overworld/coal_ore',
      modifiers: [
        { type: 'count', tries: 20 },
        { type: 'heightRange', minY: -64, maxY: 192 },
      ],
    });
    expect(a.get('overworld/iron_ore')).toEqual({
      key: 'overworld/iron_ore',
      featureKey: 'overworld/iron_ore',
      modifiers: [
        { type: 'count', tries: 9 },
        { type: 'heightRange', minY: -64, maxY: 72 },
      ],
    });
    expect(a.get('overworld/coal_ore')).toEqual(b.get('overworld/coal_ore'));
  });

  it('every default ore targetTags resolves through the default tag registry', () => {
    const tags = createDefaultOreBlockTags();
    const features = createDefaultOreConfiguredFeatures();
    const coal = features.get('overworld/coal_ore')!;
    const iron = features.get('overworld/iron_ore')!;
    if (coal.config.type !== 'ore' || iron.config.type !== 'ore') {
      throw new Error('expected ore configs');
    }
    expect(resolveOreTargetBlockIds(coal.config.targetTags, tags)).toEqual([3, 2, 11, 4]);
    expect(resolveOreTargetBlockIds(iron.config.targetTags, tags)).toEqual([3, 2, 11, 4]);
  });
});
