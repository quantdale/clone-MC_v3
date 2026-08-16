# Tasks: 237-network-adversarial-validation

## Group 1 — Baseline and characterization

- [x] 1.1 Baseline verification gate on the current HEAD (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`) and record the pre-change unit/e2e counts in `verification.md`.
- [x] 1.2 Characterize the current adversarial behavior of every client-bound handler in focused tests that assert, for malformed/duplicate/out-of-order/rate-abusive inputs, the *documented* rejection reason (e.g. `MovementAuthority` `'stale tick'`, `CombatValidator` `'stale_tick'`/`'attack_cooldown'`/`'max_projectiles'`, `InventoryTransactionValidator` `'wrong_state_id'`/`'drag_not_started'`, `BlockInteractionValidator` `'no_active_break'`/`'break_too_fast'`, 226/229 throw conventions) and that authoritative state is unchanged.
- [x] 1.3 Record any gap where a currently-accepted malformed input should be rejected per the adversarial contract (oversized strings/arrays, empty bodies), and list it in `verification.md` as a hardening target before Group 2.

## Group 2 — Implementation

- [x] 2.1 Implement `src/simulation/NetworkAdversarialGuard.ts`: `MessageSequenceGuard` (`track`/`reset`/`lastAccepted`) with `'accept'`/`'duplicate'`/`'out_of_order'` and `NetworkAdversarial: <detail>` throws for non-safe-int sequences.
- [x] 2.2 Implement `MessageRateLimiter` (`submit(kind, tick)`, per-kind overrides, `defaultLimit`, tick-sliding windows, `reset`) returning allowed/rejected without mutating on rejection.
- [x] 2.3 Implement bounded-domain helpers (`boundedString`/`boundedArray`/`boundedCollection` with `maxStringLength`/`maxArrayLength`/`maxCollectionItems`) and `AdversarialMessageGuard.inspectIncoming(protocol, envelope, tick, sequence?)` composing 223 decode + sequence + domain + rate checks into `InspectResult` (`'unknown_message_id'`, `'malformed_fields'`, `'oversized_field'`, `'duplicate_message'`, `'out_of_order'`, `'rate_limited'`, or dispatch).
- [x] 2.4 Wire the guard into the dispatch point that routes decoded envelopes to typed validators; thread 233 chat/command message kinds (by reference) through the rate/domain checks; apply `maxArrayLength` bounds to 229 `trackedData` and 226 `sections`/`data` without changing any documented rejection reason; reset the sequence guard on the 225 disconnect/reconnect lifecycle.

## Group 3 — Focused unit tests

- [x] 3.1 Unit tests for `MessageSequenceGuard`: replay `'duplicate'`, lower `'out_of_order'`, monotonic advance, `reset()` fresh epoch, non-safe-int throw.
- [x] 3.2 Unit tests for `MessageRateLimiter`: window accept/limit, slide/re-open, per-kind override, `defaultLimit` fallback, non-integer tick / non-string kind throw.
- [x] 3.3 Unit tests for `AdversarialMessageGuard.inspectIncoming`: unknown id, wrong arity, type mismatch, oversized string/array/empty body, `'duplicate_message'`/`'out_of_order'` via sequence, `'rate_limited'` via rate limiter, and a valid envelope dispatching through.
- [x] 3.4 Unit tests mapping each capability requirement to a GIVEN/WHEN/THEN case: malformed-input (REQ-M1..M5), duplicate/out-of-order (REQ-D1..D7), rate-limiting/integrity (REQ-R1..R6).

## Group 4 — Edge/failure, integration, regression, gate

- [x] 4.1 Adversarial integration tests across handlers: a mixed burst (malformed + replay + out-of-order + rate abuse) fed to 227/231/232/230/229/226/225 leaves state bounded and consistent; replication events consumed exactly once; 233 kinds routed (by reference) through the guard.
- [x] 4.2 Edge/failure tests: boundary inputs (sequence exactly last, window exactly at limit, string exactly `maxStringLength`, tick at the slide boundary, break exactly at `minBreakTicks`) are accepted; just-beyond boundaries are rejected.
- [x] 4.3 Regression gate: full `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`; confirm no documented rejection reason changed and pre-existing tests are green.
- [x] 4.4 Final gate and state update: all mandatory requirements implemented and verified with no unresolved MUST/SHALL failure; update `verification.md`, `openspec/PROGRAM_STATE.json`, and `openspec/PROGRAM_STATE.md` with real evidence and advance the change to VERIFIED at 100% (or via an explicit, evidenced Advancement Exception in `verification.md` for any non-blocking incomplete task).
