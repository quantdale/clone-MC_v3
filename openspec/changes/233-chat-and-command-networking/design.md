# Design: 233-chat-and-command-networking

## Context/current state

The multiplayer foundation is in place: `NetworkProtocol` (223) provides generic versioned message codecs (`createNetworkProtocol`, `encodeMessage`, `decodeMessage`, `protocolCompatibility`), `ConnectionLifecycle` (225) models connect/handshake/disconnect state, `WorldTickProcess` (224) drives tick systems, and 230/231/232 provide server-authoritative interaction and transaction networking. Chat and command routing does not exist:

- `src/simulation/CommandParser.ts` (190) — pure, deterministic, headless command grammar: `CommandSpec { name, permissionLevel, args }`, `parseCommand(input, spec)`, `splitCommand`, `hasCommandPermission(level, required)`. No world or player access.
- `src/simulation/CoreCommands.ts` (191) — `executeCoreCommand(input, permissionLevel) -> CoreCommandResult { status: 'ok', effect } | { status: 'error', error } | { status: 'denied', command }`. `CommandEffect` is a discriminated union of pure descriptors (`set_time`, `add_time`, `set_weather`, `set_gamemode`, `give_item`, `teleport`). The wiring applies the effect; the module itself mutates nothing.
- `src/simulation/NetworkProtocol.ts` (223) — codec framework only; the concrete wire message registry is constructed per use (tests build small protocols). There is no shared "game protocol" file today, so chat/command messages must be defined and registered by the wiring/implementer during reconciliation.
- `src/player/Player.ts` / `PlayerController.ts` — bound to `THREE` and `CONFIG`; NOT headless-safe. Chat/command networking MUST NOT import them.
- `src/simulation/AccessibilityFramework.ts`, `KeybindingFramework.ts`, `GamepadFramework.ts` — only reference the *concept* of chat (a `chatVisibility` accessibility option, a `chat` keybinding, a gamepad chat button). No message model, router, or per-player permission exists anywhere in `src/`.

## Target state

A pure headless module `src/simulation/ChatCommandNetworking.ts` providing:

1. `ChatCommandRouter` (server-side): tracks connected players (`playerId -> { profile, permissionLevel }`), validates inbound text, routes chat vs command, assigns a strict monotonic `seq` per routed message, and returns complete `ChatDelivery` sets plus the `CommandEffect` to apply.
2. `ClientChatState` (client-side): records pending outbound messages, applies incoming deliveries exactly once (dedupe by `seq`), and maintains a bounded ordered message log.

The wiring's responsibilities are limited to: (a) feed decoded `chat_send` envelopes into `router.submitText(playerId, text)`, (b) apply the returned `effect` to the authoritative world, (c) send each returned `ChatDelivery` to its `to` recipient as `chat_broadcast`/`chat_feedback`, and (d) feed incoming deliveries into `ClientChatState.applyDelivery`.

## Invariants

- **Sequence Invariant**: `submitText` assigns each accepted routed message a `seq` strictly greater than every previously assigned `seq`. `seq` is never reused.
- **Connected-Sender Invariant**: only a player registered via `registerPlayer` and not yet unregistered may produce an accepted routing result; otherwise the result is `rejected: 'not_connected'`.
- **Chat Broadcast Invariant**: an accepted non-`/` message yields exactly one `ChatDelivery` per currently connected player, including the sender (self-echo).
- **Command Permission Invariant**: a `/`-prefixed message is routed through `executeCoreCommand` with the sender's `permissionLevel`; the returned `CommandEffect` is applied only for `status: 'ok'`, and the sender always receives exactly one feedback delivery (ok/denied/error).
- **Ordering/Dedup Invariant**: the client applies a `ChatDelivery` at most once; a delivery whose `seq` is already present is ignored. Identical input sequences yield identical `seq` assignment and identical delivery sets.
- **Bounded Log Invariant**: the client log and the router's connected-player set are bounded (configurable caps); the oldest entries are dropped when the cap is exceeded.

## API and data model

```ts
export type ChatDeliveryKind = 'chat' | 'feedback';

/** A per-recipient delivery the wiring must send. */
export interface ChatDelivery {
  readonly to: number;            // recipient playerId (target)
  readonly kind: ChatDeliveryKind;
  readonly seq: number;           // server-assigned message sequence (see invariant)
  readonly sender: number;        // originating playerId (0 for system/command feedback)
  readonly text: string;          // already length-validated message text
}

/** Outcome of routing a `/`-prefixed message through the command system. */
export type ChatCommandResult =
  | { readonly status: 'ok'; readonly effect: CommandEffect }
  | { readonly status: 'denied'; readonly command: string }
  | { readonly status: 'error'; readonly error: string };

/** Full server result for one submitted text. */
export type ChatRouteResult =
  | { readonly kind: 'chat'; readonly seq: number; readonly deliveries: readonly ChatDelivery[] }
  | {
      readonly kind: 'command';
      readonly seq: number;
      readonly command: ChatCommandResult;       // status + effect (iff 'ok') / command / error
      readonly deliveries: readonly ChatDelivery[]; // exactly one feedback to the sender
    }
  | { readonly kind: 'rejected'; readonly reason: ChatRejectReason };
```

