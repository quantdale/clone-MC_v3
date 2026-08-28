# Spec: client-chat-state

## Contract

Pure headless client-side message state for chat and command feedback: recording pending outbound messages, applying incoming deliveries exactly once (dedupe by `seq`), confirming pending outbounds from matching self-echoes, and maintaining a bounded, seq-ordered message log for presentation. The client state has zero transport, DOM, THREE, or world access.

## Definitions

- **Client state**: the `ClientChatState` component owning the outbox and the received-message log.
- **Local player id**: the client's own `playerId` (constructor option `localPlayerId`, default 1); chat deliveries whose `sender` equals it are candidate self-echoes.
- **Outbound / pending message**: text the local user sent that has not yet been confirmed by a self-echo delivery from the server.
- **Entry**: a log record `{ seq, sender, text, kind, fromSelf }`.
- **Self-echo**: a `kind: 'chat'` delivery whose `sender` equals the local player id and whose `text` matches a pending outbound.
- **Feedback**: a `kind: 'feedback'` delivery (command result), appended to the log without a pending match.

## Invariants

- **Exact-Once Invariant**: a delivery is applied at most once; a delivery whose `seq` is already present in the log is ignored.
- **Ordered Log Invariant**: log entries are ordered by ascending `seq`.
- **Bounded Log Invariant**: the log is capped at `maxLogSize`; adding beyond the cap drops the oldest entry.
- **Pending Confirmation Invariant**: a pending outbound is removed (confirmed) when a matching self-echo arrives; identical duplicate texts are matched in FIFO order.
- **Determinism Invariant**: identical delivery sequences produce identical logs and pending states.

## Requirements

### Requirement: REQ-1 Outbound Submission

The client state SHALL record a pending outbound message when `submit(text)` is called with valid text, SHALL throw `ClientChatState: <detail>` for empty or over-length text, and SHALL expose the pending set for inspection.

#### Scenario: Submitting valid text adds a pending message
- **GIVEN** an empty `ClientChatState` with default limits.
- **WHEN** `submit('hello')` is called.
- **THEN** `pendingCount` MUST be 1 and `hasPending('hello')` MUST be true.

#### Scenario: Submitting empty text throws
- **GIVEN** an empty `ClientChatState`.
- **WHEN** `submit('   ')` is called.
- **THEN** it MUST throw an error matching `ClientChatState:` and the pending set MUST remain empty.

#### Scenario: Submitting over-length text throws
- **GIVEN** a `ClientChatState` with `maxMessageLength`-equivalent cap of 4 (as configured for the outbound text).
- **WHEN** `submit('abcdef')` is called.
- **THEN** it MUST throw an error matching `ClientChatState:` and the pending set MUST remain empty.

---

### Requirement: REQ-2 Delivery Application and Deduplication

The client state SHALL append an incoming delivery to the log exactly once, in ascending `seq` order, and SHALL ignore a delivery whose `seq` is already present.

#### Scenario: A broadcast is appended to the log
- **GIVEN** an empty `ClientChatState`.
- **WHEN** `applyDelivery({ to: 1, kind: 'chat', seq: 5, sender: 2, text: 'hi' })` is called.
- **THEN** `messages` MUST contain exactly one entry `{ seq: 5, sender: 2, text: 'hi', kind: 'chat', fromSelf: false }`.

#### Scenario: Re-delivery of the same sequence is ignored
- **GIVEN** a `ClientChatState` that already applied a delivery with `seq` 5.
- **WHEN** `applyDelivery` is called again with the same `seq` 5.
- **THEN** the log MUST still contain exactly one entry with `seq` 5.

#### Scenario: Out-of-order deliveries are stored in ascending sequence order
- **GIVEN** an empty `ClientChatState`.
- **WHEN** a delivery with `seq` 9 is applied, then a delivery with `seq` 3.
- **THEN** `messages` MUST list `seq` 3 before `seq` 9.

---

### Requirement: REQ-3 Pending Outbound Confirmation

The client state SHALL confirm a pending outbound when a matching `kind: 'chat'` self-echo delivery arrives, removing it from the pending set and marking the resulting entry `fromSelf: true`. Identical duplicate pending texts SHALL be matched in FIFO order.

