# Tasks: 232-combat-networking

## 1. Implementation

- [x] 1.1 Define all types in `src/simulation/CombatNetworking.ts`: `Position3`, `Direction3`, `Velocity3`, `MeleeAttackRequest`, `ProjectileFireRequest`, `ShieldBlockRequest`, `CombatTarget`, `AttackStats`, `DamageApplication`, `CombatSinks`, `MeleeHitEvent`, `ProjectileSpawnDescriptor`, `ProjectileStepUpdate`, `ProjectileHitEvent`, `CombatResult`, `CombatRejectionReason`, `CombatReplicationBatch`, `CombatRollbackDirective`, `CombatValidatorOptions`.
- [x] 1.2 Implement `CombatValidator` constructor option validation and per-player trackers (`lastAttackTick`, `lastFireTick`, `lastShieldTick`, `shieldRaised`), plus the 141 `InvulnerabilityTracker` and 144 `ShieldCooldownTracker` composition.
- [x] 1.3 Implement `submitMeleeAttack`: reach/target/stale/interval validation, 141 `resolveMeleeAttack` damage/knockback, shield routing (144), damage sink routing, `lastAttackTick` recording, and hit event queueing.
- [x] 1.4 Implement `submitShieldBlock`: raised-state recording with stale-tick rejection.
- [x] 1.5 Implement `submitProjectileFire`: charge clamp/bounds, stale/fire_too_fast/ammo/origin/direction/cap validation, 143 velocity computation, spawn seam + ammo consumption, and spawn event queueing.
- [x] 1.6 Implement `stepProjectiles`: 142 per-tick stepping in id-ascending order, entity-hit resolution (i-frame gate, 143 arrow damage, 144 shield check, 141 knockback, damage sink), block-hit and expiry despawns, host-driven `removeProjectile`, and deterministic batch assembly with queue drain.
- [x] 1.7 Implement `ClientCombatReconciler`: `predictAttack`/`predictFire` keyed by `requestId`, `reconcile` confirm/rollback directives, `pendingCount`/`hasPending`/`reset`.
- [x] 1.8 Implement `ClientCombatStore`: `applyBatch` (spawns/steps/hits/despawns), projectile queries, `size`/`reset`.

## 2. Validation & Unit Tests

- [x] 2.1 Unit tests for melee validation (reach boundary, no_target, target_dead, stale_tick, attack_cooldown).
- [x] 2.2 Unit tests for melee damage/knockback math (cooldown scaling vs `computeAttackDamage`, knockback vector vs `computeKnockback`, i-frame `applied: false`, cooldown consumption on non-applied swings).
- [x] 2.3 Unit tests for shield blocking (request recording, stale rejection, block outcome with durability, arc miss, axe disable, projectile block).
- [x] 2.4 Unit tests for fire validation (valid fire + ammo consumption, no_ammo, not_charged, fire_too_fast, origin_mismatch, invalid_direction, max_projectiles, charge clamping).
- [x] 2.5 Unit tests for projectile spawn/step/hit/expiry against empty/floor world fixtures (`stepProjectile` equivalence, entity impact damage/knockback, i-frame absorption, block impact, expiry despawn, owner immunity).
- [x] 2.6 Unit tests for `CombatReplicationBatch` assembly (event kinds, exactly-once consumption, id-ascending order, determinism).
- [x] 2.7 Unit tests for `ClientCombatReconciler` (confirm, reject/invulnerable/blocked directives, fire rollback, unknown requestId no-op, reset).
- [x] 2.8 Unit tests for `ClientCombatStore` (spawn/step application, hit/despawn removal, unknown-id steps ignored, queries).
- [x] 2.9 Unit tests for damage routing through a real `src/player/SurvivalSystem` with an armor stub (`healthRemoved`, `applyWear`, kill, no-sink-on-invulnerable/blocked).
- [x] 2.10 Unit tests for input validation throws (`Combat: <detail>` on malformed requests/options/seam outputs) and deterministic repeated-schedule equality.

## 3. Integration & Verification

- [x] 3.1 Run baseline verification gate (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`).
- [x] 3.2 Reconcile specs/design/tasks against the final implementation; update `verification.md`, `PROGRAM_STATE.json`, and `PROGRAM_STATE.md` with complete evidence and advance change to VERIFIED.
