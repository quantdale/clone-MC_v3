# Spec: rate-limiting-and-integrity

## Contract

Cross-cutting adversarial contract that rapid-fire and abusive message volumes are rejected or bounded
without exhausting server resources or corrupting authoritative state, and that an adversarial burst
leaves every counter, store, and registry within its documented bound with no partial or duplicated
effects. This covers the new per-message-type `MessageRateLimiter`, the existing module-level caps and
cooldowns (combat `'attack_cooldown'`/`'fire_too_fast'`/`'max_projectiles'`, block `'break_too_fast'`,
chunk snapshot eviction, entity `maxTracked`, connection history limit), and the integrity guarantees
(exactly-once consumption and determinism) that make an adversarial burst safe.

## Definitions

- **Rate limit**: `{ maxPerWindow, windowTicks }` — at most `maxPerWindow` submissions of a message
  kind are allowed within any rolling `windowTicks`-tick window.
- **Kind**: a message name (223) or a distinct request type (e.g. `'melee_attack'`, `'projectile_fire'`
  from 232, `'slot_click'` from 231, or a chat message kind from 233).
- **Cooldown**: an existing per-player/per-kind server-enforced minimum interval (232 `minAttackIntervalTicks`,
  232 charge-plausibility, 230 `minBreakTicks`).
- **Cap**: an existing hard bound (`maxProjectiles` 232, `maxTracked` 229, `maxSnapshots` 226,
  `historyLimit` 225).
- **Integrity**: rejection of rate-abusive input MUST NOT mutate state; accepted effects MUST be applied
  exactly once and deterministically.

## Invariants

- **Bounded resources**: rate counters, the sequence, chunk snapshots, tracked entities, live
  projectiles, and transition history are all bounded; no adversarial burst grows them unboundedly.
- **Rejection without mutation**: a rate-limited message MUST NOT mutate any authoritative state and
  MUST NOT count toward the module's cooldown caps it did not pass.
- **Exactly-once**: an accepted effect (attack, fire, break, transaction, event) is applied exactly
  once regardless of surrounding rejection volume.
- **Determinism**: identical tick-indexed bursts MUST produce identical acceptance/rejection traces and
  identical final state across repeated runs.

## Requirements

### Requirement: per-message-type rate limiting

`MessageRateLimiter.submit(kind, tick)` MUST allow a submission while the count of `kind` in the last
`windowTicks` ticks is below `maxPerWindow`, MUST reject (return `false`, mapped to `'rate_limited'`)
once the window is full without incrementing the count, MUST slide the window with tick, and MUST apply
a configured `defaultLimit` to unconfigured kinds.

#### Scenario: burst below the window limit is accepted
- **GIVEN** `MessageRateLimiter` with `defaultLimit: { maxPerWindow: 5, windowTicks: 20 }`.
- **WHEN** 5 submissions of `'melee_attack'` at ticks 100..104 are made.
- **THEN** all 5 MUST return `true`.

#### Scenario: burst above the window limit is rate-limited without counting
- **GIVEN** the same limiter and 5 accepted `'melee_attack'` submissions at ticks 100..104.
- **WHEN** a 6th `'melee_attack'` submission is made at tick 105.
- **THEN** it MUST return `false`; a submission at tick 106 MUST also return `false`; and the counters
  MUST NOT have grown from the two rejected submissions.

#### Scenario: window slides with tick and re-opens
- **GIVEN** the same limiter and the window full at tick 105.
- **WHEN** submissions resume at tick 124 (beyond `100 + 20`).
- **THEN** a fresh submission MUST return `true` (the window slid and re-opened).

#### Scenario: per-kind limits override the default
- **GIVEN** `limits: { 'chat': { maxPerWindow: 2, windowTicks: 20 } }` and a `defaultLimit` of 20.
- **WHEN** 3 `'chat'` submissions (kind defined by 233, by reference) are made at ticks 100..102.
- **THEN** the first two MUST return `true` and the third MUST return `false`.

### Requirement: guard composes the rate check into dispatch

