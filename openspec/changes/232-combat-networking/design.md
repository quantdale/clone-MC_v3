# Design: 232-combat-networking

## Context/current state

Singleplayer combat math exists and is unit-tested but has no network surface:

- 141 `src/simulation/MeleeCombat.ts` — `attackCooldownProgress`, `cooldownDamageMultiplier`, `computeAttackDamage`, `computeKnockback`, `InvulnerabilityTracker`, `resolveMeleeAttack` (cooldown-scaled damage, i-frame gating, knockback impulse).
- 142 `src/simulation/ProjectileCore.ts` — `stepProjectile(world, resolver, state, targets, options)` (gravity/drag motion, entity-hit detection with owner immunity, block collision, age expiry).
- 143 `src/simulation/BowAndArrow.ts` — `bowPullProgress`, `computeFireVelocity`, `computeArrowDamage`, `canFireBow` (+ `LandedArrowTracker`, out of scope here).
- 144 `src/simulation/ShieldBlocking.ts` — `resolveShieldBlock` (block arc, durability damage, axe disable), `ShieldCooldownTracker`, bearing/angle helpers.
- Health/armor: `src/player/SurvivalSystem.damage(amount, reason)` applies armor reduction (via optional `ArmorProtection`) and death; `src/player/ArmorProtection` binds worn armor to reduction/wear.

Multiplayer validation infrastructure exists from 227-231: `MovementAuthority` (authoritative position + stale-tick corrections), `BlockInteractionValidator`/`ClientBlockReconciler` (230), `InventoryTransactionValidator`/`ClientInventoryReconciler` (231), `EntityReplicationManager`/`ClientEntityStore` (229). None of them touch combat.

## Target state

A pure headless combat networking framework in `src/simulation/CombatNetworking.ts`:

1. `CombatValidator` — server-authoritative validation of melee attack, projectile fire, and shield-block requests; server-owned projectile registry stepped per tick; damage/knockback computed from the 141 math; hits routed through injected health/armor and shield sinks; per-tick `CombatReplicationBatch` accumulation.
2. `ClientCombatReconciler` — client prediction of attack/fire outcomes keyed by `requestId`, with rollback directives on rejection/invulnerability/block.
3. `ClientCombatStore` — client-side authoritative projectile mirror applying batches.

The module is deterministic and headless-safe: no DOM, no transport, no imports of `src/player` (health routing is a documented seam; the host wires `SurvivalSystem`/`ArmorProtection`).

## Invariants

- **Reach invariant**: a melee attack is accepted only when the Euclidean distance from the attacker position to the target center is `<= maxAttackReach + target.radius` (bounding-sphere approximation of the Java attack-reach rule). Violations reject with `'out_of_reach'`.
- **Target invariant**: an attack targets an existing (`'no_target'`) alive (`'target_dead'`) target.
- **Tick invariant**: requests with `tick <=` the server's recorded last tick for that action/player are rejected `'stale_tick'` (replay protection, mirrors 227).
- **Cooldown invariant**: a melee attack within `minAttackIntervalTicks` of the attacker's last recorded attack is rejected `'attack_cooldown'`; the server measures `ticksSinceLastAttack = tick - lastAttackTick` itself and never trusts a client cooldown claim.
- **Ammo invariant**: a bow fire consumes exactly one arrow only when `canFireBow(arrowCount, infiniteAmmo)`; otherwise `'no_ammo'` and no consumption.
- **Charge invariant**: fire `chargeTicks` is clamped to `[0, maxChargeTicks]`; below `minChargeTicks` the shot is rejected `'not_charged'`; a clamped charge longer than the time elapsed since the last shot is rejected `'fire_too_fast'` (the claim cannot be physically true).
- **Authoritative damage invariant**: every accepted hit's raw damage is computed server-side (141 cooldown math for melee; 143 `computeArrowDamage` from the pre-impact speed for arrows); the sink reports the health actually removed; knockback is computed server-side (141 `computeKnockback`) and is null on shield block and on invulnerable targets.
- **Invulnerability invariant**: a target inside its `InvulnerabilityTracker` window registers `applied: false` (no damage, no knockback, no shield check) and the hit is still recorded for replication.
- **Consumption invariant**: queued events (melee hits, spawns, host despawns) appear in exactly one batch and are cleared on drain.
- **Order invariant**: batch entries are ordered deterministically — melee hits in request-processing order; projectile spawns/steps/hits/despawns by projectile id ascending.
- **Determinism invariant**: identical request schedules, target queries, and step worlds produce identical results and batches.

