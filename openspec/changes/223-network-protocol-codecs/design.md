# Design: 223-network-protocol-codecs

## Context/current state
- 222 declared which simulation modules are shareable; the wire contract itself is undefined.
  223 adds the versioned message registry + codecs + compatibility rules; 224's server tick loop
  and multiplayer wiring transport the envelopes.

## Target state
- `src/simulation/NetworkProtocol.ts` holding the registry, the codecs, and the compatibility
  rules.

## Invariants
- Pure and headless-safe: no transport, no mutation of inputs, no IO.
- Protocol: positive-integer `version`; unique non-negative integer message ids; unique
  non-empty message names; per message, unique field names and types in
  `int|float|string|bool`.
- `encodeMessage`/`decodeMessage` are total (null on failure, never throw); type rules: int =
  safe integer, float = finite number, string = string, bool = boolean; field counts exact.
- `protocolCompatibility(a, b)`: compatible iff versions match AND every message id in a exists
  in b with the same name AND vice versa.

## API and data model
```ts
// src/simulation/NetworkProtocol.ts (new)
export type WireValue = boolean | number | string;
export type ProtocolFieldType = 'int' | 'float' | 'string' | 'bool';
export interface ProtocolField { name: string; type: ProtocolFieldType; }
export interface ProtocolMessage { id: number; name: string; fields: readonly ProtocolField[]; }
export interface NetworkProtocol { version: number; messages: readonly ProtocolMessage[]; }
export function createNetworkProtocol(version: number, messages: readonly ProtocolMessage[]): NetworkProtocol;

export interface WireEnvelope { messageId: number; values: readonly WireValue[]; }
export function encodeMessage(protocol: NetworkProtocol, name: string, values: Readonly<Record<string, WireValue>>): WireEnvelope | null;
export function decodeMessage(protocol: NetworkProtocol, wire: WireEnvelope): { name: string; values: Readonly<Record<string, WireValue>> } | null;

export type CompatibilityResult = { compatible: true } | { compatible: false; reason: string };
export function protocolCompatibility(a: NetworkProtocol, b: NetworkProtocol): CompatibilityResult;
```

## Control/data flow
1. Client and server build the same protocol registry (deterministic construction).
2. Outgoing: `encodeMessage` produces the envelope; incoming: `decodeMessage` validates and
   restores; the transport never sees message names.
3. Handshake: `protocolCompatibility` rejects mismatched peers.

## Detailed behavior
- `createNetworkProtocol` rejections (each `NetworkProtocol: <detail>`): version not a positive
  integer -> `version must be a positive integer`; `messages` not an array ->
  `messages must be an array`; per message: `messages <i>.id` not a non-negative integer ->
  `messages <i>.id must be a non-negative integer`; duplicate id -> `duplicate message id <id>`;
  empty name -> `messages <i>.name must be a non-empty string`; duplicate name ->
  `duplicate message name <name>`; `fields` not an array -> `messages <i>.fields must be an
  array`; per field: empty name -> `messages <i>.fields <j>.name must be a non-empty string`;
  duplicate field name -> `messages <i> has duplicate field <name>`; unknown type ->
  `messages <i>.fields <j>.type must be int, float, string, or bool`.
- `encodeMessage`: unknown name -> null; value count/names must match the field list exactly
  (missing or extra -> null); each value must match its field type -> null.
- `decodeMessage`: unknown message id -> null; value count mismatch -> null; each value type-
  checked against the field -> null.
- `protocolCompatibility`: version mismatch -> `version mismatch (<a> != <b>)`; an id in a
  missing from b -> `missing message id <id>`; an id present in both with different names ->
  `message id <id> name mismatch (<a> != <b>)`; same checks for b against a; else compatible.

## Failure modes
- Construction throws descriptively; codecs and compatibility are total.

## Compatibility/migration
- One new simulation file; zero registry changes; no `Game.ts` edit; no save-format change.

## Performance/resource constraints
- Codecs O(fields); compatibility O(messages).

## Testing seams
- Tests drive the codecs with exact payloads and pin every failure class.

## Observability/debugging
- Protocols and envelopes are plain immutable objects.

## Affected files/symbols
- `src/simulation/NetworkProtocol.ts` (new).
- Tests: `tests/unit/NetworkProtocol.test.ts` (new). No other files.

## Rejected alternatives
- **Binary buffers**: rejected — a plain-JS envelope keeps the codec pure and deterministic;
  transport framing is a later concern.

## Downstream dependencies
- 224 (`dedicated-server-tick-loop`) transports envelopes; the multiplayer wiring runs the
  handshake; 242's e2e exercises encode/decode round-trips.
