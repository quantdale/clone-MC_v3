# Design: 237-network-adversarial-validation

## Context/current state

All client-bound network message handling is done by pure, headless simulation modules, each with its
own validation and its own documented rejection reasons. There is currently **no central dispatcher
module**; the 223 codecs (`encodeMessage`/`decodeMessage`) convert between typed records and wire
envelopes, and each validator is invoked with already-decoded typed request objects. The current
adversarial posture per module:

| Module (change) | Validator / symbol | Already-rejected adversarial inputs | Rejection style |
|---|---|---|---|
| 223 `NetworkProtocol.ts` | `decodeMessage` / `createNetworkProtocol` | unknown id/name, wrong field count, type mismatch (int=safe int, float=finite, string, bool); construction rejects duplicate ids/names, negative ids, empty names, duplicate/unknown fields | codecs return `null`; construction throws `NetworkProtocol: <detail>` |
| 225 `ConnectionLifecycle.ts` | `ConnectionLifecycle` | invalid source-state transitions; empty profile/reason; non-finite/backward `update` time is a no-op | throws `ConnectionLifecycle: <detail>`; `update` no-ops |
| 226 `ChunkStreaming.ts` | `ChunkStreamManager` | snapshot key mismatch (`columnKey`), non-integer coords, duplicate section `y`, empty sections/data, non-safe-int/negative data values, invalid tick; `maxSnapshots` bounded store with oldest-first eviction | throws `ChunkStream: <detail>`; store eviction |
| 227 `MovementAuthority.ts` | `MovementAuthority` | stale tick (`tick <= lastTick`), speed-limit displacement; non-finite coords, non-safe-int/negative tick | rejects `'stale tick'`/`'speed limit'`; malformed throws `MovementAuthority: <detail>` |
| 229 `EntityReplication.ts` | `EntityReplicationManager`, `ClientEntityStore` | invalid id/type/position/rotation/velocity/trackedData/tick; `maxTracked` cap; client store validates and skips malformed batch entries | throws `EntityReplication: <detail>` |
| 230 `BlockInteractionNetworking.ts` | `BlockInteractionValidator` | `finish` without `start` → `'no_active_break'`; `break_too_fast`; `out_of_reach`; `cannot_place`; invalid face; non-integer coords; invalid `blockStateId` | returns rejection reasons; malformed throws `BlockInteraction: <detail>` |
| 231 `InventoryTransactionNetworking.ts` | `InventoryTransactionValidator` | stale `stateId` → `'wrong_state_id'`; duplicate drag start / add/end without start → `'drag_not_started'`; slot out of range; unknown type/button | returns rejection reasons; malformed throws `InventoryTransaction: <detail>` |
| 232 `CombatNetworking.ts` | `CombatValidator` | `'out_of_reach'`, `'no_target'`, `'target_dead'`, `'stale_tick'`, `'attack_cooldown'`, `'no_ammo'`, `'not_charged'`, `'fire_too_fast'`, `'origin_mismatch'`, `'invalid_direction'`, `'max_projectiles'`; malformed seam output throws `Combat: <detail>` | returns rejection reasons; malformed throws `Combat: <detail>` |
| 233 `chat-and-command-networking` (in progress) | chat / command routing | referenced by name only; fields reconciled at implementation | to be reconciled |

**Gaps this change fills:**
1. No connection-level message-sequence **replay/ordering** detector (movement/combat/inventory track
   per-module tick/state monotonicity, but nothing rejects a *replayed wire message sequence* across the
   connection).
2. No uniform **per-message-type rate policy**; existing limits are ad hoc and module-local.
3. No **bounded-size policy** for strings and arrays (`maxStringLength`, `maxArrayLength`).
4. No adversarial **integrity test suite** that pins all of the above as a regression contract.

## Target state

After 237:

- `src/simulation/NetworkAdversarialGuard.ts` (NEW) provides `MessageSequenceGuard`, `MessageRateLimiter`,
  bounded-domain helpers, and `AdversarialMessageGuard.inspectIncoming(...)`. It is pure, headless,
  deterministic, and additive.
- Every client-bound handler retains its documented rejection reasons verbatim. The guard *adds* the
  connection-level sequence/rate/domain checks (new reasons: `'duplicate_message'`, `'out_of_order'`,
  `'rate_limited'`, `'oversized_field'`).
- An adversarial integrity test suite (`tests/unit/NetworkAdversarialGuard.test.ts` plus per-module
  characterization/adversarial tests) asserts, for every handler, the documented rejection reason and
  that authoritative state is unchanged on rejection, and that adversarial bursts stay within bounds.

## Invariants