## API and data model

```ts
// ── Requests (client → server) ──
export interface MeleeAttackRequest {
  readonly playerId: number;   // non-negative safe integer
  readonly requestId: number;  // client-generated, non-negative safe integer
  readonly tick: number;       // non-negative safe integer
  readonly targetId: number;   // entity/player id as exposed by getTarget
}
export interface ProjectileFireRequest {
  readonly playerId: number;
  readonly requestId: number;
  readonly tick: number;
  readonly origin: Position3;     // finite; must be near the authoritative player pos
  readonly direction: Direction3; // finite, non-zero
  readonly chargeTicks: number;   // non-negative safe integer, clamped to [0, maxChargeTicks]
}
export interface ShieldBlockRequest {
  readonly playerId: number;   // the defender's own id (as exposed by getTarget)
  readonly requestId: number;
  readonly tick: number;
  readonly raised: boolean;
}

// ── Host seams ──
export interface Position3 { readonly x: number; readonly y: number; readonly z: number; }
export interface Direction3 { readonly x: number; readonly y: number; readonly z: number; }
export interface Velocity3 { readonly vx: number; readonly vy: number; readonly vz: number; }
export interface CombatTarget {
  readonly id: number;
  readonly x: number; readonly y: number; readonly z: number; // center, finite
  readonly radius: number;        // positive finite (bounding sphere)
  readonly velocity: Velocity3;   // finite
  readonly alive: boolean;
  readonly facingYawDegrees: number; // 144 bearing convention: 0 = +Z, increasing toward +X
}
export interface AttackStats { readonly baseDamage: number; readonly isAxeAttack: boolean; }
export interface DamageApplication { readonly healthRemoved: number; readonly killed: boolean; }
export interface CombatSinks {
  /** Routes damage through the target's health/armor system (e.g. SurvivalSystem.damage). */
  applyDamage(
    targetId: number, amount: number, damageType: string,
    sourceId: number, tick: number,
  ): DamageApplication;
  /** Routes shield durability wear (e.g. DurabilityRules on the shield item). */
  applyShieldDurabilityDamage(targetId: number, amount: number, tick: number): void;
}

// ── Results (server → client) ──
export type CombatRejectionReason =
  | 'out_of_reach' | 'no_target' | 'target_dead' | 'stale_tick'
  | 'attack_cooldown' | 'no_ammo' | 'not_charged' | 'fire_too_fast'
  | 'origin_mismatch' | 'invalid_direction' | 'max_projectiles';

export interface MeleeHitEvent {
  readonly attackerId: number; readonly targetId: number; readonly tick: number;
  readonly applied: boolean;      // false = target inside i-frames
  readonly damage: number;        // raw cooldown-scaled damage (141), pre-block/pre-armor
  readonly healthRemoved: number; // post-block, post-armor health actually removed
  readonly knockback: Velocity3 | null;
  readonly blocked: boolean;      // shield absorbed the hit
  readonly shieldDurabilityDamage: number;
  readonly killed: boolean;
}
export interface ProjectileSpawnDescriptor {
  readonly id: number; readonly ownerId: number | null;
  readonly origin: Position3; readonly velocity: Velocity3; readonly spawnTick: number;
}
export interface ProjectileStepUpdate { readonly id: number; readonly position: Position3; readonly velocity: Velocity3; }
export interface ProjectileHitEvent {
  readonly id: number; readonly tick: number;
  readonly targetId: number | null;     // entity hit, else null
  readonly position: Position3 | null;  // block-hit cell, else null
  readonly applied: boolean;
  readonly damage: number;        // raw arrow damage from impact speed
  readonly healthRemoved: number;
  readonly knockback: Velocity3 | null;
  readonly blocked: boolean;
  readonly shieldDurabilityDamage: number;
  readonly killed: boolean;
}
export type CombatResult =
  | { readonly accepted: true;  readonly kind: 'melee_attack'; readonly requestId: number;
      readonly tick: number; readonly targetId: number; readonly hit: MeleeHitEvent }
  | { readonly accepted: false; readonly kind: 'melee_attack'; readonly requestId: number;
      readonly tick: number; readonly targetId: number; readonly reason: CombatRejectionReason }
  | { readonly accepted: true;  readonly kind: 'projectile_fire'; readonly requestId: number;
      readonly tick: number; readonly projectileId: number; readonly spawn: ProjectileSpawnDescriptor }
  | { readonly accepted: false; readonly kind: 'projectile_fire'; readonly requestId: number;
      readonly tick: number; readonly reason: CombatRejectionReason }
  | { readonly accepted: true;  readonly kind: 'shield_block'; readonly requestId: number;
      readonly tick: number; readonly raised: boolean }
  | { readonly accepted: false; readonly kind: 'shield_block'; readonly requestId: number;
      readonly tick: number; readonly reason: CombatRejectionReason };

// ── Replication batch ──
export interface CombatReplicationBatch {
  readonly tick: number;
  readonly meleeHits: readonly MeleeHitEvent[];
  readonly projectileSpawns: readonly ProjectileSpawnDescriptor[];
  readonly projectileSteps: readonly ProjectileStepUpdate[];
  readonly projectileHits: readonly ProjectileHitEvent[];
  readonly projectileDespawns: readonly number[];
}

export interface CombatValidatorOptions {
  maxAttackReach?: number;        // default 3.0 (Java attack reach)
  minAttackIntervalTicks?: number;// default 10 (server-enforced attack floor)
  attacksPerSecond?: number;      // default 1.6 (141 cooldown curve)
  knockbackStrength?: number;     // default 0.4 (141 impulse)
  invulnerabilityTicks?: number;  // default 10 (141 i-frame window)
  maxChargeTicks?: number;        // default 20 (full bow draw)
  minChargeTicks?: number;        // default 1
  maxFireOriginOffset?: number;   // default 2.0 (eye-height allowance)
  baseArrowSpeed?: number;        // default 3.0 (143)
  baseArrowDamage?: number;       // default 2 (143)
  projectileKnockbackStrength?: number; // default 0.1
  maxProjectiles?: number;        // default 256
  infiniteAmmo?: boolean;         // default false
  shieldBlockArcDegrees?: number; // default 90 (144)
  gravity?: number;               // default 0.05 (142)
  drag?: number;                  // default 0.99 (142)
  maxAgeTicks?: number;           // default 1200 (142)
  ownerImmunityTicks?: number;    // default 5 (142)
  hitboxSize?: number;            // default 0.25 (142)
}
```