Reconciled shape note: the routing spec REQ-4/REQ-5 normatively require the result to expose the structured outcome `status` plus the effect present iff `ok`, so the command variant embeds the full `ChatCommandResult` (`command.status` / `command.effect` / `command.command` / `command.error`) rather than a bare optional `effect`.

export type ChatRejectReason = 'not_connected' | 'empty_message' | 'message_too_long';

export interface ChatCommandRouterOptions {
  /** Max chat/command text length in characters (default 256). */
  readonly maxMessageLength?: number;
  /** Max connected players (default 64). */
  readonly maxPlayers?: number;
}
```

`ClientChatState` (reconciled: the client must know its own player id to detect self-echoes, and caps outbound text length exactly like the router):

```ts
export interface ChatEntry {
  readonly seq: number;
  readonly sender: number;    // originating playerId, or 0 for system feedback
  readonly text: string;
  readonly kind: ChatDeliveryKind;
  readonly fromSelf: boolean; // true when this entry echoes one of the client's own sends
}

export interface ClientChatStateOptions {
  readonly localPlayerId?: number;    // id whose chat deliveries count as self-echoes (default 1)
  readonly maxLogSize?: number;       // log cap (default 100)
  readonly maxMessageLength?: number; // outbound text cap, mirrors router default (default 256)
}