- **No-state-mutation-on-rejection**: a malformed, duplicate, out-of-order, or rate-limited message
  MUST NOT alter any authoritative counter, registry, store, or tracker.
- **Authoritative reasons**: this change MUST NOT change any rejection reason defined by changes
  223–232. New rejection reasons belong only to the guard's new checks.
- **Determinism**: identical adversarial schedules MUST produce identical rejection traces and leave
  identical state across repeated runs.
- **Monotonicity**: sequence/tick/`stateId` counters advance monotonically or are reset only by the
  documented lifecycle events (`reset`, reconnect, spawn/teleport).
- **Bounded resources**: per-kind rate windows, the connection sequence, strings, arrays, chunk
  snapshots, tracked entities, live projectiles, and transition history are all bounded by
  configuration or by the module's documented cap.
- **Headless/pure**: the guard and all tests operate on plain values with no DOM, transport, timers, or
  IO; time is tick-based (fixed 20 TPS semantics) or scripted wall time where a module already uses it
  (225).

## API and data model

TypeScript sketch (intent; does not override normative spec requirements):

```ts
// NetworkAdversarialGuard.ts (NEW)
export type SequenceResult = 'accept' | 'duplicate' | 'out_of_order';

export class MessageSequenceGuard {
  // Connection-scoped. Rejects a non-monotonic sequence as duplicate (<= last) — the
  // caller distinguishes replay vs reorder by comparing to last accepted.
  track(sequence: number): SequenceResult;
  reset(): void;              // called on disconnect/reconnect (matches ConnectionLifecycle.reset)
  get lastAccepted(): number; // 0 before any accept
}

export interface RateLimit { readonly maxPerWindow: number; readonly windowTicks: number; }

export class MessageRateLimiter {
  constructor(limits: Partial<Record<string, RateLimit>>, defaultLimit: RateLimit);
  submit(kind: string, tick: number): boolean; // true=allowed, false=rate_limited
  reset(): void;
}

export interface AdversarialGuardOptions {
  readonly defaultLimit?: RateLimit;       // e.g. { maxPerWindow: 40, windowTicks: 20 }
  readonly limits?: Partial<Record<string, RateLimit>>;
  readonly maxStringLength?: number;       // default 4096
  readonly maxArrayLength?: number;        // default 1024
  readonly maxCollectionItems?: number;    // default 65536 (sum of nested array items)
}

export type InspectResult =
  | { readonly dispatch: true; readonly name: string; readonly values: Readonly<Record<string, WireValue>> }
  | { readonly dispatch: false; readonly reason:
        'unknown_message_id' | 'malformed_fields' | 'oversized_field' | 'duplicate_message' |
        'out_of_order' | 'rate_limited' };

export class AdversarialMessageGuard {
  constructor(options?: AdversarialGuardOptions);
  inspectIncoming(
    protocol: NetworkProtocol,        // 223 NetworkProtocol
    envelope: WireEnvelope,           // 223 WireEnvelope
    tick: number,                     // current server tick (fixed 20 TPS)
    sequence?: number,                // optional connection sequence for replay/ordering
  ): InspectResult;
  reset(): void;
}
```

The guard is transport-agnostic: `sequence` is supplied by the dispatch layer (which the implementer
wires); when `sequence` is `undefined`, the guard performs no sequence check and only does
codec/domain/rate checks.

## Control/data flow

1. A wire `WireEnvelope` arrives at the dispatch point.
2. `AdversarialMessageGuard.inspectIncoming(protocol, envelope, tick, sequence)`:
   a. If `sequence` is provided, `MessageSequenceGuard.track(sequence)` → reject
      `'duplicate_message'`/`'out_of_order'` (state unchanged).
   b. `decodeMessage(protocol, envelope)` (223) → `null` ⇒ `'malformed_fields'`/`'unknown_message_id'`.
   c. Domain bounds: every `string` field length `<= maxStringLength`, every array-like value (tracked
      data, section payloads, chat/command bodies by reference) within `maxArrayLength`/
      `maxCollectionItems`; every `int` is a safe integer and `float` finite ⇒ else `'oversized_field'`.
   d. `MessageRateLimiter.submit(name, tick)` ⇒ `false` ⇒ `'rate_limited'`.
   e. All checks pass ⇒ `{ dispatch: true, name, values }`.
3. The handler's own validator then performs its semantic checks (reach, cooldown, `stateId`, etc.) and
   returns its authoritative result; the guard does not replace these.

## Detailed behavior

### MessageSequenceGuard
- `track(sequence)` requires a non-negative safe integer; otherwise throws a descriptive
  `NetworkAdversarial: ...` error (malformed input at the guard boundary).
