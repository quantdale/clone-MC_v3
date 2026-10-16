# Design: 235-reconnect-state-recovery

## Context/current state

The multiplayer stack is a set of pure, headless, per-connection components in
`src/simulation/`, each verified and unit-tested, and not yet wired into the engine:

- `ConnectionLifecycle.ts` (225) — a connection state machine with `connect() -> connecting ->
  handshaking -> connected`, graceful `disconnect()`/`disconnectComplete()`, `remoteDisconnect()`,
  keepalive timeouts, and `reset()`. A reconnect is simply a fresh `connect()` from the
  `disconnected` state; the lifecycle itself carries no notion of "previous session state".
- `ChunkStreamManager.ts` (226) — per-connection Chebyshev chunk interest and snapshot store with
  `setCenter`, `putSnapshot`, `pendingUpdates`, and `reset()`.
- `MovementAuthority.ts` (227) — server-authoritative player position with `spawn`, `teleport`,
  `submitIntent`, `position`, `lastTick`, and `reset()`.
- `MovementReconciler.ts` (228) — client-side prediction buffer with `predict`, `reconcile`,
  `predicted`, `confirmedTick`, `pending`, and `reset()`.
- `EntityReplication.ts` (229) — `EntityReplicationManager` (server observer interest + delta
  batches) and `ClientEntityStore` (client replica mirror with `applyBatch`, `getAll`, `reset`).
- `BlockInteractionNetworking.ts` (230) — `BlockInteractionValidator` and `ClientBlockReconciler`
  with `pendingPredictions` and `reset()`.
- `InventoryTransactionNetworking.ts` (231) — `InventoryTransactionValidator` (authoritative
  window state + monotonic `stateId`) and `ClientInventoryReconciler` (`predict`, `reconcile`,
  `reset`). The validator's `reset(slots, hotbar, cursorItem, stateId)` already supports being
  reseeded to a full authoritative window.

Each of these advances monotonically over a session and exposes a `reset()` or reseed path, but
there is **no coordination** that: (a) marks a reconnect, (b) invalidates the previous session's
in-flight messages, (c) decides whether the reconnecting client needs a full resync, or
(d) assembles and applies a full authoritative snapshot that reseeds all of them consistently.

## Target state

A new pure headless module `src/simulation/ReconnectStateRecovery.ts` providing:

1. `ReconnectStateManager` (server): issues a fresh `SessionEpoch` per connect, detects
   reconnects, ends sessions on disconnect, rejects stale-session messages, keeps a bounded
   epoch history, and assembles a validated `FullStateSnapshot`.
2. `ReconnectStateClient` (client): tracks the client's replicated-state summary, produces its
   `ClientStateSignature`, detects divergence from the authoritative `ServerStateSignature`, and
   applies a `FullStateSnapshot` — replacing its summary, clearing pending predictions, and
   returning a `ClientResyncDirective` for the caller to apply to the concrete reconcilers.

The server wires the epoch into outgoing messages and validates `isSessionCurrent` on every
incoming sub-protocol message; the client, on receiving a full snapshot, applies the returned
directive to `MovementReconciler`, `ClientInventoryReconciler`, `ClientBlockReconciler`,
`ChunkStreamManager`, and `ClientEntityStore`. All of 235 itself is deterministic and
dependency-free except for importing the established payload types from 226/229/231.

## Invariants

- **Epoch Monotonicity**: For a given profile, each `connect` MUST return a strictly greater
  `SessionEpoch` than every prior connect for that profile. First connect for a profile is
  epoch `1`.
- **Reconnect Detection**: A `connect` for a profile that already has a prior epoch returns
  `isReconnect: true`; the first ever connect returns `isReconnect: false`.
- **Active-Session Uniqueness**: At most one session per profile is current. `isSessionCurrent(profile, epoch)`
  is true iff the profile has an active session AND `epoch` equals that session's epoch.
- **Stale Rejection**: Any epoch other than the current active session's epoch MUST be rejected
  by `isSessionCurrent` (covers previous sessions, replay, and post-disconnect traffic).
- **Resync On Epoch Change**: A client signature whose epoch differs from the server's current
  epoch MUST produce a `needsResync: true` verdict. A reconnect therefore always resyncs.
- **Full Snapshot Determinism**: `collectFullState` MUST sort chunk keys and chunk snapshots by
  ascending key and entity descriptors by ascending entity id; equivalent inputs produce
  byte-identical outputs.
- **Snapshot Current-Only**: `collectFullState` and `applyFullState` MUST reject an epoch that is
  not the profile's current session epoch (server) / the client's current epoch (client).
