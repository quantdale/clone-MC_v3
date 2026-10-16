# Tasks: 223-network-protocol-codecs

## Implementation
- [x] `src/simulation/NetworkProtocol.ts`: `ProtocolFieldType` / `ProtocolField` /
      `ProtocolMessage` / `NetworkProtocol` + `createNetworkProtocol` (version, unique ids/
      names, field validation; descriptive throws).
- [x] `encodeMessage` (field-order envelope; null on unknown name/count/type) /
      `decodeMessage` (round-trip; null on unknown id/count/type).
- [x] `protocolCompatibility` (bidirectional id/name rules with reasons).

## Tests
- [x] `tests/unit/NetworkProtocol.test.ts`: creation + every rejection.
- [x] Encoding (success, unknown name, missing/extra fields, per-kind type mismatches incl.
      NaN).
- [x] Decoding (round-trip, unknown id, count, extra, type).
- [x] Compatibility (identical, version mismatch, missing id, name mismatch, empty protocols).

## Verification
- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] New test file passes in isolation.
- [x] Full `npm test` passes (no regression against the prior 2861/2861 baseline).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes (existing 22/22 assertions unaffected).

## Checkpoint
- [x] `verification.md` updated with real evidence; status VERIFIED.
- [x] `openspec/PROGRAM_STATE.json` / `.md` updated (next change pointer to
      224-dedicated-server-tick-loop).
- [x] Committed and pushed to `origin/main`; local HEAD verified equal to `origin/main`.
