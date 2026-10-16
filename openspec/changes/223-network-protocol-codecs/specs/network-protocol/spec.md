# Spec: network-protocol

## Contract
This capability adds the versioned network protocol layer: a validated message registry, typed
encode/decode codecs over a plain-JS wire envelope, and bidirectional compatibility rules —
pure and headless-safe.

## Definitions
- **Message**: `{ id, name, fields }` with typed fields (`int|float|string|bool`).
- **Protocol**: `{ version, messages }`.
- **Envelope**: `{ messageId, values }` — the wire form; names never cross the wire.

## Invariants
- Pure and headless-safe: no transport, no mutation of inputs.
- `version` MUST be a positive integer; message ids MUST be unique non-negative integers; names
  MUST be unique and non-empty; field names MUST be unique per message; field types MUST be one
  of the four.
- Codecs MUST be total (null on failure, never throw); `int` = safe integer, `float` = finite
  number, `string` = string, `bool` = boolean; field counts MUST match exactly.
- Compatibility: versions equal AND every message id in each protocol exists in the other with
  the same name.

## Requirements

### Requirement: protocol creation
`createNetworkProtocol(version, messages)` MUST return a validated protocol.

#### Scenario: creation
- **GIVEN** version 1 with messages `move` (id 1, fields x:int, y:float, name:string) and
  `jump` (id 2, field active:bool)
- **THEN** the protocol holds both messages in order

### Requirement: protocol rejections
Construction MUST throw a descriptive `Error` for a non-positive version, a non-array `messages`,
a non-integer/negative message id, duplicate message ids, empty/duplicate message names, a
non-array `fields`, empty/duplicate field names, and unknown field types.

#### Scenario: rejections
- **GIVEN** versions 0 and 1.5; ids -1 and a duplicate 1; names `''` and a duplicate `move`;
  fields `'x'`; field names `''` and a duplicate; a type `'byte'`
- **THEN** each throws mentioning `version must be a positive integer`, `messages must be an
  array`, `must be a non-negative integer`, `duplicate message id`, `must be a non-empty
  string`, `duplicate message name`, `must be an array`, `duplicate field`, and `must be int,
  float, string, or bool` respectively

### Requirement: encoding
`encodeMessage(protocol, name, values)` MUST produce `{ messageId, values }` in field order for
an exact, type-correct record, and MUST return `null` for an unknown name, missing/extra fields,
and per-kind type mismatches.

#### Scenario: encoding
- **GIVEN** the creation scenario protocol and a `move` record `{ x: 1, y: 2.5, name: 'alex' }`
- **THEN** the envelope is `{ messageId: 1, values: [1, 2.5, 'alex'] }`; encoding `move` with
  `{ x: 1, y: 2.5 }` (missing), `{ x: 1, y: 2.5, name: 'a', z: 0 }` (extra), `{ x: 1.5, y:
  2.5, name: 'a' }` (float for int), `{ x: 1, y: NaN, name: 'a' }` (non-finite float), `{ x: 1,
  y: 2.5, name: 5 }` (number for string), `{ x: 1, y: 2.5, name: 'a', active: true }` on `jump`
  as `{ active: 'yes' }` (string for bool), and an unknown name all return null

### Requirement: decoding
`decodeMessage(protocol, wire)` MUST restore `{ name, values }` for a known id with an exact,
type-correct value list, and MUST return `null` for an unknown id, count mismatches, and type
mismatches.

#### Scenario: decoding
- **GIVEN** the creation scenario protocol and `{ messageId: 1, values: [1, 2.5, 'alex'] }`
- **THEN** the result is `{ name: 'move', values: { x: 1, y: 2.5, name: 'alex' } }`;
  `{ messageId: 9, values: [] }` (unknown id), `{ messageId: 1, values: [1, 2.5] }` (count),
  `{ messageId: 1, values: [1, 2.5, 'a', true] }` (extra), and `{ messageId: 1, values: [1.5,
  2.5, 'a'] }` (type) all return null

### Requirement: compatibility
`protocolCompatibility(a, b)` MUST be compatible iff the versions match and every message id in
each protocol exists in the other with the same name; otherwise `{ compatible: false, reason }`
naming the first mismatch.

#### Scenario: compatibility
- **GIVEN** two identical protocols, a version-2 copy, a copy missing message id 2, and a copy
  with message id 2 renamed
- **THEN** the identical pair is compatible; the version pair yields `version mismatch (1 != 2)`;
  the missing-id pair yields `missing message id 2`; the renamed pair yields
  `message id 2 name mismatch`; an empty protocol pair is compatible

## Error and failure behavior
- Construction throws descriptively; codecs and compatibility are total (null/false results).

## Performance and resource bounds
- Codecs O(fields); compatibility O(messages).

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Security and integrity
- Incoming envelopes are fully validated before any name is exposed.

## Observability
- Protocols and envelopes are plain immutable objects.

## Verification mapping
| Requirement | Test / command |
|---|---|
| REQ-1 creation | `tests/unit/NetworkProtocol.test.ts` › creation |
| REQ-2 rejections | › rejections |
| REQ-3 encoding | › encoding |
| REQ-4 decoding | › decoding |
| REQ-5 compatibility | › compatibility |