## Control/data flow

1. **Server request processing (per tick, before stepping)**: the host calls
   `validator.submitMeleeAttack(attackerPos, request, getTarget, getAttackStats, sinks)`,
   `validator.submitProjectileFire(request, attackerPos, ammo, spawnProjectile)`, and
   `validator.submitShieldBlock(request)` for each pending client intent. Accepted melee hits
   and projectile spawns are queued internally; each call returns a `CombatResult` sent back
   to that client (confirmation or correction).
2. **Server step (per tick)**: the host calls
   `validator.stepProjectiles(tick, world, resolver, getTargets, sinks)` once. Every live
   projectile is stepped through 142 `stepProjectile` in id-ascending order; entity hits are
   gated by the 141 `InvulnerabilityTracker`, blocked by 144 shield math, and routed through
   the damage sink; expired/block/entity-hit projectiles are despawned; the method assembles
   and returns the `CombatReplicationBatch` (draining queued melee hits and spawns first) for
   broadcast to observers.
3. **Client prediction**: on issuing an intent, the client calls
   `reconciler.predictAttack(requestId, targetId)` or `reconciler.predictFire(requestId, projectileId)`
   and plays the optimistic effect. On the server `CombatResult`, `reconciler.reconcile(result)`
   confirms (null) or returns a `CombatRollbackDirective`.
