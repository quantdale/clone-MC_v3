# Spec: combat-networking

## Contract

Pure headless combat networking framework: server-authoritative validation of melee attack, projectile fire, and shield-block requests; server-owned per-tick projectile stepping; server-computed damage/knockback through the existing 141/143 math with health/armor and shield damage routed through host seams; deterministic per-tick `CombatReplicationBatch` accumulation; and client-side prediction/rollback plus a client projectile mirror. No DOM, no transport, no `src/player` imports.

## Definitions

- **Attacker position**: the authoritative position the host passes for reach/fire-origin checks (227 movement state).
- **Attack interval**: `minAttackIntervalTicks` — the server-enforced floor between a player's accepted attacks; violations are rejected `'attack_cooldown'`.
- **Cooldown damage**: 141 `computeAttackDamage` scaling from the server-measured `ticksSinceLastAttack`.
- **Target**: an entity or player registered in the host's `getTarget` seam; identified by a non-negative `targetId` (a defending player is registered under its `playerId`).
- **I-frames**: 141 `InvulnerabilityTracker` window (`invulnerabilityTicks`, default 10) shared by melee and projectile hits on the same target.
- **Charge**: `chargeTicks` claimed by the firing client, clamped to `[0, maxChargeTicks]` (default 20, full draw).
- **Replication batch**: per-tick server output (`meleeHits`, `projectileSpawns`, `projectileSteps`, `projectileHits`, `projectileDespawns`) broadcast to observers.
- **Rollback directive**: client-side instruction to undo an optimistic combat prediction.

## Invariants

- **Reach invariant**: a melee attack MUST be rejected `'out_of_reach'` when the Euclidean distance from the attacker position to the target center exceeds `maxAttackReach + target.radius`.
- **Server-time invariant**: the server MUST measure attack/fire intervals from its own recorded tick per player; client claims MUST NOT influence damage or acceptance timing.
- **One-arrow invariant**: an accepted fire MUST consume exactly one arrow via the ammo seam; a rejected fire MUST NOT consume any.
- **Authoritative damage invariant**: melee raw damage MUST come from 141 `resolveMeleeAttack`/`computeAttackDamage`; arrow raw damage MUST come from 143 `computeArrowDamage` using the pre-impact speed.
- **I-frame invariant**: a target within its i-frame window MUST register `applied: false` with zero damage/knockback and no shield check.
- **Shield invariant**: a raised, non-disabled shield facing the attacker within the block arc MUST block the hit: zero health damage, `blocked: true`, durability damage `>= 1`, knockback null; an axe block MUST disable the shield for the 144 cooldown duration.
- **Consumption invariant**: every queued melee hit and projectile spawn MUST appear in exactly one batch and be cleared on drain.
- **Order invariant**: batch projectile entries MUST be ordered by projectile id ascending; melee hits MUST keep request-processing order.
- **Determinism invariant**: identical inputs MUST produce identical results and batches across repeated runs.

## Requirements

### Requirement: REQ-1 Melee Attack Request Validation

`CombatValidator.submitMeleeAttack` SHALL validate attacker position, request fields, target existence/aliveness, reach, tick ordering, and the server-enforced attack interval.

#### Scenario: In-reach attack against a valid target is accepted
- **GIVEN** an attacker at `(0, 0, 0)` and a target at `(2, 0, 0)` with radius 0.6 and `alive: true`.
- **WHEN** a `MeleeAttackRequest` with `playerId: 1`, `tick: 100`, `targetId: 7` is submitted with `maxAttackReach = 3.0`.
- **THEN** the result MUST be `accepted: true` with `kind: 'melee_attack'`, and the returned `hit` MUST be `applied: true`.

#### Scenario: Attack at the exact reach boundary is accepted
- **GIVEN** an attacker at `(0, 0, 0)` and a target with `radius: 0.6` at distance exactly `3.0 + 0.6` from the attacker.
- **WHEN** a melee attack request is submitted with `maxAttackReach = 3.0`.
- **THEN** the result MUST be `accepted: true` (boundary inclusive).