- `sequence <= lastAccepted` ⇒ `'duplicate'` (equal) or `'out_of_order'` (less), no state change.
- `sequence > lastAccepted` ⇒ `'accept'` and advances `lastAccepted`.
- `reset()` returns `lastAccepted` to 0. The 225 lifecycle calls `reset()` on disconnect/reconnect, so
  a replayed pre-reconnect sequence after a reconnect is treated as a fresh sequence (matching 235
  resynchronization intent).

### MessageRateLimiter
- Per `kind` (message name) and `tick`, counts submissions within the last `windowTicks` ticks; a new
  submission is allowed while the count is `< maxPerWindow`; otherwise rejected (`'rate_limited'`) and
  the count is not incremented. Windows slide by tick so a burst followed by quiescence re-opens.
- Unconfigured kinds use `defaultLimit`. `reset()` clears all counters.

### Bounded-domain helpers
- `boundedString(s, max)` rejects strings longer than `max`.
- `boundedArray(a, max)` and `boundedCollection(items, max)` reject arrays/lists exceeding the cap.
- The guard applies these to decoded message fields and to array-valued fields of the typed requests
  that carry user-supplied collections (e.g. entity `trackedData`, chunk `sections`/`data`, and 233
  chat/command bodies by reference).

### Handler hardening (small, additive)
Only where the contract mandates a bound the handler currently lacks, add the check without changing
documented reasons. Concretely: enforce bounded array sizes on array-valued request fields (229
`trackedData` via a new `maxTrackedDataItems` option; 226 `sections`/`data` via new
`maxSectionsPerSnapshot`/`maxSectionDataLength` options) using the module's `<Module>: <detail>` throw
convention. These are additive options with generous defaults, so no existing behavior or rejection
reason changes; adversarial tests configure them tightly. No gameplay constant or rejection reason
changes.

### Wiring reconciliation (final)
- **No central dispatcher exists.** The 236 harness and all validators are invoked directly with typed
  objects; there is no module that routes decoded 223 `WireEnvelope`s. Therefore
  `AdversarialMessageGuard.inspectIncoming(...)` **is the dispatch gate**: the caller feeds it a wire
  envelope, and on `{ dispatch: true, name, values }` routes the decoded typed record to the matching
  typed validator (227/230/231/232/233). No existing module is modified for wiring.
- **Wire values are scalar.** 223 `WireValue` is `boolean | number | string`, so array-typed fields
  (229 `trackedData`, 226 `sections`/`data`) are not present on the wire and are bounded by the typed
  modules' additive caps above. The guard's `boundedArray`/`boundedCollection` helpers and
  `maxArrayLength`/`maxCollectionItems` options are exposed for the dispatch/wiring layer and unit-tested
  directly.
- **Sequence-guard reset on reconnect.** `ConnectionLifecycle` is a separately verified module with no
  guard reference, so it is not modified. The reset is a documented wiring contract: the dispatch layer
  calls `AdversarialMessageGuard.reset()` / `MessageSequenceGuard.reset()` when
  `ConnectionLifecycle.reset()` runs on disconnect/reconnect. This is proven by a unit test
  (`MessageSequenceGuard.reset` restarts the sequence epoch; `AdversarialMessageGuard.reset` clears
  sequence + rate state), keeping 235 reconnect recovery compatible.

## Failure modes

- **Malformed**: unknown message id, wrong arity, type mismatch, non-finite float, non-safe int,
  empty/oversized string, oversized/empty array, invalid enum. Guard returns the appropriate
  `'malformed_fields'`/`'oversized_field'`; typed validators throw `<Module>: <detail>` or return their
  documented rejection reason.
- **Duplicate/replay**: equal sequence ⇒ `'duplicate_message'`; stale tick (227/232) ⇒
  `'stale tick'`/`'stale_tick'`; stale `stateId` (231) ⇒ `'wrong_state_id'`; duplicate drag start (231) ⇒
  `'drag_not_started'`; duplicate section `y` (226) throws `ChunkStream: ...`.
- **Out-of-order**: lower sequence ⇒ `'out_of_order'`; `finish` break without `start` (230) ⇒
  `'no_active_break'`; lower tick (227/232) ⇒ stale rejection.
- **Rate abuse**: per-kind window exceeded ⇒ `'rate_limited'`; combat `'attack_cooldown'`,
  `'fire_too_fast'`, `'max_projectiles'`; block `'break_too_fast'`; entity `maxTracked`; chunk
  `maxSnapshots` eviction.
