# Proposal: 019-versioned-codec-framework

## Problem

Persistent and network-exchanged data currently have no shared, version-aware, integrity-checked
serialization layer. Each consumer hand-rolls JSON with no schema version, no forward/backward
tolerance, and no tamper detection, so data saved by a future build cannot be recognized or safely
rejected by an older one.

## Goals

- Provide a generic `VersionedCodec<T>` that stamps data with a schema version and dispatches to
  per-version (de)serializers.
- Guarantee backward compatibility: a newer codec decodes data written by any known older version.
- Reject forward-incompatible data (version newer than the codec knows) explicitly.
- Add an integrity checksum so tampered/corrupt payloads are detected on decode.
- Validate payload shape per version.

## Non-goals

- No specific game schema (saves, chunks, packets); this is the reusable primitive only.
- No compression, encryption, or transport wiring.

## Preconditions

018 is VERIFIED. Pure TypeScript, no new external dependency.

## Dependencies

- None beyond the standard library (uses `JSON`).

## Proposed change

Add `src/data/VersionedCodec.ts` with `VersionedCodec`, `CodecError`, envelope types, FNV-1a
checksum, and safe `tryDecode`. Gameplay-free and consumer-free.

## Compatibility and migration

No existing code or persisted data changes. Purely additive data infrastructure.

## Risks

- Over-scoping into concrete save formats. Mitigated by the explicit non-goal of no game schema.

## Rollback strategy

Additive module; reverting the commit removes it with no downstream impact.

## Definition of Done

Versioned codec, checksum, version tolerance, and tests are complete; full regression gate is
green.

## Advancement gate

020 starts only after 019 is 100% complete and VERIFIED.