#### Scenario: Attack beyond reach is rejected
- **GIVEN** an attacker at `(0, 0, 0)` and a target at `(10, 0, 10)` (distance ~14.14 > 3.0 + 0.6).
- **WHEN** a melee attack request is submitted.
- **THEN** the result MUST be `{ accepted: false, kind: 'melee_attack', reason: 'out_of_reach' }`.

#### Scenario: Unknown target is rejected
- **GIVEN** the `getTarget` seam returns `null` for `targetId: 99`.
- **WHEN** a melee attack request with `targetId: 99` is submitted.
- **THEN** the result MUST be rejected with reason `'no_target'`.

#### Scenario: Dead target is rejected
- **GIVEN** a target with `alive: false`.
- **WHEN** a melee attack request targeting it is submitted.
- **THEN** the result MUST be rejected with reason `'target_dead'`.

#### Scenario: Replayed or stale tick is rejected
- **GIVEN** an accepted attack by player 1 at `tick: 100`.
- **WHEN** a second attack by player 1 with `tick: 100` (and then `tick: 99`) is submitted.
- **THEN** the result MUST be rejected with reason `'stale_tick'`.

#### Scenario: Attack inside the server interval is rejected
- **GIVEN** `minAttackIntervalTicks = 10` and an accepted attack by player 1 at `tick: 100`.
- **WHEN** a second attack by player 1 at `tick: 105` is submitted.
- **THEN** the result MUST be rejected with reason `'attack_cooldown'`.

---

### Requirement: REQ-2 Authoritative Melee Damage and Knockback

Accepted melee attacks SHALL compute damage and knockback server-side through the 141 math using the server-measured interval, and SHALL record the attacker's last-attack tick.

#### Scenario: Full-interval attack deals cooldown-scaled damage
- **GIVEN** `attacksPerSecond = 1.6`, `knockbackStrength = 0.4`, attacker baseDamage 7, first attack at `tick: 100`.
- **WHEN** a second attack is submitted at `tick: 113` (interval 13 >= 10).
- **THEN** `hit.damage` MUST equal `computeAttackDamage(7, 13, 1.6)` and `hit.applied` MUST be `true`.

#### Scenario: Knockback points away from the attacker
- **GIVEN** attacker at `(0, 0)`, target at `(3, 0)` (distance 3, within `3.0 + 0.6` reach) with zero existing velocity.
- **WHEN** an accepted attack resolves with `knockbackStrength = 0.4`.
- **THEN** `hit.knockback` MUST equal `computeKnockback(0, 0, 3, 0, 0.4, { vx: 0, vy: 0, vz: 0 })` — horizontal push along +X with the vertical pop — and MUST be non-null.

#### Scenario: Invulnerable target registers a non-applied hit
- **GIVEN** a target hit at `tick: 100` and a second attacker hitting the same target at `tick: 105` (inside the 10-tick i-frame window).
- **WHEN** the second attack resolves.
- **THEN** the result MUST be `accepted: true` with `hit.applied === false`, `hit.damage === 0`, `hit.knockback === null`, and no damage sink call for the non-applied hit (the earlier vulnerable hit is the only sink call).

#### Scenario: Attacker tick advances after every accepted swing
- **GIVEN** an accepted but non-applied swing (invulnerable target) at `tick: 200`.
- **WHEN** the same attacker attacks again at `tick: 205`.
- **THEN** the result MUST be rejected `'attack_cooldown'` — the swing consumed the cooldown.

---

### Requirement: REQ-3 Shield Blocking

`CombatValidator.submitShieldBlock` SHALL record per-id shield-raised state with stale-tick rejection, and the melee/projectile damage pipelines SHALL evaluate blocking through the 144 `resolveShieldBlock` math.

#### Scenario: Shield raise request is recorded
- **GIVEN** a `ShieldBlockRequest` with `playerId: 5`, `raised: true`, `tick: 300`.
- **WHEN** it is submitted.
- **THEN** the result MUST be `accepted: true` with `kind: 'shield_block'` and `raised: true`, and `getShieldRaised(5)` MUST return `true`.

#### Scenario: Replayed shield request is rejected
- **GIVEN** a recorded shield request at `tick: 300`.
- **WHEN** the same request with `tick: 300` (or a lower tick) is re-submitted.
- **THEN** the result MUST be rejected with reason `'stale_tick'`.

