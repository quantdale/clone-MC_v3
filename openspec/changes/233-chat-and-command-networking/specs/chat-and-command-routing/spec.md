# Spec: chat-and-command-routing

## Contract

Pure headless server-side routing of a connected player's text: validation of the sender and message, chat broadcast to every connected player with a monotonic sequence number, and `/`-command execution under the sender's operator permission level producing a command effect and exactly one feedback delivery. The router has zero transport, DOM, THREE, or world access; its output is a complete set of `ChatDelivery` descriptors plus a `CommandEffect` to apply, and the wiring sends deliveries and applies the effect.

## Definitions

- **Router**: the `ChatCommandRouter` server-side component that owns player registration, validation, and chat/command routing.
- **Player registration**: association of a numeric `playerId` with a `profile` label and a vanilla operator `permissionLevel` (0-4).
- **Chat message**: text not starting with `/`, broadcast to all connected players including the sender.
- **Command message**: text starting with `/`, routed through `executeCoreCommand` under the sender's `permissionLevel`.
- **Sequence number (`seq`)**: a strict monotonic integer assigned per accepted routed message, shared by chat and commands.
- **Delivery**: a per-recipient descriptor `{ to, kind, seq, sender, text }` the wiring must transmit.
- **Feedback**: the single delivery sent to a command's sender describing the command outcome (ok/denied/error).

## Invariants

- **Sequence Invariant**: accepted messages are assigned strictly increasing `seq` values; a `seq` is never reused.
- **Connected-Sender Invariant**: only a registered, not-yet-unregistered player may yield an accepted result; otherwise the result is `rejected: 'not_connected'`.
- **Chat Broadcast Invariant**: an accepted chat message yields exactly one delivery per connected player, including the sender.
- **Command Feedback Invariant**: a command message yields exactly one feedback delivery to the sender, and the `effect` is present in the result if and only if the command outcome is `status: 'ok'`.
- **Determinism Invariant**: identical registration and input sequences produce identical routing results, delivery sets, and sequence assignment.

## Requirements

### Requirement: REQ-1 Player Registration and Connection Context

The router SHALL register connected players with a profile and a `permissionLevel` in `[0,4]`, and SHALL reject text from any player that is not currently registered. `registerPlayer` and `unregisterPlayer` SHALL validate their arguments.

#### Scenario: Registered player submits text successfully
- **GIVEN** a router with player 1 registered with permission level 2.
- **WHEN** `submitText(1, 'hello')` is called.
- **THEN** the result MUST be accepted (`kind: 'chat'`) and MUST NOT be `rejected: 'not_connected'`.

#### Scenario: Unregistered player is rejected
- **GIVEN** a router with no player 2 registered.
- **WHEN** `submitText(2, 'hello')` is called.
- **THEN** the result MUST be `{ kind: 'rejected', reason: 'not_connected' }`.

#### Scenario: Duplicate registration throws
- **GIVEN** player 1 already registered.
- **WHEN** `registerPlayer(1, 'p', 2)` is called again.
- **THEN** it MUST throw an error matching `ChatCommand:` and the registration set MUST be unchanged.

---

### Requirement: REQ-2 Message Input Validation

The router SHALL reject empty or whitespace-only messages with reason `'empty_message'` and messages longer than `maxMessageLength` with reason `'message_too_long'`.

#### Scenario: Empty message is rejected
- **GIVEN** player 1 registered on a router with the default `maxMessageLength`.
- **WHEN** `submitText(1, '   ')` is called.
- **THEN** the result MUST be `{ kind: 'rejected', reason: 'empty_message' }`.

#### Scenario: Over-length message is rejected
- **GIVEN** player 1 registered on a router with `maxMessageLength = 8`.
- **WHEN** `submitText(1, '0123456789')` is called.
- **THEN** the result MUST be `{ kind: 'rejected', reason: 'message_too_long' }`.

#### Scenario: Boundary-length message is accepted
- **GIVEN** player 1 registered on a router with `maxMessageLength = 5`.
- **WHEN** `submitText(1, 'abcde')` is called.
- **THEN** the result MUST NOT be rejected for length.

---

### Requirement: REQ-3 Chat Broadcast Routing

For any accepted message not starting with `/`, the router SHALL produce exactly one `ChatDelivery` per currently connected player (including the sender), all with `kind: 'chat'`, the originating player as `sender`, and a shared `seq`.

#### Scenario: Single-player self-echo
- **GIVEN** only player 1 registered.
- **WHEN** `submitText(1, 'hello')` is called.
- **THEN** the result MUST be `kind: 'chat'` with exactly one delivery, whose `to` and `sender` are both 1 and whose `text` is `'hello'`.

#### Scenario: Multi-player broadcast reaches every connected player
- **GIVEN** players 1, 2, and 3 registered.
- **WHEN** `submitText(1, 'hi all')` is called.
- **THEN** the result MUST contain three `kind: 'chat'` deliveries, one each with `to` = 1, 2, and 3, all with `sender` = 1, `text` = `'hi all'`, and an identical `seq`.

#### Scenario: Disconnected player is not a recipient
- **GIVEN** players 1 and 2 registered, then player 2 unregistered.
- **WHEN** `submitText(1, 'hi')` is called.
- **THEN** the result MUST contain a delivery with `to` = 1 and MUST NOT contain any delivery with `to` = 2.

---

### Requirement: REQ-4 Command Routing and Permission Context