- **Application Idempotence**: Applying the same full snapshot twice MUST leave the client
  summary and the returned directive unchanged on the second application.
- **Input Immutability**: Passing signatures, inputs, and snapshots returns cloned/defensive
  data; callers mutating their original objects cannot alter internal manager/client state.

## API and data model

```ts
export type SessionEpoch = number; // non-negative safe integer

export interface Position { readonly x: number; readonly y: number; readonly z: number; }

// Client's summary of its replicated state (what it believes it has applied).
export interface ClientStateSignature {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;              // last server tick applied
  readonly position: Position;        // last confirmed player position
  readonly inventoryStateId: number;  // last applied inventory state id
  readonly interest: readonly string[]; // chunk keys in the client's interest, sorted
  readonly entities: readonly number[]; // entity ids replicated client-side, sorted
}

// Server-authoritative summary the client is compared against.
export interface ServerStateSignature {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly inventoryStateId: number;
  readonly interest: readonly string[]; // server interest chunk keys, sorted
  readonly entities: readonly number[]; // server in-range tracked entity ids, sorted
}

export type ResyncVerdict =
  | { readonly needsResync: false; readonly reasons: readonly [] }
  | { readonly needsResync: true; readonly reasons: readonly string[] };

// Reused payload shapes from 226/229/231 (structural; see Affected files/symbols).
export interface InventorySnapshot {
  readonly stateId: number;
  readonly slots: readonly (ItemStack | null)[];   // from 231
  readonly hotbar: readonly (ItemStack | null)[];  // exactly 9 slots
  readonly cursorItem: ItemStack | null;
}

export interface FullStateInput {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly chunks: readonly ChunkSnapshot[];           // from 226
  readonly entities: readonly EntitySpawnDescriptor[]; // from 229
  readonly inventory: InventorySnapshot;
}

export interface FullStateSnapshot {
  readonly profile: string;
  readonly epoch: SessionEpoch;
  readonly tick: number;
  readonly position: Position;
  readonly chunkKeys: readonly string[];                       // sorted, unique
  readonly chunkSnapshots: readonly ChunkSnapshot[];            // sorted by key
  readonly entities: readonly EntitySpawnDescriptor[];          // sorted by id
  readonly inventory: InventorySnapshot;
}

// Concrete reset actions the caller applies to the concrete reconcilers/stores.
export type ResyncAction =
  | { readonly kind: 'reset_movement'; position: Position; tick: number }
  | { readonly kind: 'reset_inventory'; stateId: number; slots: WindowSlots; hotbar: WindowSlots; cursorItem: ItemStack | null }
  | { readonly kind: 'clear_block_predictions' }
  | { readonly kind: 'reset_chunks'; keys: readonly string[] }
  | { readonly kind: 'reset_entities'; entityIds: readonly number[] };

export interface ClientResyncDirective { readonly actions: readonly ResyncAction[]; }

export interface ConnectResult { readonly epoch: SessionEpoch; readonly isReconnect: boolean; }
```

## Control/data flow

**Server (`ReconnectStateManager`):**

1. `connect(profile)` → new epoch (`isReconnect` = a prior epoch exists for the profile). The
   prior session's epoch becomes stale immediately. `disconnect(profile)` ends the active
   session (epoch counter retained, so the next connect is a new epoch).
2. For every incoming sub-protocol message, the server checks `isSessionCurrent(profile, epoch)`
   before dispatching to 227/230/231 validators; a false result drops the message (replay /
   stale / mid-transaction-disconnect protection).
3. When a reconnecting client presents its `ClientStateSignature`, the server compares it with
   the authoritative `ServerStateSignature` via `compareSignatures`. On `needsResync`, the server
   calls `collectFullState(profile, { ... })` to produce the authoritative snapshot and sends it.
4. `collectFullState` validates the epoch against the current session, sorts chunk keys and
   entity descriptors, validates the inventory window, and returns the snapshot.

**Client (`ReconnectStateClient`):**

1. `connect(profile, epoch)` records the handshake epoch and marks `resyncPending = true`.
2. While connected, `recordTick/recordPosition/recordInventoryStateId/setInterest/setEntities`
   keep the client summary current; `signature()` snapshots it.
3. On reconnect the client re-runs `connect` with the new epoch (summary reset, resync pending),
   then `applyFullState(snapshot)`:
   - rejects a snapshot whose epoch != the client's current epoch (stale/duplicate guard);
   - replaces the client summary with the snapshot values;
   - clears `resyncPending`;
   - returns `ClientResyncDirective`; the caller executes it against `MovementReconciler`
     (position + tick via reconcile), `ClientInventoryReconciler` + `InventoryTransactionValidator`
     (via `reset(slots, hotbar, cursor, stateId)`), `ClientBlockReconciler` (`reset`),
     `ChunkStreamManager` (`reset` + `putSnapshot` for `keys`), and `ClientEntityStore`
     (`reset` + `applyBatch`/seed from `entities`).

