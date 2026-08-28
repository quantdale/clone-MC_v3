import { describe, it, expect } from 'vitest';
import {
  REPLAY_HASH_VERSION,
  canonicalize,
  hashState,
  CanonicalizeError,
} from '../../src/simulation/StateHasher';

describe('StateHasher: order-independent canonicalization', () => {
  it('is independent of object key insertion order', () => {
    const a = { a: 1, b: 2, c: 3 };
    const b = { c: 3, a: 1, b: 2 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(hashState(a)).toBe(hashState(b));
  });

  it('encodes the documented primitives and nesting', () => {
    expect(canonicalize(null)).toBe('N');
    expect(canonicalize(undefined)).toBe('U');
    expect(canonicalize(true)).toBe('T');
    expect(canonicalize(false)).toBe('F');
    expect(canonicalize(0)).toBe('i0');
    expect(canonicalize(-5)).toBe('i-5');
    expect(canonicalize(1.5)).toBe('f1.5');
    expect(canonicalize('')).toBe('s0:');
    expect(canonicalize('ab')).toBe('s2:ab');
    expect(canonicalize([])).toBe('[]');
    expect(canonicalize([1, 'x', true])).toBe('[i1s1:xT]');
    expect(canonicalize({ b: 2, a: 1 })).toBe('{s1:a:i1;s1:b:i2;}'); // keys sorted ascending
  });

  it('collapses negative zero to positive zero', () => {
    expect(canonicalize(-0)).toBe('i0');
    expect(canonicalize(0)).toBe('i0');
    expect(canonicalize(-0)).toBe(canonicalize(0));
    expect(hashState(-0)).toBe(hashState(0));
  });

  it('rejects non-deterministic and non-plain values', () => {
    expect(() => canonicalize(NaN)).toThrow(CanonicalizeError);
    expect(() => canonicalize(Infinity)).toThrow(CanonicalizeError);
    expect(() => canonicalize(-Infinity)).toThrow(CanonicalizeError);
    expect(() => canonicalize(() => 1)).toThrow(CanonicalizeError);
    expect(() => canonicalize(Symbol('x'))).toThrow(CanonicalizeError);
    expect(() => canonicalize(10n)).toThrow(CanonicalizeError);
    expect(() => canonicalize(new Date())).toThrow(CanonicalizeError);
    expect(() => canonicalize(new Map())).toThrow(CanonicalizeError);
    expect(() => canonicalize(new Set())).toThrow(CanonicalizeError);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalize(cyclic)).toThrow(CanonicalizeError);
  });
});

describe('StateHasher: hash function', () => {
  it('equal canonical values hash equally and stay in uint32 range', () => {
    const v = { x: [1, 2, 3], y: 'hello' };
    const h = hashState(v);
    expect(h).toBe(hashState({ y: 'hello', x: [1, 2, 3] }));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it('pins known values under REPLAY_HASH_VERSION = v1', () => {
    expect(REPLAY_HASH_VERSION).toBe('v1');
    expect(hashState(0)).toBe(2335764252);
    expect(hashState(1)).toBe(2352541871);
    expect(hashState(-1)).toBe(3548737678);
    expect(hashState('hello')).toBe(17569107);
    expect(hashState({ tick: 1, systems: [{ n: 1 }] })).toBe(982516866);
    expect(hashState({ tick: 2, systems: [{ n: 2 }] })).toBe(1322845378);
    expect(hashState({})).toBe(1415952421);
    expect(hashState([])).toBe(1947613349);
    expect(hashState([1, 2, 3])).toBe(4185456750);
    expect(hashState('é中文')).toBe(3707659506);
  });
});

describe('StateHasher: what is hashed', () => {
  it('reflects system order (swapped systems hash differently)', () => {
    const a = { tick: 1, systems: [{ n: 1 }, { n: 2 }] };
    const b = { tick: 1, systems: [{ n: 2 }, { n: 1 }] };
    expect(canonicalize(a)).not.toBe(canonicalize(b));
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('hashes an empty systems snapshot deterministically', () => {
    const a = { tick: 0, systems: [] };
    expect(hashState(a)).toBe(hashState({ tick: 0, systems: [] }));
  });
});

describe('StateHasher: versioning and cross-run stability', () => {
  it('exposes a pinned version string', () => {
    expect(REPLAY_HASH_VERSION).toBe('v1');
  });

  it('is stable across repeated and independent calls', () => {
    const v = { tick: 3, systems: [{ d: [1, 2, 3] }, { s: 'x' }] };
    expect(hashState(v)).toBe(hashState(v));
    expect(hashState(v)).toBe(hashState(JSON.parse(JSON.stringify(v))));
  });
});
