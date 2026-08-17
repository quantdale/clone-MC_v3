# Spec: state-hash-scheme

## Contract

The suite MUST summarize authoritative simulation state as a deterministic, order-independent uint32
hash under a versioned scheme. `canonicalize(value)` MUST produce a deterministic string for any
supported plain-data value regardless of object-key insertion order, using the pinned encodings.
`hashState(value)` MUST return a uint32 computed with the pinned FNV-1a-32 algorithm over the canonical
string. `REPLAY_HASH_VERSION` MUST pin the triple (canonicalization encoding, hash algorithm, snapshot
semantics); changing any of them MUST bump the version. The authoritative state hashed per tick is the
ordered per-system snapshot array (`HarnessSnapshot`).

## Definitions

- **Canonical string**: the order-independent encoding of a state value produced by `canonicalize`.
- **Authoritative state**: the `HarnessSnapshot` `{ tick, systems }` from the 055 harness, where
  `systems[i]` is system `i`'s `snapshot()` in registration order.
- **REPLAY_HASH_VERSION**: `'v1'` — pins the canonicalization encoding, the FNV-1a-32 hash algorithm,
  and the authoritative-state (snapshot) semantics.

## Invariants

- Equal canonical strings hash to equal uint32 values; equal state values canonicalize to equal
  strings.
- `canonicalize` is independent of object-key insertion order and of property order.
- Non-deterministic values (`NaN`, `±Infinity`, functions, symbols, `bigint`, class instances, cyclic
  structures, `Map`/`Set`, `Date`) are rejected, never encoded ambiguously.
- `hashState` returns a uint32 (`0..0xffffffff`).
- The same state value hashed in two independent invocations yields equal hashes (cross-run stability).

## Requirements

### Requirement: order-independent canonicalization
`canonicalize` MUST produce the same string for a plain-data value regardless of the order in which its
object keys were inserted, using exactly the pinned encodings: `null`→`N`, `undefined`→`U`,
`true`→`T`, `false`→`F`, integer number→`i<decimal>`, non-integer finite number→`f<Number(v)>`,
string→`s<length>:<utf16>`, array→`[<elem>*]`, and object→`{<key-sorted-ascending-by-utf16>` +
`<encoded key>:<encoded value>;` per key + `}`.

#### Scenario: insertion-order independence
- **GIVEN** two objects with identical key/value pairs but constructed in different key insertion orders
- **WHEN** `canonicalize` runs on each
- **THEN** the canonical strings are equal.

#### Scenario: type encodings and nesting
- **GIVEN** a value mixing null, undefined, booleans, integer and fractional numbers, negative numbers,
  strings (including unicode), arrays, and nested objects
- **WHEN** `canonicalize` runs
- **THEN** it produces the documented concatenated encoding with object keys emitted in ascending UTF-16
  code-unit order and arrays in element order.

### Requirement: hash function
`hashState` MUST compute FNV-1a 32-bit over the UTF-16 code units of `canonicalize(value)` and return
the result as a uint32. Identical canonical strings MUST hash to equal values.

#### Scenario: equal canonical hashes equal
- **GIVEN** two equal state values
- **WHEN** `hashState` runs on each
- **THEN** the hashes are equal and each is in `[0, 0xffffffff]`.

#### Scenario: known-value pin
- **GIVEN** a fixed, simple state value
- **WHEN** `hashState` runs
- **THEN** it returns the exact pinned uint32 recorded for that value under `REPLAY_HASH_VERSION = 'v1'`
  (asserted in `tests/unit/StateHasher.test.ts`).

### Requirement: what is hashed
The per-tick authoritative hash MUST be computed over the canonical form of the full ordered snapshot:
`hashState({ tick, systems })`. Two snapshots with the same per-system states in a different order MUST
hash differently. An empty systems snapshot MUST hash deterministically.

#### Scenario: authoritative hash reflects system order
- **GIVEN** two snapshots with identical per-system states but the two systems swapped in array order
- **WHEN** `hashState` runs on each
- **THEN** the hashes differ.

#### Scenario: empty snapshot
- **GIVEN** a snapshot with zero systems
- **WHEN** `hashState` runs twice
- **THEN** both results are equal and deterministic.

### Requirement: versioning and stability
`REPLAY_HASH_VERSION` MUST pin the canonicalization encoding, the hash algorithm, and the snapshot
semantics. A change to any of the three MUST bump the version. Fixtures are tagged with the version, and
traces/fixtures under different versions MUST NOT be compared (the comparison MUST be reported as a
version mismatch by the verifier).

#### Scenario: same-version comparison is allowed
- **GIVEN** two traces both tagged `REPLAY_HASH_VERSION`
- **WHEN** they are compared
- **THEN** the comparison is a normal hash/identical comparison, not a version mismatch.

#### Scenario: cross-version comparison is refused
- **GIVEN** an expected trace tagged `v1` and an actual trace tagged a different version
- **WHEN** they are compared
- **THEN** the comparison reports a `version_mismatch` and does not attempt a hash comparison.

### Requirement: cross-run stability
Hashing the same state value in two independent invocations (including separate fresh processes) MUST
yield equal hashes.

#### Scenario: repeated and cross-run hashing
- **GIVEN** the same state value
- **WHEN** `hashState` runs twice within a test and again in a fresh process/run
- **THEN** all results are equal.

### Requirement: non-deterministic value rejection
`canonicalize` MUST throw a descriptive error for `NaN`, `+Infinity`, `-Infinity`, functions, symbols,
`bigint`, class instances, cyclic structures, `Map`/`Set`, and `Date`, rather than emit a string that
could differ between runs.

#### Scenario: NaN and infinities
- **GIVEN** a state value containing `NaN`, and separately `+Infinity` and `-Infinity`
- **WHEN** `canonicalize` runs on each
- **THEN** each throws a descriptive error.

#### Scenario: cyclic and non-plain values
- **GIVEN** a cyclic object, a function-valued object, and a `Date` instance
- **WHEN** `canonicalize` runs on each
- **THEN** each throws a descriptive error naming the offending value.

## Error and failure behavior

- `canonicalize` throws on non-deterministic values; it never returns an ambiguous encoding.
- `hashState` throws if `canonicalize` throws; otherwise it always returns a uint32.
- Cross-version comparisons are surfaced as `version_mismatch` rather than a hash divergence.

## Performance and resource bounds

`canonicalize`/`hashState` are O(state size) single-pass with no allocation beyond the canonical string
and result. The suite is test-only and not on hot paths.

## Compatibility and migration

Additive. `REPLAY_HASH_VERSION` binds the scheme; future changes to canonicalization, the hash
algorithm, or snapshot semantics MUST bump it and deliberately re-pin `createDefaultReplayFixtures`
(102 `GOLDEN_VERSION` convention). No stored game data changes.

## Security and integrity

Rejecting non-deterministic values and canonicalizing independent of key order ensures the hash is a
reliable determinism signal across runs, platforms, and JSON round-trips.

## Observability

`REPLAY_HASH_VERSION` is exposed; `canonicalize` output is inspectable for debugging a divergence.

## Verification mapping

| Requirement | Test |
|---|---|
| Order-independent canonicalization | `tests/unit/StateHasher.test.ts` — insertion-order independence; encodings/nesting |
| Hash function | equal canonical → equal hash; known-value pin; uint32 range |
| What is hashed | system-order sensitivity; empty snapshot |
| Versioning and stability | same-version compare; cross-version `version_mismatch` |
| Cross-run stability | repeated + cross-run hashing equal |
| Non-deterministic value rejection | NaN/±Infinity; cycle/function/Date rejection |
