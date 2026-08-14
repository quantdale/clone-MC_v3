# Design: 019-versioned-codec-framework

## Context / current state

Persistent and network data are serialized ad-hoc (typically `JSON.stringify`) with no version
marker and no integrity check. There is no shared contract for how an older client rejects newer
data or how a newer client reads older data. This change introduces the reusable primitive.

## Target state

`src/data/VersionedCodec.ts` provides a generic, version-stamped, integrity-checked codec:

- Each codec instance owns a `currentVersion` and a map of per-version (de)serializers.
- `encode(value, version?)` produces a JSON envelope `{ v, d, c? }` where `v` is the schema
  version, `d` is the version-specific encoded payload, and `c` is a checksum of the canonical
  envelope body.
- `decode(text)` parses the envelope, enforces version tolerance and checksum, dispatches to the
  matching decoder, and returns the typed value.
- `tryDecode(text)` is a non-throwing variant returning `{ ok, value }` or `{ ok, error }`.

## Invariants

- `currentVersion` MUST have a registered (de)serializer.
- Encoded envelopes MUST carry a positive integer `v`.
- A decode MUST reject `v > currentVersion` with `UNSUPPORTED_VERSION` (no forward guessing).
- A decode MUST accept any `v <= currentVersion` for which a decoder exists (backward compatible);
  an unknown older `v` MUST fail with `INVALID_FORMAT`.
- When checksums are enabled, a mismatch MUST fail with `INVALID_CHECKSUM`.
- A decode MUST fail with `INVALID_FORMAT` if the envelope is malformed or not JSON.
- A version decoder MAY throw `SCHEMA_ERROR` for an internally malformed payload.

## API and data model

```ts
export type CodecVersion = number;

export interface VersionedEnvelope {
  readonly v: CodecVersion;
  readonly d: unknown;
  readonly c?: number;
}

export type CodecErrorReason =
  | 'UNSUPPORTED_VERSION' | 'INVALID_FORMAT' | 'INVALID_CHECKSUM' | 'SCHEMA_ERROR';

export class CodecError extends Error {
  readonly reason: CodecErrorReason;
}

export interface VersionedSerializers<T> {
  encode(value: T): unknown;
  decode(data: unknown): T;
}

export interface VersionedCodecOptions<T> {
  readonly currentVersion: CodecVersion;
  readonly codecs: Readonly<Record<CodecVersion, VersionedSerializers<T>>>;
  readonly enableChecksum?: boolean;       // default true
}

export class VersionedCodec<T> {
  constructor(options: VersionedCodecOptions<T>);
  encode(value: T, version?: CodecVersion): string;
  decode(text: string): T;
  tryDecode(text: string): { ok: true; value: T } | { ok: false; error: CodecError };
  readonly currentVersion: CodecVersion;
}

export function fnv1a32(input: string): number;
```

The checksum is FNV-1a (32-bit) over the canonical `JSON.stringify({ v, d })`, deterministic and
dependency-free.

## Control / data flow

`encode` selects `codecs[version ?? currentVersion]`, runs `encode`, builds `{ v, d }`, computes
`c = fnv1a32(canonical)` when checksums are enabled, and returns `JSON.stringify(envelope)`.
`decode` parses JSON, validates envelope shape, checks `v`, verifies checksum (if present in the
envelope), and runs `codecs[v].decode(d)`. All failures are explicit `CodecError`s.

## Failure modes

- Malformed/non-JSON or missing `v`/`d` -> `INVALID_FORMAT`.
- `v > currentVersion` (and no decoder) -> `UNSUPPORTED_VERSION`.
- `v` absent from `codecs` -> `INVALID_FORMAT`.
- Checksum mismatch -> `INVALID_CHECKSUM`.
- Decoder rejects payload shape -> `SCHEMA_ERROR`.

## Compatibility / migration

Purely additive infrastructure; no persisted or call-site changes. The framework is the foundation
for future versioned saves/packets (020+).

## Performance / resource constraints

O(payload) serialization/checksum; no allocations beyond the JSON and envelope; deterministic.

## Testing seams

`tests/unit/VersionedCodec.test.ts` covers round-trip at current version, backward decode of an
older version via a registered older codec, forward rejection (UNSUPPORTED_VERSION), checksum
tamper (INVALID_CHECKSUM), malformed envelope (INVALID_FORMAT), per-version schema-error path, and
`tryDecode` success/failure.

## Affected files / symbols

- `src/data/VersionedCodec.ts` (new)
- `tests/unit/VersionedCodec.test.ts` (new)

## Rejected alternatives

- Tagging inside the payload instead of an envelope: an explicit `v` field at the envelope root is
  unambiguous and easy to validate before touching the payload.
- Hash (SHA) over crypto: FNV-1a is deterministic, dependency-free, and sufficient for tamper
  detection at this layer.

## Downstream dependencies

020 (resource-data loader) and future save/packet formats build versioned, integrity-checked
serialization on top of this primitive.
