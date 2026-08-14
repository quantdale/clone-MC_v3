# Spec: versioned-codec

## Contract

`versioned-codec` provides a generic, version-stamped, integrity-checked serialization primitive.
A `VersionedCodec<T>` dispatches to per-version (de)serializers, embeds a schema version in an
envelope, verifies an FNV-1a checksum on decode, and enforces backward acceptance / forward
rejection of versions. No game schema is included.

## Definitions

- **CodecVersion**: a positive integer schema version.
- **VersionedEnvelope**: `{ v, d, c? }` where `v` is the version, `d` is the version-specific payload, and `c` is an optional checksum of the canonical envelope body.
- **CodecError**: explicit failure with a `reason`.

## Invariants

- `currentVersion` MUST have a registered (de)serializer.
- Envelopes MUST carry a positive integer `v`.
- Decode MUST reject `v > currentVersion` with `UNSUPPORTED_VERSION`.
- Decode MUST accept any `v <= currentVersion` that has a registered decoder (backward compatible);
  an unknown older `v` MUST fail with `INVALID_FORMAT`.
- When the envelope carries `c`, a mismatch MUST fail with `INVALID_CHECKSUM`.
- A malformed / non-JSON envelope MUST fail with `INVALID_FORMAT`.
- A version decoder MAY throw `SCHEMA_ERROR` for an internally malformed payload.

## Requirements

### Requirement: encode and decode round-trip at the current version
`encode` produces a parseable envelope that `decode` reconstructs exactly.

#### Scenario: round-trips a value
- **GIVEN** a codec with `currentVersion: 2` and serializers for `2`
- **WHEN** a value is encoded then decoded
- **THEN** the decoded value equals the original

### Requirement: backward compatibility decodes older versions
A codec MUST decode data written by any registered older version.

#### Scenario: decodes a v1 envelope with a v2 codec
- **GIVEN** a codec with serializers for `1` and `2`, `currentVersion: 2`
- **WHEN** a v1 envelope is decoded
- **THEN** the value is reconstructed via the v1 decoder

### Requirement: forward-incompatible data is rejected
A codec MUST reject an envelope whose version exceeds every known decoder.

#### Scenario: rejects a newer version
- **GIVEN** a codec with `currentVersion: 2` knowing only `1` and `2`
- **WHEN** an envelope with `v: 3` is decoded
- **THEN** decode throws `UNSUPPORTED_VERSION`

### Requirement: integrity is enforced via checksum
When an envelope carries a checksum, decode MUST verify it and reject tampering.

#### Scenario: detects a tampered payload
- **GIVEN** an encoded envelope
- **WHEN** its `d` is altered and it is decoded with checksum enabled
- **THEN** decode throws `INVALID_CHECKSUM`

#### Scenario: rejects a malformed envelope
- **GIVEN** a non-JSON or shape-invalid string
- **WHEN** it is decoded
- **THEN** decode throws `INVALID_FORMAT`

### Requirement: tryDecode never throws
`tryDecode` MUST return a structured result instead of throwing.

#### Scenario: success path
- **GIVEN** a valid envelope
- **WHEN** `tryDecode` is called
- **THEN** it returns `{ ok: true, value }`

#### Scenario: failure path
- **GIVEN** a corrupt envelope
- **WHEN** `tryDecode` is called
- **THEN** it returns `{ ok: false, error }` and does not throw

## Error and failure behavior

All decode failures MUST be explicit `CodecError`s; `tryDecode` converts them to a structured result.

## Performance and resource bounds

Serialization and checksum are O(payload); deterministic; no external dependencies.

## Compatibility and migration

Purely additive infrastructure; no persisted or call-site changes.

## Security and integrity

FNV-1a checksum detects accidental corruption and casual tampering at the codec layer; it is
integrity, not a security boundary.

## Observability

Version and checksum are embedded in every envelope, making stored/transmitted data self-describing.

## Verification mapping

- Envelope, version tolerance, checksum, tryDecode -> `tests/unit/VersionedCodec.test.ts`
- Full gate -> typecheck, lint, unit, build, e2e
