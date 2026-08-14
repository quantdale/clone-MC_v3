/**
 * Versioned, integrity-checked codec framework (change 019).
 *
 * A `VersionedCodec<T>` stamps data with a schema version inside an envelope, dispatches to
 * per-version (de)serializers, and verifies an FNV-1a checksum on decode. It guarantees backward
 * compatibility (a newer codec decodes older known versions) and explicitly rejects forward-
 * incompatible versions. This is the reusable primitive for future versioned saves and packets;
 * no game schema is defined here.
 */

/** A positive integer schema version. */
export type CodecVersion = number;

/** Wire envelope: schema version, version-specific payload, optional checksum. */
export interface VersionedEnvelope {
  readonly v: CodecVersion;
  readonly d: unknown;
  readonly c?: number;
}

/** Failure reason for codec operations. */
export type CodecErrorReason =
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_FORMAT'
  | 'INVALID_CHECKSUM'
  | 'SCHEMA_ERROR';

/** Thrown when encode/decode fails validation. */
export class CodecError extends Error {
  readonly reason: CodecErrorReason;

  constructor(reason: CodecErrorReason, detail: string) {
    super(`Codec error (${reason}): ${detail}`);
    this.name = 'CodecError';
    this.reason = reason;
  }
}

/** Per-version (de)serializers for a typed value. */
export interface VersionedSerializers<T> {
  encode(value: T): unknown;
  decode(data: unknown): T;
}

/** Construction options for a {@link VersionedCodec}. */
export interface VersionedCodecOptions<T> {
  readonly currentVersion: CodecVersion;
  readonly codecs: Readonly<Record<CodecVersion, VersionedSerializers<T>>>;
  /** Whether to embed/verify a checksum. Default true. */
  readonly enableChecksum?: boolean;
}

/** Result of a safe decode. */
export type TryDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CodecError };

/** Deterministic 32-bit FNV-1a hash over a string. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit space
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function canonicalBody(v: CodecVersion, d: unknown): string {
  return JSON.stringify({ v, d });
}

/**
 * Generic versioned codec with integrity checking and version tolerance.
 */
export class VersionedCodec<T> {
  private readonly current: CodecVersion;
  private readonly codecs: Readonly<Record<CodecVersion, VersionedSerializers<T>>>;
  private readonly useChecksum: boolean;

  constructor(options: VersionedCodecOptions<T>) {
    this.current = options.currentVersion;
    this.codecs = options.codecs;
    this.useChecksum = options.enableChecksum ?? true;
    if (!this.codecs[this.current]) {
      throw new CodecError('INVALID_FORMAT', `no serializer registered for currentVersion ${this.current}`);
    }
  }

  /** The schema version produced by default by this codec. */
  get currentVersion(): CodecVersion {
    return this.current;
  }

  /** Encode a value into a JSON envelope string. */
  encode(value: T, version: CodecVersion = this.current): string {
    const serializer = this.codecs[version];
    if (!serializer) {
      throw new CodecError('UNSUPPORTED_VERSION', `no serializer registered for version ${version}`);
    }
    const d = serializer.encode(value);
    let c: number | undefined;
    if (this.useChecksum) {
      c = fnv1a32(canonicalBody(version, d));
    }
    const envelope: VersionedEnvelope = { v: version, d, ...(c === undefined ? {} : { c }) };
    return JSON.stringify(envelope);
  }

  /** Decode an envelope string into a typed value, throwing on any failure. */
  decode(text: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new CodecError('INVALID_FORMAT', 'envelope is not valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new CodecError('INVALID_FORMAT', 'envelope is not an object');
    }
    const env = parsed as Partial<VersionedEnvelope>;
    if (typeof env.v !== 'number' || !Number.isInteger(env.v) || env.v <= 0) {
      throw new CodecError('INVALID_FORMAT', 'envelope missing valid version');
    }
    if (!('d' in env)) {
      throw new CodecError('INVALID_FORMAT', 'envelope missing payload');
    }
    if (env.v > this.current) {
      throw new CodecError('UNSUPPORTED_VERSION', `envelope version ${env.v} exceeds current ${this.current}`);
    }
    const serializer = this.codecs[env.v];
    if (!serializer) {
      throw new CodecError('INVALID_FORMAT', `no serializer registered for version ${env.v}`);
    }
    if (this.useChecksum && env.c !== undefined) {
      const expected = fnv1a32(canonicalBody(env.v, env.d));
      if (expected !== env.c) {
        throw new CodecError('INVALID_CHECKSUM', 'envelope checksum mismatch');
      }
    }
    try {
      return serializer.decode(env.d);
    } catch (err) {
      if (err instanceof CodecError) {
        throw err;
      }
      throw new CodecError('SCHEMA_ERROR', err instanceof Error ? err.message : String(err));
    }
  }

  /** Non-throwing decode returning a structured result. */
  tryDecode(text: string): TryDecodeResult<T> {
    try {
      return { ok: true, value: this.decode(text) };
    } catch (err) {
      if (err instanceof CodecError) {
        return { ok: false, error: err };
      }
      return { ok: false, error: new CodecError('SCHEMA_ERROR', err instanceof Error ? err.message : String(err)) };
    }
  }
}
