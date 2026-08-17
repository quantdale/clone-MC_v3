/**
 * Deterministic state hashing for the replay suite (241). `canonicalize` produces an
 * order-independent, deterministic string encoding of any plain-data value (object keys are
 * emitted in ascending UTF-16 code-unit order), and `hashState` folds that canonical string
 * through the pinned FNV-1a 32-bit algorithm (the same algorithm SeedRng uses) and returns a
 * uint32. `REPLAY_HASH_VERSION` pins the triple (canonicalization encoding, hash algorithm,
 * authoritative snapshot semantics); changing any of them MUST bump the version and re-pin the
 * default replay fixtures (102 GOLDEN_VERSION convention). Pure and headless-safe: no IO, no
 * mutable shared state.
 */

/** Pins the canonicalization encoding, the hash algorithm, and the authoritative snapshot semantics. */
export const REPLAY_HASH_VERSION = 'v1';

/** FNV-1a 32-bit over a string's UTF-16 code units (matches SeedRng.hashString). */
function fnv1a32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Recursive canonical encoding. `active` tracks the object/array stack to reject cyclic
 * structures. Throws a descriptive `StateHasher: ...` error on any non-deterministic value
 * rather than emitting an ambiguous encoding.
 */
function canon(value: unknown, active: Set<object>): string {
  if (value === null) return 'N';
  if (value === undefined) return 'U';
  const t = typeof value;
  if (t === 'boolean') return value ? 'T' : 'F';
  if (t === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`StateHasher: non-deterministic number ${String(value)} cannot be hashed`);
    }
    return Number.isInteger(value) ? `i${value}` : `f${value}`;
  }
  if (t === 'string') return `s${value.length}:${value}`;
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throw new Error(`StateHasher: ${t} values are not deterministic and cannot be hashed`);
  }
  // t === 'object' from here on.
  if (value instanceof Date) throw new Error('StateHasher: Date values are not plain data');
  if (value instanceof Map) throw new Error('StateHasher: Map values are not plain data');
  if (value instanceof Set) throw new Error('StateHasher: Set values are not plain data');
  if (active.has(value)) throw new Error('StateHasher: cyclic structure cannot be hashed');
  active.add(value);
  try {
    if (Array.isArray(value)) {
      let out = '[';
      for (const element of value) out += canon(element, active);
      out += ']';
      return out;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error('StateHasher: class instances are not plain data');
    }
    const record = value as Record<string, unknown>;
    // Ascending UTF-16 code-unit order (default JS string comparison is UTF-16 based).
    const keys = Object.keys(record).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    let out = '{';
    for (const key of keys) {
      out += canon(key, active) + ':' + canon(record[key], active) + ';';
    }
    out += '}';
    return out;
  } finally {
    active.delete(value);
  }
}

/**
 * Order-independent canonical string encoding of a plain-data value. Throws a descriptive
 * `StateHasher: ...` error for NaN, ±Infinity, functions, symbols, bigint, class instances,
 * cyclic structures, Map/Set, and Date.
 */
export function canonicalize(value: unknown): string {
  return canon(value, new Set<object>());
}

/**
 * Deterministic uint32 hash of a value: FNV-1a 32-bit over the UTF-16 code units of
 * `canonicalize(value)`. Throws if `canonicalize` throws; otherwise always returns a uint32 in
 * `[0, 0xffffffff]`.
 */
export function hashState(value: unknown): number {
  return fnv1a32(canonicalize(value));
}
