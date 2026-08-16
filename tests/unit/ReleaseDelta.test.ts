import { describe, it, expect } from 'vitest';
import {
  RELEASE_CONTENT_KINDS,
  contentForKind,
  createReleaseDelta,
  isEnabled,
  overridesFor,
} from '../../src/data/ReleaseDelta';

describe('creation', () => {
  it('applies explicit content and behavior with documented defaults', () => {
    const delta = createReleaseDelta({
      release: '1.21',
      content: { blocks: ['minecraft:obsidian_alt'], potions: ['minecraft:swiftness_alt'] },
      behavior: [{ target: 'minecraft:obsidian_alt', field: 'hardness', value: 40 }],
    });
    expect(delta.release).toBe('1.21');
    expect(contentForKind(delta, 'blocks')).toEqual(['minecraft:obsidian_alt']);
    expect(contentForKind(delta, 'potions')).toEqual(['minecraft:swiftness_alt']);
    expect(delta.behavior).toEqual([{ target: 'minecraft:obsidian_alt', field: 'hardness', value: 40 }]);
  });

  it('defaults every content kind to empty and behavior to []', () => {
    const delta = createReleaseDelta({ release: '1.21' });
    for (const kind of RELEASE_CONTENT_KINDS) {
      expect(contentForKind(delta, kind)).toEqual([]);
    }
    expect(delta.behavior).toEqual([]);
  });
});

describe('rejections', () => {
  it('rejects empty releases and unknown kinds', () => {
    expect(() => createReleaseDelta({ release: '' })).toThrow(
      'ReleaseDelta: release must be a non-empty string',
    );
    expect(() => createReleaseDelta({ release: '1.21', content: { terrain: ['x'] } as never })).toThrow(
      'ReleaseDelta: unknown content kind terrain',
    );
  });

  it('rejects malformed content ids', () => {
    expect(() => createReleaseDelta({ release: '1.21', content: { blocks: [''] } })).toThrow(
      'ReleaseDelta: blocks must be non-empty strings',
    );
    expect(() =>
      createReleaseDelta({ release: '1.21', content: { blocks: [5 as unknown as string] } }),
    ).toThrow('ReleaseDelta: blocks must be non-empty strings');
  });

  it('rejects bad overrides', () => {
    expect(() =>
      createReleaseDelta({ release: '1.21', behavior: [{ target: '', field: 'x', value: 1 }] }),
    ).toThrow('ReleaseDelta: behavior 0.target must be a non-empty string');
    expect(() =>
      createReleaseDelta({ release: '1.21', behavior: [{ target: 'a', field: '', value: 1 }] }),
    ).toThrow('ReleaseDelta: behavior 0.field must be a non-empty string');
    for (const value of [null, NaN]) {
      expect(() =>
        createReleaseDelta({ release: '1.21', behavior: [{ target: 'a', field: 'x', value: value as never }] }),
      ).toThrow('ReleaseDelta: behavior 0.value must be a boolean, finite number, or string');
    }
    expect(() =>
      createReleaseDelta({ release: '1.21', behavior: [{ target: 'a', field: 'x', value: true }] }),
    ).not.toThrow();
  });
});

describe('queries', () => {
  const delta = createReleaseDelta({
    release: '1.21',
    content: { blocks: ['minecraft:a', 'minecraft:b'] },
    behavior: [
      { target: 'minecraft:a', field: 'hardness', value: 40 },
      { target: 'minecraft:a', field: 'stackSize', value: 16 },
      { target: 'minecraft:c', field: 'speed', value: 0.5 },
    ],
  });

  it('reports content per kind, never undefined', () => {
    expect(contentForKind(delta, 'blocks')).toEqual(['minecraft:a', 'minecraft:b']);
    expect(contentForKind(delta, 'loot')).toEqual([]);
  });

  it('reports enabled ids', () => {
    expect(isEnabled(delta, 'blocks', 'minecraft:a')).toBe(true);
    expect(isEnabled(delta, 'blocks', 'minecraft:c')).toBe(false);
    expect(isEnabled(delta, 'items', 'minecraft:a')).toBe(false);
  });

  it('returns overrides per target in registration order', () => {
    expect(overridesFor(delta, 'minecraft:a')).toEqual([
      { target: 'minecraft:a', field: 'hardness', value: 40 },
      { target: 'minecraft:a', field: 'stackSize', value: 16 },
    ]);
    expect(overridesFor(delta, 'minecraft:c')).toEqual([{ target: 'minecraft:c', field: 'speed', value: 0.5 }]);
    expect(overridesFor(delta, 'minecraft:nope')).toEqual([]);
  });
});