For any accepted message starting with `/`, the router SHALL route it through `executeCoreCommand` using the sender's `permissionLevel`, SHALL return `status: 'denied'` when the sender lacks the required level, and SHALL return `status: 'error'` for unknown commands or parse/semantic failures.

#### Scenario: Authorized command produces an effect
- **GIVEN** player 1 registered with permission level 2.
- **WHEN** `submitText(1, '/time set 1000')` is called.
- **THEN** the result MUST be `kind: 'command'` with `command.status: 'ok'` and a `command.effect` of kind `set_time` and value `1000`.

#### Scenario: Insufficient permission is denied
- **GIVEN** player 1 registered with permission level 0 (a core command requires level 2).
- **WHEN** `submitText(1, '/gamemode creative')` is called.
- **THEN** the result MUST be `kind: 'command'` with `command.status: 'denied'`, the effect absent, and `deliveries[0].text` indicating denial.

#### Scenario: Unknown command is an error
- **GIVEN** player 1 registered with permission level 2.
- **WHEN** `submitText(1, '/nope arg')` is called.
- **THEN** the result MUST be `kind: 'command'` with `command.status: 'error'`, the effect absent, and `deliveries[0].text` echoing an unknown-command error.

#### Scenario: Command parse failure is an error
- **GIVEN** player 1 registered with permission level 2.
- **WHEN** `submitText(1, '/time set notanumber')` is called.
- **THEN** the result MUST be `kind: 'command'` with `command.status: 'error'`, the effect absent, and `deliveries[0].text` non-empty.

---

### Requirement: REQ-5 Command Feedback Delivery

For every command message, the router SHALL produce exactly one feedback delivery to the sender (`to` = the sending player, `sender` = 0 for system-originated feedback, `kind: 'feedback'`, `seq` = the command's sequence) with a non-empty `text`, and SHALL include the effect in the result if and only if the outcome is `status: 'ok'`.

#### Scenario: Accepted command yields one ok feedback plus the effect
- **GIVEN** player 1 registered with permission level 2.
- **WHEN** `submitText(1, '/weather clear')` is called.
- **THEN** the result MUST have `command.status === 'ok'` and `command.effect.kind === 'set_weather'`, exactly one delivery with `kind: 'feedback'`, `to` = 1 and `sender` = 0, and that delivery's `text` MUST be non-empty.

#### Scenario: Denied command yields exactly one feedback and no effect
- **GIVEN** player 1 registered with permission level 0.
- **WHEN** `submitText(1, '/give @p dirt 1')` is called.
- **THEN** the result MUST have `command.status === 'denied'`, the effect absent, and exactly one delivery with `kind: 'feedback'`, `to` = 1, and non-empty `text`.

---

### Requirement: REQ-6 Determinism and Sequence Ordering

The router SHALL assign strictly increasing `seq` values across accepted chat and command messages, and SHALL produce identical results for identical registration and input sequences.

#### Scenario: Sequence strictly increases across messages
- **GIVEN** player 1 registered.
- **WHEN** `submitText(1, 'a')`, then `submitText(1, '/time set 0')`, then `submitText(1, 'b')` are called.
- **THEN** the three results MUST have `seq` values 1, 2, and 3 respectively.

#### Scenario: Repeated identical inputs produce identical results
- **GIVEN** players 1 and 2 registered on two fresh routers.
- **WHEN** both routers are fed the identical `submitText` sequence.
- **THEN** both routers MUST produce identical delivery sets, `seq` values, and command results.

#### Scenario: Rejected input does not consume a sequence number
- **GIVEN** player 1 registered.
- **WHEN** `submitText(1, '')` (rejected) is followed by `submitText(1, 'ok')`.
- **THEN** the accepted message MUST be assigned `seq` 1.

---

## Error and failure behavior

- `registerPlayer`/`unregisterPlayer` with invalid arguments throw `ChatCommand: <detail>` without mutating state: non-safe-integer `playerId`, empty `profile`, `permissionLevel` outside `[0,4]`.
- Constructor with invalid options throws `ChatCommand: <detail>`: non-positive/non-integer `maxMessageLength` or `maxPlayers`.
- Registration beyond `maxPlayers` throws `ChatCommand: maxPlayers limit exceeded`.
- Sender/size/text failures are returned as `{ kind: 'rejected', reason }`, never thrown.
- Command failures (unknown command, parse error, semantic error, permission denial) map to feedback deliveries, never thrown.

## Performance and resource bounds

- Chat routing is O(P) where P is the number of connected players (delivery-set construction).
- Command routing is O(1) beyond `executeCoreCommand`'s existing cost.
- Connected-player set is bounded by `maxPlayers`; no unbounded growth.

## Compatibility and migration

- Pure additive module importing unchanged `CommandParser`/`CoreCommands`.
- New wire messages (`chat_send`, `chat_broadcast`, `chat_feedback`) are added to the 223 codec registry; adding messages does not break `protocolCompatibility`.

## Security and integrity

- Command execution is strictly server-authoritative and gated by the registered `permissionLevel`; the client cannot escalate its own operator level.
- All `seq` values are server-assigned; clients cannot forge ordering.

## Observability

- `connectedCount`, `isConnected(playerId)`, `currentSeq` accessors on the router.

## Verification mapping

- Tests in `tests/unit/ChatCommandNetworking.test.ts` cover REQ-1..REQ-6 including the scenarios above; `verification.md` maps each requirement to specific test cases.
