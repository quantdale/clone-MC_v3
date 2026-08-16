# Proposal: 237-network-adversarial-validation

## Problem

Every network message handler introduced by changes 223, 225, 226, 227, 229, 230, 231, 232 (and the
routing added by 233) already performs its own per-module input validation and returns documented
rejection reasons (`'stale_tick'`, `'wrong_state_id'`, `'out_of_reach'`, `'no_active_break'`,
`'attack_cooldown'`, `'max_projectiles'`, and so on). However, there is **no systematic, cross-cutting
adversarial contract** covering four categories that a hostile or buggy client can exploit:

1. **Malformed input** — non-finite/oversized/type-unsafe fields, unknown message ids, wrong field
   arity, empty strings, out-of-range slot/block/entity ids. Each module handles these
   idiosyncratically (some throw, some return `null`, some return rejection results), and there is no
   bounded-size policy for strings and arrays.
2. **Duplicate/replay messages** — the same message id, tick, or `stateId` submitted twice. Movement
   and combat detect stale ticks and inventory detects stale `stateId`, but there is no
   connection-level message-sequence replay detector, and several handlers accept idempotent
   re-submissions that are only safe because their own state has advanced.
3. **Out-of-order messages** — ticks or sequences arriving in a non-monotonic order (e.g. a message
   carrying a tick lower than the last accepted tick, or a `finish` break before a `start`).
4. **Rate abuse** — rapid-fire messages that exhaust server resources or bypass cooldowns. Some limits
   exist (combat `attack_cooldown`/`max_projectiles`, chunk snapshot eviction, entity `maxTracked`),
   but there is no uniform per-message-type rate policy, and no integrity/regression suite asserts
   that an adversarial burst leaves no state corruption.

Without this change, these behaviors are only incidentally protected by each module's own code and are
not guaranteed by a testable contract, so a future change could silently weaken them.

## Goals

- Define and enforce a **single cross-cutting adversarial contract** for the four categories above,
  stated as MUST/SHALL/MUST NOT requirements with GIVEN/WHEN/THEN scenarios.
- Add a small, pure, headless **`NetworkAdversarialGuard`** module that fills the two genuine gaps no
  existing handler covers: (a) connection-level message-sequence **replay/ordering** detection and
  (b) **per-message-type rate limiting** on tick time, plus shared **bounded-domain** helpers for
  oversized strings/arrays.
- Harden and **characterize** every existing client-bound message handler so that malformed input,
  duplicates, out-of-order sequences, and rate abuse are rejected with the handler's documented reason
  and never mutate authoritative state.
- Deliver an **adversarial integrity test suite** across all network message handlers (223, 225, 226,
  227, 229, 230, 231, 232, and 233's message types by reference) that pins current rejection reasons
  as authoritative and proves state integrity under adversarial schedules.
- Keep all behavior deterministic and headless (no DOM, no transport, no IO), matching the established
  simulation-module pattern.

## Non-goals

- No new transport layer, no real socket/WebSocket wiring, and no new wire-format changes to the 223
  protocol itself.
- No gameplay-rule changes: reach distances, cooldowns, caps, and rejection reasons are **taken as
  authoritative** from the modules that define them (e.g. `CombatValidator` in 232, `MovementAuthority`
  in 227, `InventoryTransactionValidator` in 231). This change adds enforcement and tests; it does not
  rebalance combat, movement, or inventory.
- No changes to 233's chat/command semantics, 234's persistence, 235's reconnect recovery, or 236's
  load-test fixtures. 235's reconnect recovery will interact with the sequence guard (a reconnect resets
  the connection sequence), but 235's own contract is authored separately and is out of scope here.
- No performance benchmark harness (238) and no long-session memory stress (239). This change only
  establishes bounded-size and bounded-rate *policies* with tests; measuring throughput/latency/memory
  over saturated workers belongs to 238/239.
- No changes to `PROGRAM_STATE.json`, `PROGRAM_STATE.md`, `CHANGE_SEQUENCE.md`, or
  `CHANGE_SEQUENCE_OVERRIDES.md`.

## Preconditions

- 232 `combat-networking` is VERIFIED and its `CombatValidator` rejection reasons
  (`'out_of_reach'`, `'no_target'`, `'target_dead'`, `'stale_tick'`, `'attack_cooldown'`,
  `'no_ammo'`, `'not_charged'`, `'fire_too_fast'`, `'origin_mismatch'`, `'invalid_direction'`,
  `'max_projectiles'`) are authoritative.
- 233 `chat-and-command-networking` is VERIFIED before this change becomes ACTIVE; its message types are
  referenced by name only and reconciled per `SPEC_AUTHORING_PROTOCOL.md` final reconciliation.
- The baseline verification gate runs green on the change prior to this one.

## Dependencies

- 223 `network-protocol-codecs` — `decodeMessage`/`createNetworkProtocol` are the decoding boundary the
  guard composes with.
