import { describe, expect, it } from 'vitest';
import {
  CodecError,
  VersionedCodec,
  fnv1a32,
  type VersionedSerializers,
} from '../../src/data/VersionedCodec';

interface RecordV {
  name: string;
  count: number;
}

const v1: VersionedSerializers<RecordV> = {
  encode: (v) => ({ n: v.name, c: v.count }),
  decode: (d) => {
    const o = d as { n: unknown; c: unknown };
    if (typeof o.n !== 'string' || typeof o.c !== 'number') {
      throw new CodecError('SCHEMA_ERROR', 'v1 payload shape');
    }
    return { name: o.n, count: o.c };
  },
};

const v2: VersionedSerializers<RecordV> = {
  encode: (v) => ({ name: v.name, count: v.count }),
  decode: (d) => {
    const o = d as { name: unknown; count: unknown };
    if (typeof o.name !== 'string' || typeof o.count !== 'number') {
      throw new CodecError('SCHEMA_ERROR', 'v2 payload shape');
    }
    return { name: o.name, count: o.count };
  },
};

describe('versioned codec round-trip', () => {
  it('round-trips a value at the current version', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });
    const value = { name: 'alpha', count: 3 };
    const decoded = codec.decode(codec.encode(value));
    expect(decoded).toEqual(value);
  });

  it('decodes a v1 envelope with a v2 codec (backward compatible)', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });
    const v1String = JSON.stringify({ v: 1, d: { n: 'beta', c: 7 } });
    const decoded = codec.decode(v1String);
    expect(decoded).toEqual({ name: 'beta', count: 7 });
  });

  it('rejects a newer-than-known version', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });
    const future = JSON.stringify({ v: 3, d: { name: 'x', count: 1 } });
    expect(() => codec.decode(future)).toThrow(/UNSUPPORTED_VERSION/);
  });

  it('rejects an unknown older version', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 2: v2 } });
    const old = JSON.stringify({ v: 1, d: { n: 'x', c: 1 } });
    expect(() => codec.decode(old)).toThrow(/INVALID_FORMAT/);
  });

  it('detects a tampered payload via checksum', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });
    const env = JSON.parse(codec.encode({ name: 'gamma', count: 4 }));
    env.d.count = 999;
    expect(() => codec.decode(JSON.stringify(env))).toThrow(/INVALID_CHECKSUM/);
  });

  it('rejects a malformed envelope', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });
    expect(() => codec.decode('not json')).toThrow(/INVALID_FORMAT/);
    expect(() => codec.decode(JSON.stringify({ d: {} }))).toThrow(/INVALID_FORMAT/);
  });

  it('propagates a schema error from the decoder', () => {
    const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });
    const bad = JSON.stringify({ v: 2, d: { name: 'x' } });
    expect(() => codec.decode(bad)).toThrow(/SCHEMA_ERROR/);
  });
});

describe('tryDecode', () => {
  const codec = new VersionedCodec<RecordV>({ currentVersion: 2, codecs: { 1: v1, 2: v2 } });

  it('returns ok on success', () => {
    const value = { name: 'delta', count: 1 };
    const result = codec.tryDecode(codec.encode(value));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(value);
    }
  });

  it('returns a structured error without throwing', () => {
    const result = codec.tryDecode('garbage');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toMatch(/INVALID_FORMAT/);
    }
  });
});

describe('fnv1a32', () => {
  it('is deterministic and order-sensitive', () => {
    expect(fnv1a32('hello')).toBe(fnv1a32('hello'));
    expect(fnv1a32('hello')).not.toBe(fnv1a32('world'));
    expect(fnv1a32('')).toBe(0x811c9dc5);
  });
});
