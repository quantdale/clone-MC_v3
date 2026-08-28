/**
 * Authoritative-state canonical hash (state-hash-scheme spec, 241).
 *
 * `canonicalize` produces an order-independent, deterministic string for any
 * supported plain-data value regardless of object-key insertion order, using the
 * pinned encodings. `hashState` returns a uint32 (FNV-1a-32) over the UTF-16
 * code units of that canonical string. `REPLAY_HASH_VERSION` pins the triple
 * (canonicalization encoding, hash algorithm, snapshot semantics); changing any
 * of them MUST bump the version and deliberately re-pin the replay fixtures.
 *
 * Pure and headless-safe: no DOM, no timers, no IO, no external deps.
 */

const FNV_OFFSET_BASIS = 2166136261 >>> 0;
const FNV_PRIME = 16777619;

/** The current replay hash scheme version. Bump and re-pin fixtures on any change. */
export const REPLAY_HASH_VERSION = 'v1';

/** Thrown by `canonicalize` for non-deterministic or unsupported values. */
export class CanonicalizeError extends Error {
  constructor(message: string) {
    super(`canonicalize: ${message}`);
    this.name = 'CanonicalizeError';
  }
}

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function fnv1a32(str: string): number {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/**
 * Canonicalize a plain-data value to an order-independent deterministic string.
 *
 * Encodings (pinned): `null`→`N`, `undefined`→`U`, `true`→`T`, `false`→`F`,
 * integer→`i<decimal>`, non-integer finite→`f<Number(v)>`, string→`s<len>:<utf16>`,
 * array→`[<elem>*]`, object→`{<key-sorted>:<enc key>:<enc value>;*}`. Non-deterministic
 * values (NaN, ±Infinity, bigint, symbol, function, Date, Map, Set, class instances,
 * cycles) are rejected with a descriptive error rather than encoded ambiguously.
 */
export function canonicalize(value: unknown, seen: Set<unknown> = new Set()): string {
  if (value === null) return 'N';
  if (value === undefined) return 'U';

  const t = typeof value;
  if (t === 'boolean') return value ? 'T' : 'F';
  if (t === 'string') {
    // Length-prefixed raw UTF-16: length guards against delimiter ambiguity.
    const str = value as string;
    return `s${str.length}:${str}`;
  }
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalizeError(`non-finite number rejected: ${String(value)}`);
    }
    // Number(v) collapses -0 to +0 so integer zero always encodes as i0.
    const n = Number(value);
    if (Number.isInteger(n)) return `i${n}`;
    return `f${n}`;
  }
  if (t === 'bigint') throw new CanonicalizeError('bigint rejected (non-deterministic across platforms)');
  if (t === 'symbol') throw new CanonicalizeError('symbol rejected (non-deterministic)');
  if (t === 'function') throw new CanonicalizeError('function rejected (non-deterministic)');
  if (value instanceof Date) throw new CanonicalizeError('Date rejected (non-deterministic)');
  if (value instanceof Map) throw new CanonicalizeError('Map rejected (non-deterministic order)');
  if (value instanceof Set) throw new CanonicalizeError('Set rejected (non-deterministic order)');
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new CanonicalizeError('cyclic structure rejected');
    seen.add(value);
    try {
      let out = '[';
      for (const item of value) out += canonicalize(item, seen);
      out += ']';
      return out;
    } finally {
      seen.delete(value);
    }
  }
  if (!isPlainObject(value)) {
    const name = (value as { constructor?: { name?: string } })?.constructor?.name ?? typeof value;
    throw new CanonicalizeError(`non-plain object rejected (${name})`);
  }
  if (seen.has(value)) {
    throw new CanonicalizeError('cyclic structure rejected');
  }
  seen.add(value);
  try {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    let out = '{';
    for (const key of keys) {
      const encKey = canonicalize(key, seen);
      const encVal = canonicalize((value as Record<string, unknown>)[key], seen);
      out += `${encKey}:${encVal};`;
    }
    out += '}';
    return out;
  } finally {
    seen.delete(value);
  }
}

/** Hash a plain-data value to a uint32 (FNV-1a-32 over its canonical string). */
export function hashState(value: unknown): number {
  return fnv1a32(canonicalize(value));
}
