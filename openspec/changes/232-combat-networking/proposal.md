# Proposal: 232-combat-networking

## Problem

In multiplayer Minecraft, combat must be server-authoritative. Clients submit attack, bow-fire, and shield-block intents; the server validates them (reach, cooldown, target validity, ammo), computes damage and knockback, routes damage through the health/armor systems, and replicates the results (hits, projectile spawns, per-tick projectile motion, impacts) to observers. Clients predict combat outcomes locally and roll back when the server disagrees. Change 232 provides this pure, headless combat networking model, mirroring the 230 `block-interaction-networking` and 231 `inventory-network-transactions` validator/reconciler pattern.

## Goals

- Typed request/result contracts for melee attacks, projectile (bow) firing, and shield blocking.
- Server-side authoritative validator (`CombatValidator`):
  - Validates melee attacks: target existence/aliveness, reach distance, stale-tick rejection, and a server-enforced minimum attack interval (attack-cooldown validation).
  - Computes melee damage and knockback through the existing 141 `MeleeCombat` math (cooldown-scaled damage, `InvulnerabilityTracker` i-frames, `computeKnockback`).
  - Validates projectile fire: ammo via `canFireBow`, charge-tick bounds via `bowPullProgress`, charge-plausibility against the time since the last shot, fire origin plausibility against the authoritative player position, direction validity, and a concurrent-projectile cap.
  - Routes every accepted hit's damage through an injected health/armor sink (documented integration with `SurvivalSystem.damage` / `ArmorProtection`) and shield blocking through the existing 144 `ShieldBlocking` math (block arc, durability damage, axe disable).
  - Steps all server-owned projectiles each tick through the existing 142 `ProjectileCore.stepProjectile` and accumulates a deterministic `CombatReplicationBatch` (melee hits, projectile spawns, per-tick steps, entity/block impacts, despawns).
- Client-side prediction and rollback (`ClientCombatReconciler`) tracking attack/fire predictions by client `requestId` and returning rollback directives on rejection, invulnerable targets, and shield blocks.
- Client-side authoritative projectile mirror (`ClientCombatStore`) applying server batches (spawn/step/hit/despawn) deterministically.
- Strict input validation: non-integer ids, non-finite positions/velocities, negative ticks, malformed charge ticks, and invalid constructor options throw descriptive `Combat: <detail>` errors without mutating state.
- Pure headless simulation module with zero DOM/transport dependencies.

## Non-goals

- No WebSocket/socket transport (223 codecs and 225 lifecycle own the wire).
- No mob AI, mob-vs-mob combat, or mob death/loot wiring (146/148 own those; the module damages whatever target the host exposes through seams).
- No arrow pickup/landed-arrow persistence (143 `LandedArrowTracker`); a block-impacted projectile is despawned and its landed state is left to a later change.
- No critical hits, sweeping edge, enchantment damage modifiers, or attack-speed attributes (141/119 own those paths; the module uses the plain `MeleeCombat` math).
- No chat/command networking (233), server persistence (234), or reconnect recovery (235).
- No rendering of hit effects, damage numbers, or knockback animation; the module only produces the authoritative data.

## Preconditions

- 229 `entity-replication` VERIFIED (replication batch conventions).
- 230 `block-interaction-networking` VERIFIED (validator/reconciler pattern).
- 231 `inventory-network-transactions` VERIFIED (same pattern).
- 141 `MeleeCombat`, 142 `ProjectileCore`, 143 `BowAndArrow`, 144 `ShieldBlocking` primitives available (all present and unit-tested).

## Dependencies

- Pure TypeScript module `src/simulation/CombatNetworking.ts` composing the existing 141/142/143/144 math (`resolveMeleeAttack`, `InvulnerabilityTracker`, `computeKnockback`, `stepProjectile`, `bowPullProgress`, `computeFireVelocity`, `computeArrowDamage`, `canFireBow`, `resolveShieldBlock`, `ShieldCooldownTracker`) with the 230/231 validation idioms.
- Follows 222 shared-simulation conventions: headless-safe, deterministic, no DOM, no external deps beyond the shared `src/world/CollisionResolver` types (type-only import).

## Proposed change

New module `src/simulation/CombatNetworking.ts`:

- `MeleeAttackRequest`, `ProjectileFireRequest`, `ShieldBlockRequest` (client → server intents, each carrying a client `requestId`).
- `CombatResult` (server → client confirmation/correction, discriminated on `accepted` with explicit rejection reasons).
- `CombatTarget`, `AttackStats`, `CombatSinks` (host-supplied seams: target lookup, weapon stats, health/armor damage application, shield durability application).
- `CombatValidator` (server): `submitMeleeAttack`, `submitProjectileFire`, `submitShieldBlock`, `stepProjectiles`, projectile/hit-state accessors, `reset`.
- `CombatReplicationBatch` (per-tick observer broadcast: `meleeHits`, `projectileSpawns`, `projectileSteps`, `projectileHits`, `projectileDespawns`).
- `ClientCombatReconciler` (client prediction/rollback) and `ClientCombatStore` (client projectile mirror).

Plus `tests/unit/CombatNetworking.test.ts` covering every requirement scenario.

## Compatibility and migration

Pure addition. Zero registry changes, zero save-format migrations, no existing module imports change. The module imports only existing simulation math and (type-only) collision types.

## Risks

- Client forgery of cooldown/charge/damage claims → pinned: the server measures its own attack interval and fire timing, clamps charge claims, and computes all damage/knockback server-side; the client's claims are never trusted.
- Projectile spam / unbounded state → pinned: `maxProjectiles` cap rejects excess fire requests; projectile age is bounded by `maxAgeTicks` (default 1200) with deterministic expiry despawns.
- Desync between client prediction and server truth → pinned: explicit `requestId` matching, rollback directives carrying the authoritative reason, and per-tick replication batches snap clients to server state.

## Rollback strategy

Delete `src/simulation/CombatNetworking.ts` and `tests/unit/CombatNetworking.test.ts`.

## Definition of Done

Spec requirements REQ-1..REQ-11 verified by unit tests (including a real-`SurvivalSystem` damage-routing test); baseline gate `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` all PASS; tasks 100% complete; OpenSpec state updated to VERIFIED.

## Advancement gate

100% task completion; all mandatory MUST/SHALL requirements verified; regression gate green; no advancement exception required.
