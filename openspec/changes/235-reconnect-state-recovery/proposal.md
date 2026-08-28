# Proposal: 235-reconnect-state-recovery

## Problem

The multiplayer networking framework (223–231) replicates world state to connected clients as
delta streams: chunk updates (226), authoritative movement (227), entity replication deltas
(229), block interaction corrections (230), and revisioned inventory transactions (231). Each
of these is built as a per-connection, stateful component whose state advances monotonically
over a session. When a client disconnects and reconnects — whether cleanly or after a keepalive
drop — none of these components currently has a contract for what the reconnecting client may
keep, what must be discarded, and how it is brought back to the authoritative state. A client
that resumes a delta stream from an old session can apply stale transforms, re-issue an
inventory transaction against an outdated `stateId`, or miss chunk/entity/player deltas that
occurred while it was disconnected. This change defines the clean disconnect/reconnect and
client state resynchronization contract on top of the existing components.

## Goals

- A server-side session-epoch tracker that issues a new, monotonically increasing session epoch
  per connect, detects reconnects, ends a session on disconnect, and rejects any message tagged
  with a stale (previous-session) epoch — duplicate/replay and mid-transaction-disconnect
  protection for every sub-protocol.
- Server-side authoritative state signatures (profile, epoch, tick, player position, inventory
  `stateId`, interest chunk keys, tracked entity ids) and a deterministic
  `compareSignatures` that decides whether a reconnecting client needs a full resync.
- Server-side full-state snapshot assembly (`collectFullState`) that gathers the authoritative
  spawn position, full interest chunk snapshots, in-range entity spawn descriptors, and the full
  inventory window (slots/hotbar/cursor/`stateId`) into one validated, deterministic snapshot.
- Client-side replicated-state summary tracking and `applyFullState`, which replaces the
  client's summary wholesale, clears pending predictions, and returns a precise resync directive
  the caller applies to the movement/inventory/block reconcilers, chunk store, and entity store.
- Strict input validation, deterministic ordering, and descriptive `Reconnect: <detail>` throws
  consistent with 222–231 (`Module: <detail>`), on top of plain headless data.

## Non-goals

- No transport, socket, or wire framing (223 codecs and 225 lifecycle own connection framing).
- No new messages/codecs in `NetworkProtocol.ts`; the epoch is a field carried by existing
  message envelopes, and the full-state snapshot reuses the existing chunk/entity/inventory
  payload shapes rather than defining a new wire format.
- No changes to the internal behavior of 226/227/228/229/230/231 themselves; 235 composes them
  by invalidating and reseeding them, never by rewriting their validation rules.
- No server-world persistence or save lifecycle (234 `server-world-persistence` owns that).
- No load/adversarial validation (236 and 237 own those).

## Preconditions

- 231 `inventory-network-transactions` VERIFIED.
- The shared components 226/227/229/230/231 exist and each exposes the state accessors and
  `reset()`-style hooks documented in their designs, which 235's resync directive consumes.

## Dependencies

- A pure TypeScript module `src/simulation/ReconnectStateRecovery.ts` following the 222–231
  pattern (`Module: <detail>` throws, bounded limits, strict input validation, deterministic
  ordering). It imports the established snapshot types from 226 (`ChunkSnapshot`), 229
  (`EntitySpawnDescriptor`), and 231 (`ItemStack`) so the full-state snapshot reuses the exact
  payload shapes those components already consume.

## Proposed change

New module `src/simulation/ReconnectStateRecovery.ts`:

- `SessionEpoch` (non-negative safe integer) and `Position`.
- `ReconnectStateManager` (server): `connect(profile)` → `{ epoch, isReconnect }`; `disconnect(profile)`;
  `hasActiveSession(profile)`; `currentEpoch(profile)`; `isSessionCurrent(profile, epoch)` for
  stale-session/replay rejection; bounded epoch history; `collectFullState(profile, input)`.
- `ClientStateSignature` and `ServerStateSignature`; standalone `compareSignatures(client, server)`
  → `ResyncVerdict`.
- `InventorySnapshot`, `FullStateInput`, `FullStateSnapshot`.
- `ReconnectStateClient` (client): `connect(profile, epoch)`, `disconnect()`,
  `recordTick/recordPosition/recordInventoryStateId/setInterest/setEntities`, `signature()`,
  `applyFullState(snapshot)` → `ClientResyncDirective` (reset_movement, reset_inventory,
  clear_block_predictions, reset_chunks, reset_entities), `resyncPending`, `reset()`.

## Compatibility and migration

Pure addition. Zero registry changes, zero save-schema migrations, zero wire-format changes.
The full-state snapshot reuses existing chunk/entity/inventory payload types, so no existing
module's public surface changes. Existing 226–231 components are consumed via their existing
accessors and `reset()` hooks only.

## Risks

- Reconnecting client resumes an old delta stream → pinned: every message is tagged with its
  session epoch; `isSessionCurrent` rejects any non-current epoch, so no stale delta applies.
- Mid-transaction disconnect (pending movement intents, active inventory drag, pending block
  predictions) leaks into the new session → pinned: `collectFullState` returns the authoritative
  `stateId`, and `applyFullState` returns a directive that clears all pending predictions and
  reseeds the reconcilers, so nothing from the prior session is replayed.
- Duplicate/out-of-order snapshot delivery → pinned: snapshot application is idempotent and a
  snapshot with a non-current epoch is rejected.

## Rollback strategy

Delete `src/simulation/ReconnectStateRecovery.ts` and `tests/unit/ReconnectStateRecovery.test.ts`.

## Definition of Done

Spec requirements REQ-1..REQ-5 (reconnect-session) and REQ-1..REQ-5 (state-resynchronization)
verified by unit tests; baseline gate `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:e2e` all PASS; OpenSpec state updated and change advanced to
VERIFIED.

## Advancement gate

100% task completion; all mandatory MUST/SHALL requirements verified; regression gate green.