#### Scenario: Raised shield within arc blocks a melee hit
- **GIVEN** a defender with `raised: true`, `facingYawDegrees` such that the attacker lies within the 90° arc, and incoming melee damage 6.
- **WHEN** the attack resolves.
- **THEN** `hit.blocked` MUST be `true`, `hit.healthRemoved` MUST be `0`, `hit.shieldDurabilityDamage` MUST be `>= 1`, `hit.knockback` MUST be `null`, and the shield durability sink MUST be called with the durability damage.

#### Scenario: Shield outside the arc does not block
- **GIVEN** a defender with `raised: true` facing away from the attacker (bearing difference > 45°).
- **WHEN** the attack resolves.
- **THEN** `hit.blocked` MUST be `false` and the hit applies normally.

#### Scenario: Axe hit disables the shield
- **GIVEN** a raised shield within arc and `getAttackStats` returning `isAxeAttack: true`.
- **WHEN** the axe attack resolves.
- **THEN** the hit MUST be blocked, and a subsequent attack within 100 ticks MUST NOT be blocked (shield disabled), even with the same facing.

#### Scenario: Raised shield blocks a projectile impact
- **GIVEN** a defender with `raised: true` facing the incoming arrow (attacker position = the projectile's impact position, within the 90° arc) and arrow damage 6.
- **WHEN** the projectile step resolves the entity hit.
- **THEN** the hit MUST report `blocked: true`, `healthRemoved: 0`, `knockback: null`, `shieldDurabilityDamage >= 1`, and the damage sink MUST NOT be called.

---

### Requirement: REQ-4 Projectile Fire Request Validation

`CombatValidator.submitProjectileFire` SHALL validate charge bounds and plausibility, ammo, origin plausibility, direction, tick ordering, and the projectile cap.

#### Scenario: Valid full-charge fire is accepted and consumes one arrow
- **GIVEN** an attacker at `(0, 0, 0)` with 3 arrows, `chargeTicks: 20`, origin `(0, 1.6, 0)`, direction `(0, 0, 1)`, first fire at `tick: 400`.
- **WHEN** the fire request is submitted.
- **THEN** the result MUST be `accepted: true` with `kind: 'projectile_fire'`, the ammo seam MUST report 2 arrows remaining, the spawn seam MUST be called once with `spawn.velocity` equal to `computeFireVelocity(0, 0, 1, bowPullProgress(20), baseArrowSpeed)`, and `spawn.ownerId` MUST be the player id.

#### Scenario: No ammo is rejected without consumption
- **GIVEN** an attacker with 0 arrows and `infiniteAmmo: false`.
- **WHEN** a fire request is submitted.
- **THEN** the result MUST be rejected with reason `'no_ammo'` and the ammo seam MUST NOT be called.

#### Scenario: Zero-charge release is rejected
- **GIVEN** `minChargeTicks = 1` and `chargeTicks: 0`.
- **WHEN** a fire request is submitted.
- **THEN** the result MUST be rejected with reason `'not_charged'`.

#### Scenario: Impossible charge claim is rejected
- **GIVEN** an accepted fire at `tick: 400` and `maxChargeTicks = 20`.
- **WHEN** a second fire at `tick: 410` claims `chargeTicks: 20`.
- **THEN** the result MUST be rejected with reason `'fire_too_fast'` (20 > 10 elapsed ticks).

#### Scenario: Fire origin far from the authoritative position is rejected
- **GIVEN** attacker position `(0, 0, 0)` and `maxFireOriginOffset = 2.0`.
- **WHEN** a fire request claims origin `(10, 10, 10)`.
- **THEN** the result MUST be rejected with reason `'origin_mismatch'`.

#### Scenario: Degenerate direction is rejected
- **GIVEN** a fire request with direction `(0, 0, 0)`.
- **WHEN** it is submitted.
- **THEN** the result MUST be rejected with reason `'invalid_direction'`.

#### Scenario: Projectile cap rejects excess fire
- **GIVEN** `maxProjectiles = 1` and one live projectile.
- **WHEN** a second fire request is submitted.
- **THEN** the result MUST be rejected with reason `'max_projectiles'`.

#### Scenario: Over-long charge is clamped, not rejected
- **GIVEN** `maxChargeTicks = 20`, `minChargeTicks = 1`, and `chargeTicks: 500` with at least 20 ticks elapsed since the last fire.
- **WHEN** a fire request is submitted.
- **THEN** the result MUST be accepted and `spawn.velocity` MUST match a full (20-tick) draw.

---

### Requirement: REQ-5 Authoritative Projectile Stepping and Impact

`CombatValidator.stepProjectiles` SHALL step every live projectile through the 142 `stepProjectile` core in id-ascending order and SHALL resolve entity hits (i-frame gate, arrow damage from impact speed, shield check, knockback, damage sink), block hits, and age expiry into batch events.

#### Scenario: Clear flight produces a step update
- **GIVEN** one live projectile and an empty world.
- **WHEN** `stepProjectiles` is called with tick T.
- **THEN** the batch MUST contain exactly one `projectileSteps` entry whose position/velocity equal the 142 `stepProjectile` result for the same inputs.

#### Scenario: Entity impact damages the target
- **GIVEN** a projectile with pre-step speed 3.0 heading at an alive target, and `baseArrowDamage = 2`.
- **WHEN** `stepProjectiles` resolves the entity hit.
- **THEN** the batch MUST contain a `projectileHits` entry with `targetId` set, `applied: true`, `damage` equal to `computeArrowDamage(3.0, 2)`, a non-null knockback equal to `computeKnockback` from the projectile position toward the target, the damage sink called with `damageType: 'arrow'` and source `ownerId`, and the projectile MUST NOT appear in `projectileSteps` (despawned).

#### Scenario: Invulnerable target absorbs the arrow without damage
- **GIVEN** a target inside its i-frame window.
- **WHEN** an arrow impacts it.
- **THEN** the hit MUST register `applied: false`, `damage: 0`, `healthRemoved: 0`, `knockback: null`, no damage sink call, and the projectile MUST despawn.

#### Scenario: Block impact despawns the projectile
- **GIVEN** a projectile flying into a solid floor.
- **WHEN** `stepProjectiles` resolves the block collision.
- **THEN** the batch MUST contain a `projectileHits` entry with `targetId: null`, `position` equal to the hit cell, `damage: 0`, and the projectile MUST despawn.

#### Scenario: Age expiry despawns the projectile
- **GIVEN** a projectile whose age exceeds `maxAgeTicks`.
- **WHEN** `stepProjectiles` runs.
- **THEN** the batch MUST contain its id in `projectileDespawns` with no step or hit entry.

#### Scenario: Owner immunity protects the shooter
- **GIVEN** a projectile whose owner stands at the impact point with `ownerImmunityTicks = 5` and age `<= 5`.
- **WHEN** `stepProjectiles` resolves the step.
- **THEN** the owner MUST NOT be the hit target.

---

### Requirement: REQ-6 Combat Replication Batch

`CombatValidator.stepProjectiles` SHALL return one `CombatReplicationBatch` per tick that drains all queued events exactly once, ordered deterministically.

#### Scenario: Batch contains all pending event kinds
- **GIVEN** one accepted melee hit and one accepted fire before the step, plus one live projectile with a clear-flight step.
- **WHEN** `stepProjectiles` is called.
- **THEN** the batch MUST contain the melee hit in `meleeHits`, the spawn in `projectileSpawns`, the step in `projectileSteps`, and `tick` equal to the step tick.

#### Scenario: Events are consumed exactly once
- **GIVEN** the batch from the previous scenario.
- **WHEN** `stepProjectiles` is called again with no new requests or motion.
- **THEN** the second batch MUST contain empty `meleeHits`, `projectileSpawns`, `projectileSteps`, `projectileHits`, and `projectileDespawns` arrays.

#### Scenario: Batch order is deterministic
- **GIVEN** three projectiles fired in order 9, 3, 5 (minted ids).
- **WHEN** a batch is produced.
- **THEN** `projectileSpawns` and `projectileSteps` MUST be ordered by projectile id ascending (`3, 5, 9`), and repeated runs MUST produce identical batches.

---

### Requirement: REQ-7 Client Combat Reconciler Prediction and Rollback

`ClientCombatReconciler` SHALL track attack and fire predictions by `requestId` and SHALL return rollback directives when the server rejects, the target is invulnerable, or the hit is shield-blocked.

#### Scenario: Predicted attack confirmed on acceptance
- **GIVEN** `predictAttack(11, 7)` and an accepted result with `hit.applied: true` for `requestId: 11`.
- **WHEN** `reconcile(result)` is called.
- **THEN** it MUST return `null` and `pendingCount` MUST drop to 0.

#### Scenario: Rejected attack yields a rollback directive
- **GIVEN** `predictAttack(12, 7)` and a rejected result with `reason: 'out_of_reach'` for `requestId: 12`.
- **WHEN** `reconcile(result)` is called.
- **THEN** it MUST return `{ kind: 'attack', requestId: 12, targetId: 7, reason: 'out_of_reach' }`.

#### Scenario: Invulnerable hit yields a rollback directive
- **GIVEN** `predictAttack(13, 7)` and an accepted result whose `hit.applied` is `false`.
- **WHEN** `reconcile(result)` is called.
- **THEN** it MUST return `{ kind: 'attack', requestId: 13, targetId: 7, reason: 'invulnerable' }`.

#### Scenario: Shield-blocked hit yields a rollback directive
- **GIVEN** `predictAttack(14, 7)` and an accepted result whose `hit.blocked` is `true`.
- **WHEN** `reconcile(result)` is called.
- **THEN** it MUST return `{ kind: 'attack', requestId: 14, targetId: 7, reason: 'blocked' }`.

#### Scenario: Fire prediction confirmed or rolled back
- **GIVEN** `predictFire(21, 3)`.
- **WHEN** an accepted fire result for `requestId: 21` is reconciled.
- **THEN** it MUST return `null`.
- **AND** given `predictFire(22, 4)` and a rejected result with `reason: 'no_ammo'`, reconciling MUST return `{ kind: 'fire', requestId: 22, reason: 'no_ammo' }`.

#### Scenario: Unknown request id is a no-op
- **GIVEN** an empty reconciler.
- **WHEN** `reconcile` is called with any result.
- **THEN** it MUST return `null` and MUST NOT throw.

---

### Requirement: REQ-8 Client Combat Store Batch Application

`ClientCombatStore` SHALL apply `CombatReplicationBatch` entries to maintain an authoritative projectile mirror.

#### Scenario: Spawn and step updates
- **GIVEN** an empty store.
- **WHEN** a batch with one spawn and one step for projectile 3 is applied.
- **THEN** `hasProjectile(3)` MUST be `true`, and `getProjectile(3)` MUST reflect the stepped position/velocity.

#### Scenario: Hit and despawn removals
- **GIVEN** a store containing projectiles 3 and 4.
- **WHEN** a batch with projectile 3 in `projectileHits` and projectile 4 in `projectileDespawns` is applied.
- **THEN** `hasProjectile(3)` and `hasProjectile(4)` MUST be `false`.

#### Scenario: Steps for unknown projectiles are ignored
- **GIVEN** an empty store.
- **WHEN** a batch with a step for projectile 99 is applied.
- **THEN** the store MUST remain empty and MUST NOT throw.

---

### Requirement: REQ-9 Damage Routing through Health and Armor Systems

The validator SHALL route every applied hit's post-block damage through `sinks.applyDamage` with the documented damage type (`'player_attack'` for melee, `'arrow'` for projectiles), the attacker as source, and SHALL report the sink's `healthRemoved`/`killed` in the event.

#### Scenario: Melee damage reaches the health system and armor applies
- **GIVEN** a sink backed by a real `SurvivalSystem` whose `armor` stub reduces 6 incoming damage to 3 (`{ reduced: 3, absorbed: 3 }`).
- **WHEN** an accepted melee hit with raw damage 6 resolves.
- **THEN** the event MUST report `healthRemoved: 3`, the stub's `applyWear` MUST be called with `3`, and `damage` MUST remain `6` (raw).

#### Scenario: Lethal damage reports the kill
- **GIVEN** a target at 2 health.
- **WHEN** a hit applies 5 damage through the sink.
- **THEN** the event MUST report `healthRemoved: 2` and `killed: true`.

#### Scenario: Invulnerable and blocked hits never call the sink
- **GIVEN** an invulnerable target and a shield-blocked target.
- **WHEN** melee hits resolve against both.
- **THEN** `sinks.applyDamage` MUST NOT be called for either.

---

### Requirement: REQ-10 Input Validation and Error Handling

All public methods SHALL validate inputs strictly, throwing descriptive `Combat: <detail>` errors without mutating state on malformed input; malformed seam results SHALL throw the same way.

#### Scenario: Malformed request fields throw
- **GIVEN** an attack request with `targetId: -1`, a fire request with `origin: { x: NaN, y: 0, z: 0 }` or `chargeTicks: 1.5`, and a shield request with `raised: 'yes'`.
- **WHEN** each is submitted.
- **THEN** each MUST throw an error matching `Combat:` and leave all tracker/projectile state unchanged.

#### Scenario: Invalid constructor options throw
- **GIVEN** `maxAttackReach: 0`, `minAttackIntervalTicks: -1`, `maxProjectiles: 0`, or `infiniteAmmo: 'yes'`.
- **WHEN** a `CombatValidator` is constructed.
- **THEN** it MUST throw an error matching `Combat:`.

#### Scenario: Malformed seam output throws
- **GIVEN** a `getTarget` seam returning a target with non-finite coordinates or `radius: -1`, an `applyDamage` sink returning `healthRemoved: -2`, or `getAttackStats` returning `baseDamage: NaN`.
- **WHEN** the affected request is submitted.
- **THEN** it MUST throw an error matching `Combat:`.

---

### Requirement: REQ-11 Determinism

Identical request schedules, seam outputs, and step worlds MUST produce identical results and batches across repeated executions.

#### Scenario: Repeated schedules produce identical traces
- **GIVEN** a fixed script of attacks, fires, and steps against fixed seams and an empty world.
- **WHEN** the script is executed twice on fresh validators.
- **THEN** all results and batches MUST be deep-equal between the two runs.

---

## Error and failure behavior

- Throws `Combat: <detail>` on: malformed request fields (non-integer/negative ids, non-finite positions/directions/velocities, non-boolean `raised`, non-integer/negative `chargeTicks`), malformed seam outputs (non-finite target fields, `radius <= 0`, invalid `baseDamage`, negative/non-finite `healthRemoved`), invalid constructor options, and non-object/non-array batch inputs on the client store.
- Rejections (returned, not thrown): `'out_of_reach'`, `'no_target'`, `'target_dead'`, `'stale_tick'`, `'attack_cooldown'`, `'no_ammo'`, `'not_charged'`, `'fire_too_fast'`, `'origin_mismatch'`, `'invalid_direction'`, `'max_projectiles'`.
- Rejected requests MUST NOT mutate attacker tick trackers, shield state, ammo, the projectile registry, or the event queue.

## Performance and resource bounds

- O(1) per request; O(P × T) per `stepProjectiles` with P <= `maxProjectiles` (default 256) and T the host target count.
- Live projectile storage bounded by `maxProjectiles`; per-player trackers bounded by player count; expired/impacted projectiles are removed in the same step.

## Compatibility and migration

- Pure additive module; no registry, save-format, or protocol changes; no existing module imports change.
- Type-only import of `src/world/CollisionResolver` types; runtime imports restricted to sibling simulation math (141/142/143/144). No `src/player` imports — health/armor routing is the documented `CombatSinks` seam.

## Security and integrity

- The server measures attack/fire timing itself and never trusts client cooldown/charge/damage claims; fire origins are validated against the authoritative player position; projectile count is capped.
- All numeric inputs are validated for safety and finiteness before any mutation; rejected requests never mutate state.

## Observability

- `projectileCount`, `getProjectile(id)`, `getShieldRaised(id)` on the validator; `pendingCount`, `hasPending(requestId)` on the reconciler; `size`, `hasProjectile(id)`, `getAll()` on the store.

## Verification mapping

- Tests in `tests/unit/CombatNetworking.test.ts` verify every scenario above and map 1:1 to REQ-1..REQ-11 in `openspec/changes/232-combat-networking/verification.md`.
