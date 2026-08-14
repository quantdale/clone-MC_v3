import { describe, it, expect } from 'vitest';
import {
  TagRegistry,
  type TagDefinition,
  type TagMember,
} from '../../src/data/TagRegistry';
import { createResourceId, resourceIdToString } from '../../src/data/ResourceId';

const rid = (path: string): ReturnType<typeof createResourceId> => createResourceId('minecraft', path);
const tag = (path: string): ReturnType<typeof createResourceId> => createResourceId('tag', path);

const def = (id: ReturnType<typeof tag>, members: TagMember[]): TagDefinition => ({ id, members });

function makeRegistry(
  definitions: TagDefinition[],
  existing: Set<string>,
): TagRegistry {
  const reg = new TagRegistry('block', definitions);
  reg.finalize((id) => existing.has(resourceIdToString(id)));
  return reg;
}

describe('tag registry', () => {
  it('resolves direct resource membership', () => {
    const existing = new Set([resourceIdToString(rid('stone'))]);
    const reg = makeRegistry([def(tag('stone_blocks'), [{ kind: 'resource', id: rid('stone') }])], existing);
    expect(reg.isFinalized).toBe(true);
    expect(reg.memberCount(tag('stone_blocks'))).toBe(1);
    expect(reg.contains(tag('stone_blocks'), rid('stone'))).toBe(true);
    expect(reg.membersOf(tag('stone_blocks'))).toEqual([rid('stone')]);
  });

  it('resolves nested membership across multiple levels', () => {
    const existing = new Set([
      resourceIdToString(rid('oak_log')),
      resourceIdToString(rid('oak_planks')),
    ]);
    const reg = makeRegistry(
      [
        def(tag('logs'), [{ kind: 'resource', id: rid('oak_log') }]),
        def(tag('planks'), [{ kind: 'resource', id: rid('oak_planks') }]),
        def(tag('wood'), [
          { kind: 'tag', id: tag('logs') },
          { kind: 'tag', id: tag('planks') },
        ]),
      ],
      existing,
    );
    const members = reg.membersOf(tag('wood'));
    expect(members).toEqual([rid('oak_log'), rid('oak_planks')]);
    expect(reg.contains(tag('wood'), rid('oak_log'))).toBe(true);
    expect(reg.contains(tag('wood'), rid('oak_planks'))).toBe(true);
  });

  it('deduplicates repeated and transitive members and keeps order deterministic', () => {
    const existing = new Set([
      resourceIdToString(rid('a')),
      resourceIdToString(rid('b')),
    ]);
    const reg = makeRegistry(
      [
        def(tag('base'), [
          { kind: 'resource', id: rid('a') },
          { kind: 'resource', id: rid('b') },
        ]),
        // 'a' is both a direct member and inherited via base.
        def(tag('derived'), [
          { kind: 'resource', id: rid('a') },
          { kind: 'tag', id: tag('base') },
        ]),
      ],
      existing,
    );
    const members = reg.membersOf(tag('derived'));
    expect(members).toEqual([rid('a'), rid('b')]);
    expect(reg.memberCount(tag('derived'))).toBe(2);
  });

  it('produces identical resolved order across repeated construction', () => {
    const build = (): TagRegistry => {
      const existing = new Set([
        resourceIdToString(rid('a')),
        resourceIdToString(rid('b')),
        resourceIdToString(rid('c')),
      ]);
      return makeRegistry(
        [
          def(tag('leaf'), [
            { kind: 'resource', id: rid('c') },
            { kind: 'resource', id: rid('b') },
          ]),
          def(tag('root'), [
            { kind: 'resource', id: rid('a') },
            { kind: 'tag', id: tag('leaf') },
          ]),
        ],
        existing,
      );
    };
    const first = build();
    const second = build();
    expect(first.membersOf(tag('root'))).toEqual(second.membersOf(tag('root')));
    expect(first.membersOf(tag('leaf'))).toEqual(second.membersOf(tag('leaf')));
  });

  it('rejects a missing direct resource during finalization', () => {
    const reg = new TagRegistry('block', [
      def(tag('broken'), [{ kind: 'resource', id: rid('missing') }]),
    ]);
    expect(() => reg.finalize(() => false)).toThrow(/MISSING_ID/);
    expect(reg.isFinalized).toBe(false);
  });

  it('rejects a missing nested tag during finalization', () => {
    const existing = new Set([resourceIdToString(rid('a'))]);
    const reg = new TagRegistry('block', [
      def(tag('parent'), [
        { kind: 'resource', id: rid('a') },
        { kind: 'tag', id: tag('ghost') },
      ]),
    ]);
    expect(() => reg.finalize((id) => existing.has(resourceIdToString(id)))).toThrow(/MISSING_ID/);
    expect(reg.isFinalized).toBe(false);
  });

  it('rejects self-cycles and multi-tag cycles', () => {
    const existing = new Set([resourceIdToString(rid('a'))]);
    const selfRef = new TagRegistry('block', [
      def(tag('loop'), [{ kind: 'tag', id: tag('loop') }]),
    ]);
    expect(() => selfRef.finalize(() => true)).toThrow(/CYCLE/);

    const multi = new TagRegistry('block', [
      def(tag('t1'), [{ kind: 'tag', id: tag('t2') }]),
      def(tag('t2'), [{ kind: 'tag', id: tag('t1') }]),
    ]);
    expect(() => multi.finalize((id) => existing.has(resourceIdToString(id)))).toThrow(/CYCLE/);
  });

  it('exposes no partial state after a failed finalization', () => {
    const existing = new Set([resourceIdToString(rid('a'))]);
    const reg = new TagRegistry('block', [
      def(tag('good'), [{ kind: 'resource', id: rid('a') }]),
      def(tag('broken'), [{ kind: 'resource', id: rid('missing') }]),
    ]);
    expect(() => reg.finalize((id) => existing.has(resourceIdToString(id)))).toThrow(/MISSING_ID/);
    // Nothing is observable before a successful finalize.
    expect(reg.isFinalized).toBe(false);
    expect(() => reg.membersOf(tag('good'))).toThrow(/NOT_FINALIZED/);

    // Repairing the broken tag and finalizing succeeds.
    const fixed = new TagRegistry('block', [
      def(tag('good'), [{ kind: 'resource', id: rid('a') }]),
    ]);
    expect(() => fixed.finalize((id) => existing.has(resourceIdToString(id)))).not.toThrow();
    expect(fixed.membersOf(tag('good'))).toEqual([rid('a')]);
  });

  it('rejects ordinary mutation of finalized membership', () => {
    const existing = new Set([resourceIdToString(rid('a')), resourceIdToString(rid('b'))]);
    const reg = makeRegistry(
      [
        def(tag('group'), [
          { kind: 'resource', id: rid('a') },
          { kind: 'resource', id: rid('b') },
        ]),
      ],
      existing,
    );
    const snapshot = reg.membersOf(tag('group'));
    expect(snapshot).toEqual([rid('a'), rid('b')]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    // Mutating the returned snapshot must not change resolved membership.
    // (The frozen array rejects mutation; verify internal state is intact.)
    expect(() => (snapshot as unknown as unknown[]).push(rid('c'))).toThrow();
    expect(reg.membersOf(tag('group'))).toEqual([rid('a'), rid('b')]);
    expect(reg.contains(tag('group'), rid('a'))).toBe(true);
  });

  it('rejects duplicate tag definitions', () => {
    expect(
      () =>
        new TagRegistry('block', [
          def(tag('dup'), [{ kind: 'resource', id: rid('a') }]),
          def(tag('dup'), [{ kind: 'resource', id: rid('b') }]),
        ]),
    ).toThrow(/DUPLICATE_ID/);
  });

  it('keeps registry domains type-separated', () => {
    const blockExisting = new Set([resourceIdToString(rid('stone'))]);
    const blockTags = makeRegistry(
      [def(tag('blocks'), [{ kind: 'resource', id: rid('stone') }])],
      blockExisting,
    );
    const itemTags = new TagRegistry('item', [
      def(tag('blocks'), [{ kind: 'resource', id: rid('stone') }]),
    ]);
    itemTags.finalize((id) => blockExisting.has(resourceIdToString(id)));

    // The two domains are independent instances; a tag in one is not shared.
    expect(blockTags.domainName).toBe('block');
    expect(itemTags.domainName).toBe('item');
    expect(blockTags.has(tag('blocks'))).toBe(true);
    expect(itemTags.has(tag('blocks'))).toBe(true);
    // Membership is resolved per-domain and not cross-contaminated.
    expect(blockTags.membersOf(tag('blocks'))).toEqual([rid('stone')]);
    expect(itemTags.membersOf(tag('blocks'))).toEqual([rid('stone')]);
  });

  it('throws when querying before finalization', () => {
    const reg = new TagRegistry('block', [def(tag('t'), [{ kind: 'resource', id: rid('a') }])]);
    expect(() => reg.membersOf(tag('t'))).toThrow(/NOT_FINALIZED/);
    expect(() => reg.contains(tag('t'), rid('a'))).toThrow(/NOT_FINALIZED/);
  });
});