4. **Client state application**: the client feeds server batches to
   `store.applyBatch(batch)` to keep its projectile mirror authoritative.

## Detailed behavior

- **Melee validation order** (documented; first violation wins): field validation (throw) →
  `getTarget` (`'no_target'`) → `alive` (`'target_dead'`) → reach (`'out_of_reach'`) →
  stale tick (`'stale_tick'`) → interval (`'attack_cooldown'`) → accept.
- **Melee resolution**: `ticksSinceLastAttack = tick - (lastAttackTick ?? 0)` is measured
  server-side and passed to `resolveMeleeAttack` (141) with `attacksPerSecond`,
  `knockbackStrength`, `invulnerabilityTicks`. `applied: false` (i-frames) still records
  `lastAttackTick` and emits an event with zero damage. On `applied: true`, shield blocking is
  evaluated (144 `resolveShieldBlock` with `shieldRaised.get(targetId) ?? false`, the
  validator's `ShieldCooldownTracker`, `target.facingYawDegrees`, attacker X/Z, `isAxeAttack`
  from `getAttackStats`); a block applies `damageAfterBlock` (0 at the default 1.0 reduction),
  computes durability damage, disables the shield on axe hits, and nulls knockback. A positive
  post-block amount is routed through `sinks.applyDamage(targetId, amount, 'player_attack',
  playerId, tick)`; a zero post-block amount skips the sink and reports `healthRemoved: 0`,
  `killed: false`. The returned `healthRemoved`/`killed` go into the event.
- **Shield request**: records `shieldRaised` per id and rejects `'stale_tick'` on non-increasing
  ticks. The id namespace is the same as `getTarget`'s (a defending player is registered under
  its `playerId`).
- **Fire validation order**: field validation (throw) → `chargeTicks` non-negative integer
  (throw) → clamp to `maxChargeTicks` → `'not_charged'` if below `minChargeTicks` → `'stale_tick'`
  → `'fire_too_fast'` if clamped charge > `tick - (lastFireTick ?? 0)` → `'no_ammo'` if
  `!canFireBow(getArrowCount(), infiniteAmmo)` → `'origin_mismatch'` if the origin is farther
  than `maxFireOriginOffset` from the authoritative attacker position → `'invalid_direction'`
  for a degenerate (near-zero) direction → `'max_projectiles'` at cap → accept.
- **Fire acceptance**: `pullProgress = bowPullProgress(charge)`;
  `velocity = computeFireVelocity(direction, pullProgress, baseArrowSpeed)`; the validator
  mints the projectile id, calls `spawnProjectile(desc)` with
  `{ id, ownerId: playerId, origin, velocity, spawnTick: tick }`, records `lastFireTick = tick`,
  calls `consumeArrow()`, stores the projectile with `ageTicks = 0`, and queues the spawn event.
- **Projectile step** (id ascending): convert `getTargets()` (alive only) to 142
  `ProjectileTarget`s; compute `prevSpeed` from the pre-step velocity; call `stepProjectile`
  with the validator's step options. Expired → despawn event. Entity hit → i-frame gate
  (`canDamage`/`registerHit`); `damage = computeArrowDamage(prevSpeed, baseArrowDamage)`;
  shield check (attacker X/Z = projectile position, `isAxeAttack = false`); unblocked hits get
  `knockback = computeKnockback(projectileX, projectileZ, targetX, targetZ,
  projectileKnockbackStrength, target.velocity)`; a positive post-block amount is routed
  through `sinks.applyDamage(targetId, amount, 'arrow', ownerId ?? -1, tick)` (a zero amount
  skips the sink); despawn. Block hit →
  hit event with `damage: 0`, `position` = hit cell, despawn. Clear flight → step update with
  the integrated position/velocity.