- 225 `connection-lifecycle` — the sequence guard is connection-scoped; a disconnect/reconnect resets it.
- 226, 227, 229, 230, 231, 232 — the client-bound message handlers whose rejection reasons this change
  pins and hardens.
- 233 `chat-and-command-networking` — chat/command message types routed through the guard (by
  reference; exact fields reconciled at implementation).
- 055 `simulation-test-harness` and the existing unit-test conventions — the adversarial tests are plain
  headless Vitest unit tests like `tests/unit/CombatNetworking.test.ts`.

## Proposed change

1. **`src/simulation/NetworkAdversarialGuard.ts`** (NEW, pure, headless): a small additive module
   providing
   - `MessageSequenceGuard` — per-connection monotonic message-sequence tracking that returns
     `'accept'`, `'duplicate'`, or `'out_of_order'` for each integer sequence, resets on reconnect;
   - `MessageRateLimiter` — per-message-kind tick-window rate policy (`{ maxPerWindow, windowTicks }`)
     with a configurable default, rejecting `'rate_limited'` bursts;
   - bounded-domain helpers (`boundedString`, `boundedArray`, safe-int/finite checks) with configurable
     `maxStringLength` / `maxArrayLength`;
   - `AdversarialMessageGuard.inspectIncoming(protocol, envelope, tick, sequence?)` that composes 223
     decoding + sequence + domain + rate checks into a typed accept/reject result.
2. **Harden existing handlers** where they currently lack a check that the adversarial contract
   mandates (e.g. oversized string/array bounds on tracked data, section payloads, chat/command bodies
   by reference), without changing any documented rejection reason or gameplay constant.
3. **Adversarial integrity test suite** (`tests/unit/NetworkAdversarialGuard.test.ts` plus per-module
   adversarial additions and/or characterization) covering malformed, duplicate, out-of-order, and
   rate-abusive inputs across every handler, asserting the documented rejection reason and that
   authoritative state is unchanged.
4. Full baseline gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
   `npm run test:e2e`.

## Compatibility and migration

- Purely additive. New module and new test files; no existing public API changes, no save-format
  change, no protocol change.
- Existing rejection reasons are preserved verbatim and treated as authoritative; the guard adds new
  reasons (`'duplicate_message'`, `'out_of_order'`, `'rate_limited'`, `'oversized_field'`) only for
  checks no existing module performed.
- The sequence guard is reset by the connection lifecycle's disconnect/reconnect, so 235 reconnect
  recovery remains compatible (the resynchronization contract in 235 is authored separately).
- No migration of stored data.

## Risks

- **Scope creep into 233/235**: the guard touches message routing and connection state. Mitigated by
  referencing 233 message types by name only, keeping the sequence guard reset rule aligned with the
  existing `ConnectionLifecycle.reset()`, and explicitly excluding 234/235/236/238/239 in Non-goals.
- **Changing authoritative rejection behavior**: adding a check could change a currently-accepted
  message into a rejected one. Mitigated by only *adding* checks the contract mandates, preserving
  existing reasons, and running the full regression gate so any behavior change is caught.
- **Rate-limiter false positives on legitimate play**: Mitigated by configurable per-kind limits with a
  conservative default and by integrating the guard as a rejection (not a hard disconnect) so a
  transient burst degrades to dropped messages rather than dropping the connection.
- **Over-engineering a dispatcher that does not yet exist**: the guard's `inspectIncoming` is specified
  to accept an envelope and compose checks, but it is transport-agnostic; the implementer wires it where
  envelopes are dispatched and reconciles exact wiring per the protocol's final reconciliation step.

## Rollback strategy

The change is additive and isolated to `src/simulation/NetworkAdversarialGuard.ts` plus tests and small
handler hardening. Rollback is: revert the guard module and the hardening edits; the baseline gate
remains green because no existing behavior is removed. The guard is a rejection layer, not a state
writer, so disabling it restores pre-237 dispatch behavior.

## Definition of Done

- `src/simulation/NetworkAdversarialGuard.ts` implements `MessageSequenceGuard`, `MessageRateLimiter`,
  bounded-domain helpers, and `inspectIncoming` with the MUST/SHALL behavior in the three capability
  specs.
- Every requirement in all three capability specs (`malformed-input-validation`,
  `duplicate-out-of-order-handling`, `rate-limiting-integrity`) is covered by at least one passing
  GIVEN/WHEN/THEN test.
- Each existing handler's documented rejection reason is asserted by at least one adversarial test.
- Rejected messages never mutate authoritative state; adversarial bursts leave state intact and bounded.
- All tasks in `tasks.md` complete; full baseline gate passes; `verification.md` reports real evidence.

## Advancement gate

Target 100% task completion with all mandatory requirements and the full baseline gate passing. If an
incomplete task is non-blocking and implements/verifies no MUST/SHALL requirement, advancement below
100% requires an explicit Advancement Exception in `verification.md` per `AGENTS.md`. Advancement is
forbidden below 90% or with any failed/unverified MUST/SHALL requirement.