export class ClientChatState {
  constructor(options?: ClientChatStateOptions); // throws ClientChatState: <detail> on invalid options
  submit(text: string): void;          // throws ClientChatState: <detail> on invalid; appends to pending
  applyDelivery(delivery: ChatDelivery): void; // dedupes by seq; matches pending self-echo FIFO
  get messages(): readonly ChatEntry[];        // bounded, seq-ordered snapshot
  get pendingCount(): number;                  // outbound messages awaiting self-echo
  get hasPending(text: string): boolean;       // inspect a specific pending outbound
}
```

Wire protocol messages — **id-allocation decision (reconciled against the 232 convention)**:

The codebase has no shared game protocol registry: `NetworkProtocol` (223) provides only the `createNetworkProtocol` framework, and 230/231/232 never allocate concrete numeric message ids in production code — their modules are transport-agnostic and only document logical message semantics; the eventual wiring and tests build protocols with `createNetworkProtocol`. Following that exact convention, 233 does **not** allocate numeric message ids or register messages in production code. The contract below is names + logical fields; `tests/unit/ChatCommandNetworking.test.ts` registers these three messages in a test-constructed protocol (arbitrary test-local ids) and proves encode/decode round-trips plus `protocolCompatibility`. When later wiring introduces a shared game protocol registry (e.g. during 236), these three messages join it there.

| Message | Direction | Logical fields |
|---|---|---|
| `chat_send` | client → server | `sender: int`, `text: string` |
| `chat_broadcast` | server → client | `seq: int`, `sender: int`, `text: string` |
| `chat_feedback` | server → client | `seq: int`, `text: string` |

## Control/data flow

1. **Server-side routing**: the wiring decodes a `chat_send` envelope and calls `router.submitText(sender, text)`.
   - If `sender` is not registered -> `{ kind: 'rejected', reason: 'not_connected' }`.
   - If `text` is empty/whitespace-only -> `{ kind: 'rejected', reason: 'empty_message' }`.
   - If `text.length > maxMessageLength` -> `{ kind: 'rejected', reason: 'message_too_long' }`.
   - Otherwise assign `seq = ++counter`.
   - If `text` does not start with `/`: build one `ChatDelivery` per connected player (including sender), all `kind: 'chat'`, and return `{ kind: 'chat', seq, deliveries }`.
   - If `text` starts with `/`: call `executeCoreCommand(text, permissionLevelOf(sender))`. Build exactly one `ChatDelivery` to the sender (`kind: 'feedback'`, sender = 0) whose text is derived from the outcome; if `status: 'ok'`, include the `effect` in the result.
2. **Wiring application**: for chat results, send each delivery as `chat_broadcast`; for command results, apply `effect` (if present) to the world and send the feedback delivery as `chat_feedback`.
3. **Client-side application**: the client calls `state.submit(text)` on local send and `state.applyDelivery(delivery)` on each received delivery; entries are appended to the bounded log and pending outbounds are confirmed on matching self-echoes (FIFO).

## Detailed behavior

- **Command detection**: a message routes as a command iff its first character is `/`. The full text (including the `/`) is passed to `executeCoreCommand`, which already strips the leading slash via `splitCommand`.
- **Permission context**: the router looks up the sender's registered `permissionLevel` (0-4). `executeCoreCommand` enforces the command's `permissionLevel` and returns `status: 'denied'` when the sender lacks it. Vanilla operator levels are reused unchanged (190/191 semantics).
- **Feedback text**: the router derives a deterministic non-empty feedback string per outcome: `command '<name>' executed` for accepted commands (the name comes from `splitCommand`), `command '<name>' denied: insufficient permission level` for denials, and `command error: <error>` echoing the parser/validator error text for failures. Exact wording is presentation; the contract is that exactly one feedback delivery is produced per command message and its `text` is non-empty. The feedback delivery's `to` is the sending player; its `sender` is `0` (system-originated).
- **Sequence counter**: monotonic per router instance, starting at 0; the first accepted message gets `seq = 1`. Commands and chat share the same counter so the client can order them.
- **Self-echo**: chat broadcasts include a delivery to the sender; the client uses it to confirm a pending outbound. Identical duplicate texts are matched to pending outbounds in FIFO order.
- **Bounded resources**: connected players capped by `maxPlayers`; client log capped by `maxLogSize` (oldest dropped). Registration beyond `maxPlayers` throws `ChatCommand: maxPlayers limit exceeded`.

## Failure modes

- Constructor/`registerPlayer` argument validation throws `ChatCommand: <detail>`: non-safe-integer `playerId`, empty (or whitespace-only) `profile`, `permissionLevel` outside `[0,4]` or non-integer, non-positive/non-integer `maxMessageLength` or `maxPlayers`, invalid `maxLogSize`. Throws happen before any state change.
- Registration of an already-registered `playerId`, or a full player set, throws `ChatCommand: <detail>`.
- `unregisterPlayer(playerId)` validates `playerId` (throws `ChatCommand: <detail>` on a non-safe-integer id) and returns `true` when the player was registered and removed, `false` when it was not registered.
- Sender/size/text failures are returned as `{ kind: 'rejected', reason }` (not thrown): unknown sender, empty message, over-length message. A non-safe-integer `playerId` is treated as `not_connected`; non-string `text` is treated as `empty_message`.
- `ClientChatState.submit` throws `ClientChatState: <detail>` on empty/whitespace-only or over-length text; `applyDelivery` throws on a non-safe-integer `seq`/`sender`/`to`, an unknown `kind`, or an empty `text`; `hasPending` validates that its argument is a non-empty string.
- Command failures never throw from the router: `executeCoreCommand` outcomes map to `ChatCommandResult` feedback, never to an exception.

## Compatibility/migration

Pure additive module. No existing symbol, registry, save format, or persistent data changes. `CommandParser`/`CoreCommands` are imported unchanged. The three wire messages are specified as names + logical fields and proven round-trippable through 223's `createNetworkProtocol` in tests; per the id-allocation decision above they are not registered in production code, and adding them to a protocol does not break `protocolCompatibility` (compatibility checks message ids present in both protocols, and both sides add the same messages in the same build).

## Performance/resource constraints

- Chat routing: O(P) where P = number of connected players (building the broadcast delivery set).
- Command routing: O(1) beyond the parser's existing cost.
- Client `applyDelivery`: O(logSize) for dedupe lookup (linear scan over bounded log) and O(pending) FIFO matching; both bounded by configured caps.
- No allocations beyond the result delivery array and log snapshots.

## Testing seams

Headless unit tests over the router and client state directly: chat broadcast to all players, self-echo, permission-gated command acceptance/denial, parse/semantic command errors, sequence monotonicity, rejected reasons, dedupe by `seq`, FIFO pending confirmation, bounded log trimming, invalid-argument throws, and determinism (identical inputs -> identical outputs).

## Observability/debugging

- `connectedCount`, `isConnected(playerId)`, `currentSeq` on the router.
- `messages`, `pendingCount`, `hasPending(text)` on the client state.

## Affected files/symbols

- `src/simulation/ChatCommandNetworking.ts` (NEW): `ChatDelivery`, `ChatCommandResult`, `ChatRouteResult`, `ChatRejectReason`, `ChatCommandRouter`, `ClientChatState`, `ChatEntry`.
- `tests/unit/ChatCommandNetworking.test.ts` (NEW), including the 223 codec round-trip block over test-local message ids.
- Wire messages `chat_send`, `chat_broadcast`, `chat_feedback`: contract specified in this design and the routing spec; no production-code registration (see the id-allocation decision above — the wiring builds the protocol registry with `createNetworkProtocol` when it lands).

## Rejected alternatives

- *Full client prediction of command effects*: commands already produce pure descriptors the wiring applies; predicting effects client-side duplicates authoritative state and is deferred to later prediction work. The client only tracks pending outbound confirmation.
- *Persistent/history-backed chat*: persistence is owned by 234 and later; 233 keeps only a bounded in-memory log.
- *Coupling to `Player`/`PlayerController`*: those are THREE-bound and violate the headless boundary; the router uses only a per-player `(profile, permissionLevel)` record, keyed by a numeric `playerId`.

## Downstream dependencies

- 234 `server-world-persistence`, 235 `reconnect-state-recovery` (client log resync), 236 `multiplayer-load-tests`, 237 `network-adversarial-validation` (flood/replay/rate abuse on `chat_send`).