`AdversarialMessageGuard.inspectIncoming` MUST reject `'rate_limited'` when `MessageRateLimiter.submit`
returns `false` for the decoded message kind at the current tick, after codec and domain checks pass and
the sequence check accepts.

#### Scenario: rate-limited message is rejected at the guard
- **GIVEN** a guard with a 1-per-window limit on a message kind and one already-accepted submission at
  tick 100.
- **WHEN** a second envelope of the same kind is inspected at tick 101.
- **THEN** the result MUST be `{ dispatch: false, reason: 'rate_limited' }` and no handler runs.

### Requirement: module cooldowns are enforced as rate limits

The combat, block-interaction, and movement handlers MUST enforce their documented server-side
intervals: combat `'attack_cooldown'` for melee inside `minAttackIntervalTicks`, combat
`'fire_too_fast'` for a fire whose claimed charge exceeds the elapsed ticks, and block `'break_too_fast'`
for a break `finish` inside `minBreakTicks`; a rejected rapid-fire submission MUST NOT advance the
underlying cooldown timer.

#### Scenario: rapid melee attacks are cooldown-limited
- **GIVEN** `minAttackIntervalTicks: 10` and an accepted melee attack at tick 100.
- **WHEN** attacks at ticks 102, 104, 106 are submitted.
- **THEN** each MUST be rejected `'attack_cooldown'` and `lastAttackTick` MUST remain 100.

#### Scenario: impossible charge claim is rate-limited
- **GIVEN** an accepted fire at tick 400 and `maxChargeTicks: 20`.
- **WHEN** a second fire at tick 410 claims `chargeTicks: 20`.
- **THEN** it MUST be rejected `'fire_too_fast'` and no arrow MUST be consumed.

#### Scenario: rapid break finish is limited
- **GIVEN** `minBreakTicks: 5`, a break started at tick 100, and finishes at ticks 101, 102, 103.
- **WHEN** each is submitted.
- **THEN** the first three MUST be rejected `'break_too_fast'` and the active break MUST remain until a
  finish at tick 105 succeeds.

### Requirement: resource caps bound adversarial volume

The module-level caps MUST hold under a burst: `CombatValidator` live projectiles MUST never exceed
`maxProjectiles` (`'max_projectiles'` rejection), `EntityReplicationManager` authoritative entities MUST
never exceed `maxTracked`, `ChunkStreamManager` stored snapshots MUST never exceed `maxSnapshots`
(oldest-first eviction), and the connection transition history MUST never exceed `historyLimit`.

#### Scenario: projectile cap rejects excess fire
- **GIVEN** `maxProjectiles: 1` and one live projectile.
- **WHEN** a second fire request is submitted.
- **THEN** it MUST be rejected `'max_projectiles'` and `projectileCount` MUST remain 1.

#### Scenario: entity cap rejects a new entity over the limit
- **GIVEN** `EntityReplicationManager` with `maxTracked` already reached.
- **WHEN** `upsertEntity` registers a new id.
- **THEN** it MUST throw an error matching `EntityReplication:` and `authoritativeCount` MUST be
  unchanged.

#### Scenario: chunk snapshot store evicts oldest when full
- **GIVEN** `maxSnapshots: 2` with keys `"0,0"` and `"1,0"` stored.
- **WHEN** `putSnapshot` stores `"2,0"`.
- **THEN** the store MUST contain exactly 2 snapshots and `"0,0"` MUST have been evicted.

#### Scenario: connection history is bounded
- **GIVEN** `historyLimit: 3`.
- **WHEN** 5 transitions are applied.
- **THEN** `history` MUST contain exactly the 3 most recent transitions.

### Requirement: adversarial burst preserves integrity

After a scripted adversarial burst (malformed + duplicates + out-of-order + rate abuse across all
handlers), every authoritative counter, store, and registry MUST remain within its documented bound,
consistent, and unchanged except for the single accepted effects; and replication events MUST be consumed
exactly once.

