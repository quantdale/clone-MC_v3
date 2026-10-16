# Tasks: 233-chat-and-command-networking

## 1. Baseline & implementation

- [x] 1.1 Establish baseline evidence (confirm `CommandParser`/`CoreCommands` 190/191 export `executeCoreCommand(input, permissionLevel)`, `CommandEffect`, `hasCommandPermission`; record via grep that no chat/message/player-permission model exists in `src/`) and define all types in `src/simulation/ChatCommandNetworking.ts`: `ChatDelivery`, `ChatDeliveryKind`, `ChatCommandResult`, `ChatRouteResult`, `ChatRejectReason`, `ChatEntry`, `ChatCommandRouterOptions`.
- [x] 1.2 Implement `ChatCommandRouter` constructor (player map, sequence counter, `maxMessageLength`, `maxPlayers`) and `registerPlayer`/`unregisterPlayer` with strict `ChatCommand: <detail>` argument validation, duplicate/full-set rejection, and `not_connected` handling.
- [x] 1.3 Implement `submitText`: input validation (empty/whitespace -> `empty_message`, over-length -> `message_too_long`), strict monotonic `seq` assignment, and dispatch into chat vs command routing.
- [x] 1.4 Implement chat broadcast routing: one `kind: 'chat'` delivery per connected player (including sender) sharing the assigned `seq`.
- [x] 1.5 Implement command routing and feedback: `executeCoreCommand(text, senderPermissionLevel)`, mapping `ok`/`denied`/`error` to `ChatCommandResult` with exactly one `kind: 'feedback'` delivery to the sender and the `effect` present iff `ok`.
- [x] 1.6 Implement `ClientChatState`: `submit` (pending outbox), `applyDelivery` (exact-once by `seq`, seq-ordered bounded log, FIFO pending confirmation on self-echo), and accessors.

## 2. Focused unit tests

- [x] 2.1 Unit tests for registration/connection context and input validation (routing REQ-1, REQ-2): registered accepted, unregistered `not_connected`, duplicate registration throws, empty/over-length rejections, boundary-length accepted.
- [x] 2.2 Unit tests for chat broadcast routing (REQ-3): single-player self-echo, multi-player broadcast to all, disconnected player excluded as recipient.
- [x] 2.3 Unit tests for command routing, permission, and feedback (REQ-4, REQ-5): authorized effect, insufficient-permission denial, unknown-command and parse-failure errors, exactly one feedback delivery, `effect` present iff `ok`, non-empty feedback text.
- [x] 2.4 Unit tests for determinism and sequence ordering (REQ-6): strictly increasing `seq`, rejected input consumes no `seq`, repeated identical inputs produce identical results.
- [x] 2.5 Wire-message contract tests: register `chat_send`, `chat_broadcast`, `chat_feedback` with 223's `createNetworkProtocol` (test-local ids), prove encode/decode round-trips of router outputs and client inputs, and `protocolCompatibility` between identical protocols.

## 3. Edge/failure & client-state tests

- [x] 3.1 Unit tests for `ClientChatState` outbound submission and delivery application/dedupe (client REQ-1, REQ-2): pending tracking, exact-once by `seq`, ascending seq ordering, invalid-field throws.
- [x] 3.2 Unit tests for pending confirmation, feedback application, and bounded log (client REQ-3, REQ-4, REQ-5): self-echo confirm, foreign-message non-confirm, FIFO duplicate-text matching, feedback appended without pending match, oldest-entry drop at `maxLogSize`.
- [x] 3.3 Unit tests for client validation/determinism (client REQ-6) and adversarial edge checks: invalid `seq`/`sender`/empty `text` throw without corruption, identical sequences produce identical states, empty `profile`, `permissionLevel` outside `[0,4]`, negative `maxMessageLength`, non-integer `playerId`, replayed `seq` dedupe, duplicate identical pending texts.

## 4. Regression & final gate

- [x] 4.1 Run the baseline verification gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) and record results.
- [x] 4.2 Reconcile `proposal.md`/`design.md`/`specs/`/`tasks.md` against the actual implementation; update `verification.md` with real evidence and mark the change VERIFIED.
