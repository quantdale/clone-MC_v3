# Verification: 237-network-adversarial-validation

Status: VERIFIED
Completion: 100%
Advancement allowed: true

## Requirement evidence

Primary evidence: `tests/unit/NetworkAdversarialGuard.test.ts` (30 tests, guard + burst integrity) plus
new adversarial describes in `MovementAuthority.test.ts`, `CombatNetworking.test.ts`,
`InventoryTransactionNetworking.test.ts`, `BlockInteractionNetworking.test.ts`, `ChunkStreaming.test.ts`,
`EntityReplication.test.ts`, and `ConnectionLifecycle.test.ts` (22 new tests across those files). All
passing in the final gate run. Existing verified tests already characterize many documented reasons and
state-unchanged guarantees; the new describes pin the spec scenarios and the additive hardening bounds.

| Requirement | Evidence | Status |
|---|---|---|
| REQ-M1 envelope integrity via 223 codecs | `NetworkAdversarialGuard.test.ts` › unknown id 99 → `unknown_message_id`; wrong arity `[]`/`[1,2]`/extra value → `malformed_fields`; type-unsafe values (`1.5` for int, `NaN` for float, `5` for string, `'yes'` for bool) → `malformed_fields` | PASS |
| REQ-M2 oversized/empty fields | `NetworkAdversarialGuard.test.ts` › over-length string (17 > `maxStringLength` 16) → `oversized_field`, exactly-at-boundary accepted; `ChunkStreaming.test.ts` adversarial › `maxSectionsPerSnapshot`/`maxSectionDataLength` reject without storing; `EntityReplication.test.ts` adversarial › `maxTrackedDataItems` reject on upsert/update without mutating the pool; empty-body rejection stays with validators (229 `EntityReplication: type must be a non-empty string`, 233 `empty_message`) per the spec amendment | PASS |
| REQ-M3 typed request field validation | Existing `CombatNetworking.test.ts` › malformed request fields throw `Combat:` (targetId -1, NaN origin, non-safe chargeTicks, non-bool raised); `MovementAuthority.test.ts` › non-finite position/non-safe-int tick throw; `InventoryTransactionNetworking.test.ts` › out-of-range slot throws; `BlockInteractionNetworking.test.ts` › invalid face throws | PASS |
| REQ-M4 malformed input never mutates state | New adversarial describes assert state unchanged on rejection/throw: `MovementAuthority` position/lastTick; `InventoryTransactionValidator` currentStateId/currentSlots; `CombatValidator` projectileCount/lastAttackTick; `BlockInteractionValidator` active-break map; `EntityReplicationManager` authoritativeCount; `ChunkStreamManager` store | PASS |
| REQ-M5 malformed seam/host output rejected | Existing `CombatNetworking.test.ts` › malformed seam target/stats throw `Combat:`; new adversarial › malformed seam target throws without regressing the tracker; `ChunkStreaming.test.ts` › key-mismatch / duplicate-y / empty-section / negative-data snapshots throw `ChunkStream:` and are never stored | PASS |
| REQ-D1 connection message sequence guard | `NetworkAdversarialGuard.test.ts` › `MessageSequenceGuard`: equal → `duplicate`, lower → `out_of_order`, monotonic advance, `reset()` fresh epoch, non-safe-int throw; `inspectIncoming` integration › replayed/out-of-order sequence → `duplicate_message`/`out_of_order`, handler not run | PASS |
| REQ-D2 movement stale-tick/reorder | `MovementAuthority.test.ts` adversarial › replayed (equal) and out-of-order (lower) ticks → `stale tick` with position/lastTick unchanged; teleport legitimately resets ordering | PASS |
| REQ-D3 combat stale-tick replay | Existing `CombatNetworking.test.ts` › replayed melee tick → `stale_tick` (third attack at 110 accepted), replayed shield → `stale_tick` with `getShieldRaised` preserved; new adversarial cooldown integrity › `attack_cooldown` does not advance the tracker | PASS |
| REQ-D4 inventory stateId replay | `InventoryTransactionNetworking.test.ts` adversarial › replayed `stateId` → `wrong_state_id`, currentStateId/currentSlots unchanged, authoritative snapshot returned | PASS |
| REQ-D5 block-break sequence ordering | `BlockInteractionNetworking.test.ts` adversarial › finish without start → `no_active_break` (map empty); finish for a different reachable block → `no_active_break` preserving the active break; finishes inside `minBreakTicks` → `break_too_fast` preserving the active break, later finish accepted | PASS |
| REQ-D6 inventory drag lifecycle ordering | `InventoryTransactionNetworking.test.ts` adversarial › drag end without start → `drag_not_started` (slots/stateId unchanged); duplicate drag start → `drag_not_started` without disturbing the active drag (add + end still completes) | PASS |
| REQ-D7 idempotent server→client application | Existing `ChunkStreaming.test.ts` › snapshot replacement is idempotent (exactly one key, updated payload) and duplicate section `y` throws; `EntityReplication.test.ts` › client-store spawn/despawn apply is idempotent (`hasEntity` false after despawn); `CombatNetworking.test.ts` › `stepProjectiles` consumes queued events exactly once | PASS |
| REQ-R1 per-message-type rate limiter | `NetworkAdversarialGuard.test.ts` › `MessageRateLimiter`: burst below limit accepted, overflow rate-limited without counting, window slides and re-opens, per-kind override above default, default fallback, boundary at limit, non-string kind / non-safe-int tick throw | PASS |
| REQ-R2 guard composes rate check into dispatch | `NetworkAdversarialGuard.test.ts` › a guard with a 1-per-window limit accepts once then rejects the second envelope `rate_limited` after codec/sequence pass | PASS |
| REQ-R3 module cooldowns as rate limits | Existing `CombatNetworking.test.ts` › `attack_cooldown` (melee inside `minAttackIntervalTicks`), `fire_too_fast` (charge exceeds elapsed); `BlockInteractionNetworking.test.ts` › `break_too_fast`; rejected submissions never advance the cooldown timer (new adversarial asserts) | PASS |
| REQ-R4 resource caps bound adversarial volume | `CombatNetworking.test.ts` › `max_projectiles` keeps `projectileCount` at the cap; `EntityReplication.test.ts` › `maxTracked` throws without mutating count, plus new `maxTrackedDataItems`; `ChunkStreaming.test.ts` › `maxSnapshots` oldest-first eviction, plus new section/data bounds; `ConnectionLifecycle.test.ts` adversarial › history bounded to `historyLimit` | PASS |
| REQ-R5 adversarial burst preserves integrity | `NetworkAdversarialGuard.test.ts` › burst-integrity describe: a mixed malformed + replay + out-of-order + cap burst across MovementAuthority/InventoryTransactionValidator/CombatValidator leaves movement at only the accepted intent, inventory at exactly one accepted transaction (stateId 1), combat within `maxProjectiles` with the single accepted fire in exactly one result and the second capped | PASS |
| REQ-R6 determinism under adversarial schedules | `NetworkAdversarialGuard.test.ts` › determinism describe (identical malformed/replay/out-of-order/rate schedule on the guard yields identical traces and `lastAccepted`) and burst-integrity determinism (repeated bursts deep-equal) | PASS |