#### Scenario: burst leaves combat state consistent and exactly-once
- **GIVEN** a `CombatValidator` bombarded with a mix of malformed attacks, replayed ticks, cooldown
  violations, excess fires, and rate-abusive submissions, interspersed with a single accepted attack.
- **WHEN** the burst completes and `stepProjectiles` is called.
- **THEN** `projectileCount` MUST be within `maxProjectiles`, the single accepted attack MUST appear in
  exactly one batch and be drained, and repeated replay of the burst MUST produce identical traces.

#### Scenario: burst leaves inventory and movement state consistent
- **GIVEN** `InventoryTransactionValidator` and `MovementAuthority` each fed a mix of wrong-`stateId`
  replays, stale ticks, and rate abuse around one accepted transaction/intent.
- **WHEN** the burst completes.
- **THEN** `currentStateId`/`currentSlots` and `position`/`lastTick` MUST reflect exactly the one
  accepted operation and nothing else.

### Requirement: determinism under adversarial schedules

Identical tick-indexed adversarial schedules MUST produce identical acceptance/rejection traces and
identical final state across repeated runs on fresh handler instances.

#### Scenario: repeated adversarial schedules are identical
- **GIVEN** a fixed scripted schedule mixing malformed, duplicate, out-of-order, and rate-abusive
  inputs across the movement, inventory, block, entity, and combat handlers.
- **WHEN** the schedule is executed twice on fresh instances.
- **THEN** all results and final state MUST be deep-equal between the two runs.

## Error and failure behavior

- Rate limiter: returns `false` (mapped to `'rate_limited'`); a non-integer/non-negative tick or a
  non-string kind throws `NetworkAdversarial: <detail>`.
- Module cooldowns: documented reasons returned (`'attack_cooldown'`, `'fire_too_fast'`,
  `'break_too_fast'`, `'max_projectiles'`); entity cap throws `EntityReplication: <detail>`; chunk store
  evicts rather than throwing when at capacity; connection history drops oldest rather than throwing.
- Rate-limited/rejected submissions MUST NOT advance cooldown timers or mutate state.

## Performance and resource bounds

- Rate limiter O(1) per submission over a bounded window and O(kinds) on configuration; all storage
  bounded by `maxPerWindow`/kinds and the existing caps. No unbounded growth under any burst.

## Compatibility and migration

- Additive. The guard adds `'rate_limited'`; all existing cooldown/cap reasons are preserved verbatim.
  No protocol, save-format, or connection-semantics change (the guard rejects messages, never
  disconnects; connection semantics stay with 225/235).

## Security and integrity

- Rate abuse and resource-exhaustion attacks (flooding, cooldown bypass, projectile/entity/snapshot
  flooding) are bounded at the guard and module levels; integrity tests prove no partial, duplicated, or
  out-of-bound effects survive a burst.

## Observability

- `MessageRateLimiter` per-kind counters; `CombatValidator.projectileCount`; `EntityReplicationManager`
  `authoritativeCount`/`trackedCount`; `ChunkStreamManager` store size; `ConnectionLifecycle.history`
  length; `InventoryTransactionValidator.currentStateId`; `MovementAuthority.lastTick`/`position`. Each
  is the "within bounds / exactly-once" probe for integrity tests.

## Verification mapping

| Requirement | Test / command |
|---|---|
| REQ-R1 per-kind rate limiter | `tests/unit/NetworkAdversarialGuard.test.ts` › rate window/slide/override |
| REQ-R2 guard rate composition | `tests/unit/NetworkAdversarialGuard.test.ts` › inspect rate_limited |
| REQ-R3 module cooldowns | `tests/unit/CombatNetworking.test.ts`, `BlockInteractionNetworking.test.ts` |
| REQ-R4 resource caps | `tests/unit/CombatNetworking.test.ts`, `EntityReplication.test.ts`, `ChunkStreaming.test.ts`, `ConnectionLifecycle.test.ts` |
| REQ-R5 burst integrity | `tests/unit/NetworkAdversarialGuard.test.ts` › burst scenarios |
| REQ-R6 determinism | adversarial schedule determinism case |
