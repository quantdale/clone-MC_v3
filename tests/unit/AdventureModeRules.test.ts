import { describe, it, expect } from 'vitest';
import { GAME_MODES } from '../../src/simulation/GameModeFramework';
import {
  canBreakBlock,
  canPlaceBlock,
  resolveBlockPermissionSet,
} from '../../src/simulation/AdventureModeRules';

const STONE = 'minecraft:stone';
const DIRT = 'minecraft:dirt';

describe('break permission', () => {
  it('allows survival and creative regardless of the allowed set', () => {
    for (const mode of ['survival', 'creative'] as const) {
      expect(canBreakBlock(mode, STONE, new Set([STONE]))).toBe(true);
      expect(canBreakBlock(mode, STONE, new Set())).toBe(true);
    }
  });

  it('never allows spectator', () => {
    expect(canBreakBlock('spectator', STONE, new Set([STONE]))).toBe(false);
    expect(canBreakBlock('spectator', STONE, new Set())).toBe(false);
  });

  it('allows adventure only for declared blocks, nothing with an empty set', () => {
    expect(canBreakBlock('adventure', STONE, new Set([STONE]))).toBe(true);
    expect(canBreakBlock('adventure', STONE, new Set([DIRT]))).toBe(false);
    expect(canBreakBlock('adventure', STONE, new Set())).toBe(false);
  });
});

describe('place permission', () => {
  it('allows survival and creative regardless of the allowed set', () => {
    for (const mode of ['survival', 'creative'] as const) {
      expect(canPlaceBlock(mode, DIRT, new Set([DIRT]))).toBe(true);
      expect(canPlaceBlock(mode, DIRT, new Set())).toBe(true);
    }
  });

  it('never allows spectator', () => {
    expect(canPlaceBlock('spectator', DIRT, new Set([DIRT]))).toBe(false);
    expect(canPlaceBlock('spectator', DIRT, new Set())).toBe(false);
  });

  it('allows adventure only for declared blocks, nothing with an empty set', () => {
    expect(canPlaceBlock('adventure', DIRT, new Set([DIRT]))).toBe(true);
    expect(canPlaceBlock('adventure', DIRT, new Set([STONE]))).toBe(false);
    expect(canPlaceBlock('adventure', DIRT, new Set())).toBe(false);
  });
});

describe('set resolution', () => {
  const lookup = (tagId: string): ReadonlySet<string> | undefined => {
    if (tagId === 'minecraft:logs') return new Set(['minecraft:oak_log', 'minecraft:birch_log']);
    if (tagId === 'minecraft:empty_tag') return new Set();
    return undefined;
  };

  it('unions direct ids with tag members, deduplicating', () => {
    const resolved = resolveBlockPermissionSet(
      [STONE, STONE],
      ['minecraft:logs'],
      lookup,
    );
    expect([...resolved].sort()).toEqual([
      'minecraft:birch_log',
      'minecraft:oak_log',
      'minecraft:stone',
    ]);
  });

  it('skips unknown tags and empty tags', () => {
    const resolved = resolveBlockPermissionSet([], ['minecraft:missing', 'minecraft:logs'], lookup);
    expect(resolved.has('minecraft:oak_log')).toBe(true);
    expect(resolved.size).toBe(2);
  });

  it('returns the empty set for empty inputs', () => {
    expect(resolveBlockPermissionSet([], [], lookup).size).toBe(0);
  });
});

describe('composed adventure flow', () => {
  it('resolves tags then applies the permission rules', () => {
    const lookup = (tagId: string): ReadonlySet<string> | undefined =>
      tagId === 'minecraft:logs' ? new Set(['minecraft:oak_log']) : undefined;
    const allowed = resolveBlockPermissionSet([STONE], ['minecraft:logs'], lookup);

    expect(canBreakBlock('adventure', STONE, allowed)).toBe(true);
    expect(canBreakBlock('adventure', 'minecraft:oak_log', allowed)).toBe(true);
    expect(canBreakBlock('adventure', DIRT, allowed)).toBe(false);
    expect(canPlaceBlock('adventure', STONE, allowed)).toBe(true);
    expect(canPlaceBlock('adventure', DIRT, allowed)).toBe(false);
  });

  it('covers every mode without throwing', () => {
    for (const mode of GAME_MODES) {
      for (const rule of [canBreakBlock, canPlaceBlock]) {
        expect(typeof rule(mode, STONE, new Set([STONE]))).toBe('boolean');
      }
    }
  });
});