- **Integrity**: rejected messages never mutate state; adversarial bursts leave all counters, stores,
  and registries bounded and consistent; replication events are consumed exactly once.

## Compatibility/migration

- Additive only: one new module, new tests, and minimal handler hardening. No protocol, save-format, or
  public API change; no stored-data migration.
- Existing rejection reasons are preserved verbatim. New reasons are namespaced to guard-only checks.
- `reset()` semantics of the guard align with 225 `ConnectionLifecycle.reset()` so 235 reconnect
  recovery is not broken.

## Performance/resource constraints

- Guard checks are O(1) amortized (sequence: constant; rate limiter: O(kinds) on config, O(1) per
  submission over a bounded window; domain checks O(fields) and O(items) for bounded arrays).
- All storage bounded: sequence last value, rate counters per kind (bounded by the number of distinct
  message kinds), and the existing module caps (`maxSnapshots`, `maxTracked`, `maxProjectiles`,
  `historyLimit`). No unbounded growth under an adversarial burst.

## Testing seams

- The guard is a pure class tested headlessly: fixed tick sequences, fixed envelope fixtures, and
  scripted bursts.
- Each existing handler is already headless and unit-testable; adversarial tests feed malformed/
  duplicate/out-of-order/rate-abusive typed requests and assert the documented reason plus unchanged
  state (read authoritative getters before/after: `MovementAuthority.position/lastTick`,
  `InventoryTransactionValidator.currentSlots/currentStateId`, `CombatValidator.projectileCount`,
  `ChunkStreamManager.interest/store`, `EntityReplicationManager.trackedCount`, etc.).
- Tests live in `tests/unit/` following `tests/unit/CombatNetworking.test.ts` conventions (Vitest
  `describe`/`it`, deterministic fixtures).

## Observability/debugging

- The guard exposes `MessageSequenceGuard.lastAccepted`, `MessageRateLimiter` per-kind counters, and
  the composed `InspectResult.reason` so a dropped message can be diagnosed (dispatch:false + reason).
- Existing handler getters remain the authoritative state probe for "state unchanged" assertions.
- Deterministic error prefixes: `NetworkAdversarial: <detail>` for malformed guard inputs; existing
  `<Module>: <detail>` prefixes are unchanged.

## Affected files/symbols

- NEW `src/simulation/NetworkAdversarialGuard.ts` — `MessageSequenceGuard`, `MessageRateLimiter`,
  `AdversarialMessageGuard`, `InspectResult`, `SequenceResult`, `RateLimit`, helpers.
- NEW `tests/unit/NetworkAdversarialGuard.test.ts` — guard unit tests.
- NEW/EXTENDED adversarial tests: `tests/unit/ConnectionLifecycle.test.ts`,
  `tests/unit/ChunkStreaming.test.ts`, `tests/unit/MovementAuthority.test.ts`,
  `tests/unit/EntityReplication.test.ts`, `tests/unit/BlockInteractionNetworking.test.ts`,
  `tests/unit/InventoryTransactionNetworking.test.ts`, `tests/unit/CombatNetworking.test.ts`
  (adversarial describes added; existing cases untouched).
- MINOR hardening (no reason changes): 229 `trackedData` bounds (`maxTrackedDataItems`), 226
  `sections`/`data` bounds (`maxSectionsPerSnapshot`/`maxSectionDataLength`), and the dispatch gate for
  decoded envelopes (`inspectIncoming`); 233 message kinds are rate/domain-checked by the guard's
  generic kind-based rate limiter (by reference).
- Downstream consumers: none of the existing public APIs change; 233's dispatcher (by reference) and
  235's reconnect recovery (by reference) interact with `reset()`/sequence semantics.

## Rejected alternatives

- **Central re-write of all validators** — rejected: would churn verified 223–232 behavior and risk
  changing authoritative reasons; violates scope discipline.
- **Transport-level rate limiting / hard-disconnect on abuse** — rejected: requires a transport layer
  that does not exist yet and changes connection semantics owned by 225/235; the guard rejects
  messages, not connections.
- **Wall-clock rate limiting** — rejected: the simulation is tick-driven (fixed 20 TPS); tick-based
  windows are deterministic and headless-testable.
- **Guarding only the new module and skipping handler characterization** — rejected: the narrow outcome
  requires integrity tests pinning the existing handlers' rejection behavior as a regression contract.

## Downstream dependencies

- 223 codecs (decode boundary), 225 lifecycle (sequence reset), 226/227/229/230/231/232 handlers
  (authoritative reasons), 233 routing (by reference), 235 reconnect (sequence reset compatibility).
- Later changes 238/239 (stress/performance) may consume the guard's bounds but are not required for
  this change.
