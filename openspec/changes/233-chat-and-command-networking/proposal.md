# Proposal: 233-chat-and-command-networking

## Problem

The multiplayer stack (222-232) has wired movement, chunk streaming, block interaction, entity replication, inventory transactions, and combat across the client/server boundary, but there is no way for a client to talk to other players or to issue commands. `CommandParser` (190) and `CoreCommands` (191) already provide a pure, headless, permission-gated command grammar that produces effect descriptors, but nothing routes a networked client's text through it, no per-player operator permission exists in the source, and there is no chat message model. Change 233 provides the server-routed chat and command execution context that sits between the wire protocol (223) and the existing command/effect modules, plus a client-side message state helper.

## Goals

- Define a pure headless server-side router (`ChatCommandRouter`) that:
  - Tracks connected players with a profile and a vanilla-style operator permission level (0-4).
  - Validates inbound text (non-empty, bounded length, connected sender).
  - Routes non-`/` text as a chat broadcast to every currently connected player (including the sender) with a monotonic sequence number.
  - Routes `/`-prefixed text through `executeCoreCommand` with the sender's permission level, producing a `CommandEffect` for accepted commands or a structured denial/error feedback delivery to the sender.
  - Returns a complete, deterministic set of `ChatDelivery` descriptors plus the effect so the wiring only has to apply the effect and send deliveries.
- Define a client-side message state helper (`ClientChatState`) that records pending outbound messages, applies incoming deliveries exactly once (dedupe by sequence number), and maintains a bounded ordered log for rendering.
- Specify the wire messages (`chat_send`, `chat_broadcast`, `chat_feedback`) that the 223 codec registry must carry for this capability.
- Strict input validation with descriptive `ChatCommand: <detail>` / `ClientChatState: <detail>` errors on invalid API input, without mutating state.
- Pure headless module with zero DOM, THREE, or transport dependencies, consistent with 230/231's networking pattern.

## Non-goals

- No chat/command UI rendering, HUD, or `chatVisibility` accessibility integration (client presentation is outside the headless boundary).
- No new commands (190/191 own the grammar and effect set; this change routes them, it does not add to them).
- No flood/replay/rate-abuse detection or adversarial malformed-message fuzzing (237 `network-adversarial-validation` owns adversarial handling; the 223 codecs already reject malformed envelopes).
- No reconnect resynchronization of the client chat log (235 `reconnect-state-recovery` owns reconnect state).
- No persistent chat history or player-message persistence (234 `server-world-persistence` and later own server-owned persistence).

## Preconditions

- 223 `network-protocol-codecs` VERIFIED (message codec framework exists).
- 225 `connection-lifecycle` VERIFIED (connection state model exists).
- 190 `command-parser` and 191 `core-commands` VERIFIED (pure parser + effect descriptors + permission model exist).

## Dependencies

- Pure TypeScript module in `src/simulation/ChatCommandNetworking.ts`, importing `CommandParser`/`CoreCommands` (and no DOM/THREE). Follows the deterministic, strictly-validated, `Module: <detail>`-throwing pattern of 230/231/229.

## Proposed change

- New module `src/simulation/ChatCommandNetworking.ts` with:
  - `ChatDelivery` — per-recipient delivery descriptor `{ to, kind: 'chat'|'feedback', seq, sender, text }`.
  - `ChatCommandResult` — `{ status: 'ok'; effect } | { status: 'denied'; command } | { status: 'error'; error }`.
  - `ChatRouteResult` — `{ kind: 'chat'; seq; deliveries } | { kind: 'command'; seq; effect?; deliveries } | { kind: 'rejected'; reason }`.
  - `ChatCommandRouter` — server-side registration, validation, chat/command routing, sequence assignment.
  - `ClientChatState` — client-side outbox + bounded ordered message log with dedupe.
- New test file `tests/unit/ChatCommandNetworking.test.ts`.
- Wire protocol additions: the three message names and logical fields (`chat_send`, `chat_broadcast`, `chat_feedback`) are specified here; following the 230/231/232 convention no numeric message ids are allocated in production code (there is no shared game protocol registry yet — 223's `createNetworkProtocol` is the framework the future wiring and tests use), and the unit tests prove the codec round-trip. See `design.md` for the pinned id-allocation decision.

## Compatibility and migration

Pure additive. No registry, save-format, or persistent-data changes. New headless module and new unit tests only; existing modules are untouched.

## Risks

- Sequence-number / ordering ambiguity with replayed or out-of-order deliveries -> pinned: server assigns a strict monotonic `seq` at routing time; the client dedupes by `seq`; true replay/flood abuse is explicitly deferred to 237.
- Duplicate identical chat texts making pending-outbound matching ambiguous -> pinned: pending confirmation matches self-echoes in FIFO order (deterministic).
- Concurrent 232/234-237 wire message-id allocation colliding with 233's messages -> pinned: ids are reconciled during final implementation; 233 specifies message names + logical fields, not a claimed id block.

## Rollback strategy

Delete `src/simulation/ChatCommandNetworking.ts` and `tests/unit/ChatCommandNetworking.test.ts`. No other module references them; no persistent data to revert.

## Definition of Done

All spec requirements (REQ-1..REQ-6 in each of the two capability specs) verified by unit tests; baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all PASS; `verification.md` updated with real evidence and the change advanced.

## Advancement gate

100% task completion; all mandatory MUST/SHALL requirements verified; regression gate green; no task silently covers work belonging to 234-237.