## Detailed behavior

- **Epoch issuance**: per-profile monotonic counter starting at 1. `connect` never throws for an
  existing profile — it always advances and reports `isReconnect`. Empty/whitespace `profile`
  throws `Reconnect: profile must be a non-empty string`.
- **Disconnect**: `disconnect(profile)` sets the active session to ended; `hasActiveSession`
  becomes false and every epoch (including the just-ended one) fails `isSessionCurrent`.
  Disconnecting a profile with no active session throws
  `Reconnect: profile has no active session`.
- **History**: each connect/disconnect appends a `{ profile, kind: 'connect'|'disconnect', epoch }`
  record to a bounded log (default 32), oldest-first; the oldest record is dropped when full.
- **Signature comparison** (`compareSignatures`): exact equality of profile, epoch, tick,
  position, `inventoryStateId`, interest set, and entity set yields `{ needsResync: false }`.
  The first difference in a fixed check order yields `needsResync: true` with a single reason
  (`'profile mismatch'`, `'epoch mismatch'`, `'tick mismatch'`, `'position mismatch'`,
  `'inventory state mismatch'`, `'interest mismatch'`, `'entity set mismatch'`). Set equality is
  order-independent; empty-vs-empty is equal.
- **Resync decision**: an epoch mismatch always triggers resync, so any reconnect (new epoch)
  requires a full snapshot; the remaining fields additionally catch divergence for a client that
  presents the current epoch but stale tick/position/inventory/interest/entities.
- **Full snapshot assembly**: chunk keys derived from the supplied snapshots, sorted and
  de-duplicated (a duplicate key in the input throws); chunk snapshots emitted in the same
  sorted-key order; entity descriptors emitted sorted by ascending id; inventory validated
  (hotbar exactly 9 slots, valid stacks, non-negative `stateId`).
- **Full snapshot application**: sets the client summary to the snapshot's values, clears
  `resyncPending`, returns the directive. Duplicate application of the same snapshot is
  idempotent (same summary, same directive, no throw). A snapshot with a non-current epoch
  throws `Reconnect: snapshot epoch is not the current session`.

## Failure modes

- Empty/whitespace `profile` → `Reconnect: profile must be a non-empty string`.
- Negative/non-integer `epoch` or `tick` → `Reconnect: epoch must be a non-negative safe integer` /
  `Reconnect: tick must be a non-negative safe integer`.
- Non-finite `position` → `Reconnect: position must be finite numbers`.
- `disconnect` with no active session → `Reconnect: profile has no active session`.
- `collectFullState` with a non-current epoch → `Reconnect: epoch is not the current session`.
- Duplicate chunk key in input → `Reconnect: duplicate chunk key <key>`.
- Invalid inventory (hotbar length ≠ 9, out-of-range slot, invalid stack, negative `stateId`) →
  descriptive `Reconnect: <detail>`.
- `applyFullState` with a non-current epoch → `Reconnect: snapshot epoch is not the current session`.

All throws happen before any mutation; rejected calls change nothing.

## Compatibility/migration

Pure addition to `src/simulation/ReconnectStateRecovery.ts`. Imports the payload types from 226,
229, and 231 (structural; no edits to those modules). No wire-format, registry, or save changes.

## Performance/resource constraints

- `connect`/`disconnect`/`isSessionCurrent`: O(1).
- `compareSignatures`: O(|interest| + |entities|) using set comparison.
- `collectFullState` / `applyFullState`: O(n log n) for the sorts plus O(n) for copies, where n
  is the number of chunks/entities/slots.
- Epoch history bounded by `historyLimit`; client summary bounded by interest/entity set size.
- Zero DOM or browser APIs.

## Testing seams

- Headless unit tests driving `ReconnectStateManager` and `ReconnectStateClient` directly:
  epoch issuance and reconnect detection, stale/replay rejection, mid-transaction-disconnect
  invalidation, signature recording, divergence detection with every reason code, snapshot
  assembly determinism, and full-state application idempotence and stale rejection.
- An integration scenario wiring `applyFullState`'s directive to the existing 227/228/229/230/231
  components (headless, no transport) to prove the reseed reseeds consistently.

## Observability/debugging

- `ReconnectStateManager`: `hasActiveSession(profile)`, `currentEpoch(profile)`,
  `history` (bounded log), `epochCount`.
