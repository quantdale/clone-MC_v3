import { describe, expect, it } from 'vitest';
import {
  ResourceIdError,
  compareResourceIds,
  createResourceId,
  isValidResourceNamespace,
  isValidResourcePath,
  parseResourceId,
  resourceIdEquals,
  resourceIdToString,
  tryParseResourceId,
  type ResourceIdErrorReason,
} from '../../src/data/ResourceId';

function expectReason(action: () => unknown, reason: ResourceIdErrorReason): void {
  try {
    action();
    throw new Error('Expected ResourceIdError');
  } catch (error) {
    expect(error).toBeInstanceOf(ResourceIdError);
    expect((error as ResourceIdError).reason).toBe(reason);
  }
}

describe('ResourceId', () => {
  it('parses qualified ids and serializes their canonical form', () => {
    const id = parseResourceId('game:stone');
    expect(id).toEqual({ namespace: 'game', path: 'stone' });
    expect(resourceIdToString(id)).toBe('game:stone');
  });

  it('accepts the complete legal namespace and path character sets', () => {
    const namespace = 'abcxyz0123456789_.-';
    const path = 'blocks/abcxyz0123456789_./-';
    expect(isValidResourceNamespace(namespace)).toBe(true);
    expect(isValidResourcePath(path)).toBe(true);

    const id = createResourceId(namespace, path);
    expect(resourceIdToString(id)).toBe(`${namespace}:${path}`);
  });

  it('accepts an unqualified path only with an explicit valid default namespace', () => {
    expect(resourceIdToString(parseResourceId('blocks/stone', 'game'))).toBe('game:blocks/stone');
    expectReason(() => parseResourceId('stone'), 'MISSING_NAMESPACE');
    expectReason(() => parseResourceId('stone', 'Game'), 'INVALID_NAMESPACE');
    expectReason(() => parseResourceId('stone', ''), 'EMPTY_NAMESPACE');
  });

  it('rejects empty input, namespace, and path with stable reasons', () => {
    expectReason(() => parseResourceId(''), 'EMPTY_INPUT');
    expectReason(() => parseResourceId(':stone'), 'EMPTY_NAMESPACE');
    expectReason(() => parseResourceId('game:'), 'EMPTY_PATH');
    expectReason(() => createResourceId('', 'stone'), 'EMPTY_NAMESPACE');
    expectReason(() => createResourceId('game', ''), 'EMPTY_PATH');
  });

  it.each([
    'Game:stone',
    'ga me:stone',
    'ga\tme:stone',
    'ga\nme:stone',
    'gáme:stone',
    'game!:stone',
    'game\\name:stone',
  ])('rejects invalid namespace input %j', (value) => {
    expectReason(() => parseResourceId(value), 'INVALID_NAMESPACE');
  });

  it.each([
    'game:Stone',
    'game:stone brick',
    'game:stone\tbrick',
    'game:stone\nbrick',
    'game:stöne',
    'game:stone!',
    'game:stone\\brick',
    'game:stone:polished',
  ])('rejects invalid path input %j', (value) => {
    expectReason(() => parseResourceId(value), 'INVALID_PATH');
  });

  it('does not trim or case-normalize malformed input', () => {
    expect(tryParseResourceId(' game:stone')).toBeNull();
    expect(tryParseResourceId('game:stone ')).toBeNull();
    expect(tryParseResourceId('GAME:STONE')).toBeNull();
  });

  it('uses the same validation rules for direct creation and parsing', () => {
    const created = createResourceId('game', 'blocks/stone');
    const parsed = parseResourceId('game:blocks/stone');
    expect(resourceIdEquals(created, parsed)).toBe(true);
    expect(resourceIdToString(created)).toBe(resourceIdToString(parsed));

    expectReason(() => createResourceId('Game', 'stone'), 'INVALID_NAMESPACE');
    expectReason(() => createResourceId('game', 'Stone'), 'INVALID_PATH');
  });

  it('returns frozen immutable identities', () => {
    const id = parseResourceId('game:stone');
    expect(Object.isFrozen(id)).toBe(true);
    expect(() => {
      (id as { namespace: string }).namespace = 'other';
    }).toThrow(TypeError);
    expect(resourceIdToString(id)).toBe('game:stone');
  });

  it('compares equality by value rather than object identity', () => {
    const first = parseResourceId('game:stone');
    const second = createResourceId('game', 'stone');
    const different = parseResourceId('game:dirt');

    expect(first).not.toBe(second);
    expect(resourceIdEquals(first, second)).toBe(true);
    expect(resourceIdEquals(first, different)).toBe(false);
  });

  it('orders namespace first and path second using deterministic ordinal comparison', () => {
    const ids = [
      parseResourceId('zeta:a'),
      parseResourceId('game:z'),
      parseResourceId('game:a'),
      parseResourceId('alpha:z'),
    ];

    ids.sort(compareResourceIds);
    expect(ids.map(resourceIdToString)).toEqual([
      'alpha:z',
      'game:a',
      'game:z',
      'zeta:a',
    ]);
    expect(compareResourceIds(parseResourceId('game:a'), parseResourceId('game:a'))).toBe(0);
  });

  it('round-trips a representative table of legal ids', () => {
    const valid = [
      'a:b',
      'game:stone',
      'game:blocks/stone',
      'mod_1:item-name',
      'data.v2:path.with.dots',
      'abc-xyz:nested/path_2/file-name',
      '0:0',
    ];

    for (const text of valid) {
      const parsed = parseResourceId(text);
      const reparsed = parseResourceId(resourceIdToString(parsed));
      expect(resourceIdEquals(parsed, reparsed)).toBe(true);
    }
  });

  it('try-parse returns null for validation failures without poisoning later parses', () => {
    const invalid = [
      '',
      'stone',
      ':stone',
      'game:',
      'Game:stone',
      'game:Stone',
      'game:stone:extra',
      'game:stone\\brick',
    ];

    for (const text of invalid) {
      expect(tryParseResourceId(text)).toBeNull();
    }

    expect(resourceIdToString(parseResourceId('game:stone'))).toBe('game:stone');
  });

  it('try-parse does not swallow unrelated programming errors', () => {
    const unsafeTryParse = tryParseResourceId as unknown as (input: null) => unknown;
    expect(() => unsafeTryParse(null)).toThrow(TypeError);
  });
});