#### Scenario: Self-echo confirms the pending message
- **GIVEN** a `ClientChatState` with a pending outbound `'hello'`.
- **WHEN** `applyDelivery({ to: 1, kind: 'chat', seq: 1, sender: 1, text: 'hello' })` is called.
- **THEN** `pendingCount` MUST be 0, `hasPending('hello')` MUST be false, and the log entry for `seq` 1 MUST have `fromSelf: true`.

#### Scenario: A message from another player does not confirm a pending outbound
- **GIVEN** a `ClientChatState` with a pending outbound `'hello'`.
- **WHEN** `applyDelivery({ to: 1, kind: 'chat', seq: 2, sender: 2, text: 'hello' })` is called.
- **THEN** `pendingCount` MUST remain 1 and the appended entry MUST have `fromSelf: false`.

#### Scenario: Duplicate pending texts confirm in FIFO order
- **GIVEN** a `ClientChatState` with two pending outbounds both `'hi'`.
- **WHEN** two self-echo deliveries with `text: 'hi'` arrive in order.
- **THEN** after the first echo `pendingCount` MUST be 1 and after the second `pendingCount` MUST be 0.

---

### Requirement: REQ-4 Feedback Application

The client state SHALL append a `kind: 'feedback'` delivery to the log as a `fromSelf: false` entry and SHALL NOT attempt to match it against the pending outbox.

#### Scenario: Command feedback is appended without pending match
- **GIVEN** an empty `ClientChatState`.
- **WHEN** `applyDelivery({ to: 1, kind: 'feedback', seq: 4, sender: 0, text: 'denied' })` is called.
- **THEN** `messages` MUST contain the entry `{ seq: 4, sender: 0, text: 'denied', kind: 'feedback', fromSelf: false }` and `pendingCount` MUST be 0.

---

### Requirement: REQ-5 Bounded Log

The client state SHALL cap the log at `maxLogSize` entries and SHALL drop the oldest entry when the cap is exceeded.

#### Scenario: Log beyond capacity drops the oldest entry
- **GIVEN** a `ClientChatState` with `maxLogSize = 2`.
- **WHEN** deliveries with `seq` 1, 2, and 3 are applied in order.
- **THEN** `messages` MUST contain exactly the entries for `seq` 2 and 3, and MUST NOT contain the `seq` 1 entry.

---

### Requirement: REQ-6 Validation and Determinism

All public methods SHALL validate arguments strictly, throwing `ClientChatState: <detail>` errors without corrupting state, and SHALL produce identical outcomes for identical delivery sequences.

#### Scenario: Invalid delivery fields throw
- **GIVEN** an empty `ClientChatState`.
- **WHEN** `applyDelivery` is called with a non-integer `seq` or an empty `text`.
- **THEN** it MUST throw an error matching `ClientChatState:` and the log MUST remain empty.

#### Scenario: Identical sequences produce identical states
- **GIVEN** two fresh `ClientChatState` instances with identical limits.
- **WHEN** both are fed the identical sequence of `submit` and `applyDelivery` calls.
- **THEN** both instances MUST have identical `messages` and `pendingCount`.

---

## Error and failure behavior

- `submit` throws `ClientChatState: <detail>` on empty or over-length text (length checked against `maxMessageLength`, default 256) without changing the outbox.
- `applyDelivery` throws `ClientChatState: <detail>` on a non-safe-integer `seq`, `sender`, or `to`, an unknown `kind`, or an empty `text`, without changing the log.
- Constructor throws `ClientChatState: <detail>` on a non-positive/non-integer `maxLogSize` or `maxMessageLength`, or a non-safe-integer `localPlayerId`.
- `hasPending` throws `ClientChatState: <detail>` when its argument is not a non-empty string.

## Performance and resource bounds

- `applyDelivery` is O(maxLogSize) for the dedupe scan and O(pending) for FIFO matching; both bounded by configured caps.
- Memory bounded by `maxLogSize`; no unbounded growth.

## Compatibility and migration

- Pure additive class; no existing module or persistent data touched. Reconnect resynchronization of the log is deferred to 235.

## Security and integrity

- Dedupe by server-assigned `seq` prevents double-application of replayed deliveries; the client never trusts a `seq` it did not receive from the server.

## Observability

- `messages`, `pendingCount`, `hasPending(text)` accessors.

## Verification mapping

- Tests in `tests/unit/ChatCommandNetworking.test.ts` cover REQ-1..REQ-6 including the scenarios above; `verification.md` maps each requirement to specific test cases.
