# Proposal: 223-network-protocol-codecs

## Problem
222 declared the shareable boundary; nothing defines the wire contract between client and
server: no versioned message registry, no codecs, no compatibility rules. 224's server tick
loop and any multiplayer wiring need the protocol layer.

## Goals
- `src/simulation/NetworkProtocol.ts` (NEW), pure and headless-safe:
  - **Registry**: `NetworkProtocol { version, messages }` with
    `ProtocolMessage { id, name, fields }` — `createNetworkProtocol` validates: positive-integer
    version, unique non-negative integer message ids, unique non-empty message names, unique
    field names, and field types `int|float|string|bool`.
  - **Codecs**: `encodeMessage(protocol, name, values)` — a typed record into the wire envelope
    `{ messageId, values }` (field order), `null` for unknown names, wrong field counts, or type
    mismatches; `decodeMessage(protocol, wire)` — the inverse into
    `{ name, values: Record }`, `null` for unknown ids, wrong counts, or type mismatches.
    Type rules: `int` = safe integer, `float` = finite number, `string` = string, `bool` =
    boolean.
  - **Compatibility**: `protocolCompatibility(a, b)` — compatible iff the versions match AND
    every message id in each protocol exists in the other with the SAME name (bidirectional);
    otherwise `{ compatible: false, reason }` naming the first mismatch.

## Non-goals
- **No transport/WebSocket code** (the wiring transports envelopes), **no compression/framing**,
  **no change to 222**, **no `Game.ts` edit**, **no save-format change**.

## Preconditions
- Change 222 (`shared-simulation-package-boundary`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None beyond the standard library (the envelope is a plain JS object).

## Proposed change
1. `src/simulation/NetworkProtocol.ts` (NEW): the message registry, codecs, and compatibility
   rules.

## Compatibility and migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Risks
- **Codec drift from the wire contract**. Mitigation: every encode/decode failure class and the
  exact type rules are pinned in tests.

## Rollback strategy
One new simulation file with no other changes; reverting removes the feature cleanly.

## Definition of Done
- All functions implemented per design.md/spec.md.
- Unit tests cover: protocol creation + every rejection; encode (success, unknown name, wrong
  count, type mismatches per kind); decode (round-trip, unknown id, wrong count, type
  mismatches); compatibility (equal protocols, version mismatch, missing id, name mismatch);
  empty protocols.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