- `ReconnectStateClient`: `signature()`, `resyncPending`, `pendingActions` (number of actions in
  the last directive), `lastDirective`.

## Affected files/symbols

- `src/simulation/ReconnectStateRecovery.ts` (NEW) — all exported types and the two classes.
- `tests/unit/ReconnectStateRecovery.test.ts` (NEW) — unit + integration tests.
- Consumed (imported, not edited): `ChunkSnapshot`/`ChunkStreamManager` (226),
  `EntitySpawnDescriptor`/`EntityReplicationManager`/`ClientEntityStore` (229),
  `ItemStack`/`WindowSlots`/`InventoryTransactionValidator`/`ClientInventoryReconciler` (231),
  `MovementAuthority` (227), `MovementReconciler` (228), `ClientBlockReconciler` (230),
  `ConnectionLifecycle` (225, reconnect hook source).

## Rejected alternatives

- *Trusting a reconnecting client's prior delta stream (resume in place)*: unsafe — the client
  can have missed arbitrary deltas while offline and stale `stateId`/tick/predictions leak in.
  A fresh epoch with mandatory full resync is the Minecraft-like and safe contract.
- *Deep-copying and re-hosting every 226–231 component inside this module*: over-coupled and
  duplicates their state; instead the module owns only session/signature/snapshot logic and
  returns a directive the caller applies to the existing components via their existing hooks.
- *Adding a whole new wire message set in `NetworkProtocol.ts`*: out of scope; the epoch rides
  existing envelopes and the snapshot reuses existing payload shapes.

## Downstream dependencies

- 236 `multiplayer-load-tests` (reconnect/state-recovery fixtures), 237 `network-adversarial-validation`
  (stale/duplicate reconnect messages), 248 `parity-matrix-reconciliation` (client resync parity).

## Final reconciliation notes (implementation session)

Verified against the actual code before implementation:

- Every payload type named above exists with the documented shape: `ChunkSnapshot`/`ChunkKey`/`columnKey`
  (`ChunkStreaming.ts`), `EntitySpawnDescriptor` (`EntityReplication.ts`), `ItemStack`/`WindowSlots`
  (`InventoryTransactionNetworking.ts`). The module imports only these (plus `columnKey` for the 226
  key-format check) and edits none of them.
- Every reseed hook named in "Control/data flow" exists with the documented signature:
  `InventoryTransactionValidator.reset(slots, hotbar?, cursorItem?, stateId?)` (`InventoryTransactionNetworking.ts:498`),
  `ClientInventoryReconciler.reset()` (:549), `ClientBlockReconciler.reset()` (`BlockInteractionNetworking.ts:501`),
  `ChunkStreamManager.reset()`/`putSnapshot()` (`ChunkStreaming.ts:260`/`:207`),
  `ClientEntityStore.reset()`/`applyBatch()` (`EntityReplication.ts:639`/`:557`),
  `MovementAuthority.spawn(position, tick)` (`MovementAuthority.ts:75`),
  `MovementReconciler.reconcile(position, tick)` (`MovementReconciler.ts:89`).
- `ClientCombatReconciler` (232) and `ClientChatState` (233) also expose `reset()` hooks; they are NOT part of
  the normative directive (the spec enumerates exactly the five actions below). A host wiring the directive
  may additionally reset them — that is caller responsibility, not a module contract.

Spec-consistent decisions taken during implementation (all strictness additions, none weakening a normative
requirement; no scenario contradicts them):

- `collectFullState` rejects duplicate entity ids in the input with `Reconnect: duplicate entity id <id>`,
  mirroring the duplicate-chunk-key rejection (a deterministic snapshot cannot contain two spawns of one id).
- `collectFullState` requires `input.profile` to equal the requested profile, else
  `Reconnect: input profile must match the requested profile`.
- `compareSignatures` validates both signatures (`Reconnect: <label> <detail>` throws) before comparing.
- `ReconnectStateClient` throws `Reconnect: client is not connected` from `record*`/`signature()`/`applyFullState`
  when no session is active, and `Reconnect: client has no active session` from `disconnect()` without an
  active session (mirrors the server-side disconnect contract).
- `setInterest`/`setEntities` store sorted-unique copies (duplicates dedupe silently; invalid entries throw
  before any mutation).
- `applyFullState` requires the snapshot to be internally consistent: `chunkKeys` sorted-unique and exactly
  the key set of `chunkSnapshots`; entity ids sorted-unique ascending.
- `epochCount` (server) = total number of connect transitions issued across all profiles (each `connect`
  issues exactly one epoch).