- **Batch assembly**: `meleeHits` (queued order), `projectileSpawns` (queued order, then
  id-ascending), `projectileSteps`, `projectileHits`, `projectileDespawns` (all id-ascending).
  `removeProjectile(id)` (host-driven) queues a despawn and removes the projectile.
- **Client reconciler**: predictions keyed by `requestId`; `reconcile(result)` reads
  `result.requestId`; unknown ids are a lenient no-op (matches 230). Directives:
  `{ kind: 'attack', reason: <rejection | 'invulnerable' | 'blocked'> }`,
  `{ kind: 'fire', reason: <rejection> }`, `{ kind: 'shield', reason: <rejection> }`.
- **Client store**: `applyBatch` validates the batch, applies spawns (replace), steps (ignore
  unknown ids), removes hit and despawned projectiles, in batch order.

## Failure modes

- Malformed requests (non-integer/negative `playerId`/`requestId`/`tick`/`targetId`,
  non-finite positions/directions, non-boolean `raised`, non-integer `chargeTicks`) → throws
  `Combat: <detail>` and changes nothing.
- Malformed seam results (`getTarget` non-finite fields, non-positive radius; `getAttackStats`
  invalid baseDamage; sink results with negative/non-finite `healthRemoved`) → throws
  `Combat: <detail>`; the event queue and trackers are left consistent (validation precedes
  mutation).
- Invalid constructor options (non-positive reach, negative intervals, invalid caps) → throws
  `Combat: <detail>`.
- Host-driven despawn of an unknown id → `removeProjectile` returns false, no event.

## Compatibility/migration

Pure addition to `src/simulation/CombatNetworking.ts`. No registry, save, or protocol changes.
Type-only import of `src/world/CollisionResolver` keeps the module headless-safe under the 222
boundary. Existing modules are untouched.

## Performance/resource constraints

- O(1) per request (constant number of Map lookups); O(P × T) per `stepProjectiles` for P
  projectiles against T targets (P bounded by `maxProjectiles`, default 256; T bounded by the
  host's target count).
- Live projectile storage bounded by `maxProjectiles`; per-player trackers bounded by connected
  players; expired/hit projectiles are removed the same tick.

## Testing seams

- Headless unit tests with a trivial `EmptyWorld`/`FloorWorld` (057 `VoxelShape`) + real 057
  `CollisionResolver`, mirroring `tests/unit/ProjectileCore.test.ts`.
- Fake `getTarget`/`getAttackStats`/sinks for validator tests; one integration test routes
  damage through a real `src/player/SurvivalSystem` (with a stub armor object) to prove the
  health/armor routing contract.

## Observability/debugging

- `projectileCount`, `getProjectile(id)`, `getShieldRaised(id)` accessors; `pendingCount` /
  `hasPending(requestId)` on the reconciler; `size` / `hasProjectile(id)` on the store.

## Affected files/symbols

- `src/simulation/CombatNetworking.ts` (NEW): `CombatValidator`, `ClientCombatReconciler`,
  `ClientCombatStore`, all request/result/event/batch types, `CombatRejectionReason`.
- `tests/unit/CombatNetworking.test.ts` (NEW).
- No changes to existing files.

## Rejected alternatives

- *Client-authoritative damage/cooldown claims*: rejected — trivially forgeable; the server
  measures intervals and computes damage itself (anti-cheat posture of 227/230/231).
- *Trusting client charge claims*: rejected — the charge-plausibility check
  (`chargeTicks <= tick - lastFireTick`) makes forged full-charge shots impossible.
- *Extending 229 `EntityReplicationManager` for projectiles*: rejected — combat events and
  projectile motion are a combat concern; 232 keeps its own batch so 229's entity lifecycle is
  unaffected, and a later change may bridge the two.
- *Importing `SurvivalSystem` directly*: rejected — that would drag `src/player`/three.js into
  the shared-simulation boundary; the damage sink keeps the module pure.

## Downstream dependencies

233 `chat-and-command-networking` (no coupling), 236 `multiplayer-load-tests`, 237
`network-adversarial-validation` (malformed/duplicate/rate-abusive combat requests), 242
`survival-progression-e2e`.