## Commands

| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | PASS | `tsc --noEmit`, exit 0 (whole repo) |
| npm run lint | PASS | `eslint .`, exit 0 (whole repo) |
| npm test | PASS | 262 files, 3440/3440 passed + 1 skipped (3441 total; prior 3388 + 52 new: NetworkAdversarialGuard 30, MovementAuthority +2, ChunkStreaming +4, EntityReplication +4, InventoryTransaction +3, BlockInteraction +3, ConnectionLifecycle +3, CombatNetworking +3) |
| npm run build | PASS | `tsc --noEmit && vite build`, 105 modules, exit 0 |
| npm run test:e2e | PASS | 22/22 Playwright tests (2.0m) |

## Edge/adversarial validation

- Guard: unknown message id, wrong arity, type-unsafe values (non-safe int, non-finite float, number-for-string, string-for-bool) all rejected at the codec boundary with the documented `unknown_message_id`/`malformed_fields`; over-length strings and oversized collections rejected `oversized_field`; replayed/out-of-order sequences rejected `duplicate_message`/`out_of_order`; per-kind bursts rate-limited `rate_limited` without counting; reset restores a fresh sequence + rate epoch.
- Handlers: replayed/out-of-order movement ticks (`stale tick`), combat (`stale_tick`, `attack_cooldown`, `fire_too_fast`, `max_projectiles`), inventory (`wrong_state_id`, `drag_not_started`), block break (`no_active_break`, `break_too_fast`) all preserve authoritative state; malformed seam/snapshot outputs throw `Combat:`/`ChunkStream:` and never apply; idempotent server→client application (chunk snapshot replacement, entity-store batch, combat batch exactly-once) holds.
- Boundary cases asserted: string exactly at `maxStringLength` accepted and one over rejected; rate window exactly at `maxPerWindow` accepted and overflow rejected; window slide re-opens; `minBreakTicks` boundary (finish at tick 105 with `minBreakTicks` 5) accepted; sequence exactly `lastAccepted` rejected `duplicate`.

## Migration/compatibility validation

- Additive: one new module (`src/simulation/NetworkAdversarialGuard.ts`, consumed only by tests and available as a dispatch gate) and additive, configurable bounded-array options on 226 (`maxSectionsPerSnapshot`, `maxSectionDataLength`) and 229 (`maxTrackedDataItems`) with generous defaults. No existing production symbol, public API, wire contract, persistent data, or protocol version changed; all documented rejection reasons preserved verbatim.
- Wiring reconciliation (recorded in design.md): no central dispatcher exists, so `inspectIncoming` IS the dispatch gate; 223 wire values are scalar-only, so array bounds are enforced by the typed modules' caps; the sequence-guard reset on disconnect/reconnect is a documented wiring contract (`AdversarialMessageGuard.reset()` called on `ConnectionLifecycle.reset()`, proven by unit test) and `ConnectionLifecycle` itself is unmodified, keeping 235 reconnect recovery compatible.
- Full regression gate (existing 3388 unit + 22 e2e) stays green with the new suite; build stays at 105 modules; the guard and all new tests are pure and headless (no DOM/IO/transport).

## Performance/resource validation

- Guard checks are O(1) amortized per message: sequence (constant), rate limiter (O(kinds) on config, bounded window per kind), domain checks O(fields) over scalar wire values.
- All storage bounded: sequence last value, per-kind rate counters (capped at `maxPerWindow`), and the existing module caps (`maxSnapshots`, `maxTracked`, `maxProjectiles`, `historyLimit`) plus the new additive caps (`maxTrackedDataItems`, `maxSectionsPerSnapshot`, `maxSectionDataLength`). The burst-integrity and determinism tests prove no unbounded growth under adversarial schedules.

## Regressions

None. Full suite green in the final gate run: typecheck PASS, lint PASS, unit 3440/3440 + 1 skipped, build PASS (105 modules), e2e 22/22.

## Incomplete tasks

None. All 15 tasks complete (`tasks.md` all `[x]`).

## Advancement Exception

Not applicable — completion is 100%.

## Final decision

VERIFIED. Change 237-network-adversarial-validation is complete and may advance. Next change: 238-worker-and-main-thread-stress.
