# Design: 141-melee-combat-cooldown

## Context/current state
- No attack-cooldown, knockback, or invulnerability-frame logic exists anywhere. 116's
  `ArmorProtection`/`SurvivalSystem.damage` apply post-armor damage but have no notion of an
  attacker's charge state or a target's recent-hit history.

## Target state
- `src/simulation/MeleeCombat.ts` provides the pure cooldown/damage/knockback math plus a small
  per-target invulnerability tracker, composed by `resolveMeleeAttack`.

## Invariants
- `attackCooldownProgress` is always in `[0, 1]`, monotonically non-decreasing in
  `ticksSinceLastAttack` for a fixed `attacksPerSecond`.
- `cooldownDamageMultiplier(0) === 0.2` and `cooldownDamageMultiplier(1) === 1.0` exactly (vanilla's
  documented endpoints); it is monotonically non-decreasing over `[0, 1]`.
- `computeKnockback` always returns the target's existing velocity halved, plus (when the horizontal
  distance is non-negligible) a unit-direction horizontal impulse scaled by `strength` and a fixed
  vertical component; `vy`'s fixed component is added even when the horizontal distance is
  negligible (only the horizontal direction is undefined in that case, not the vertical pop).
- `InvulnerabilityTracker.canDamage(id, tick, window)` is `true` for an id with no recorded hit, and
  `false` exactly while `tick - lastHitTick < window` for that id.
- `resolveMeleeAttack` registers a hit (via the tracker) if and only if it returns `applied: true`;
  a blocked attempt never calls `registerHit` and never computes damage/knockback beyond `0`/`null`.

## API and data model
```ts
export const DEFAULT_INVULNERABILITY_TICKS = 10;

export function attackCooldownProgress(ticksSinceLastAttack: number, attacksPerSecond: number): number;
export function cooldownDamageMultiplier(progress: number): number;
export function computeAttackDamage(baseDamage: number, ticksSinceLastAttack: number, attacksPerSecond: number): number;

export interface Velocity3 { vx: number; vy: number; vz: number; }
export type KnockbackVector = Velocity3;

export function computeKnockback(
  fromX: number, fromZ: number, toX: number, toZ: number,
  strength: number, existingVelocity: Velocity3,
): KnockbackVector;

export class InvulnerabilityTracker {
  canDamage(entityId: number, currentTick: number, invulnerabilityTicks?: number): boolean;
  registerHit(entityId: number, currentTick: number): void;
  clear(entityId?: number): void;
}

export interface MeleeAttackResult {
  applied: boolean;
  damage: number;
  knockback: KnockbackVector | null;
}

export function resolveMeleeAttack(
  tracker: InvulnerabilityTracker,
  targetId: number,
  currentTick: number,
  baseDamage: number,
  ticksSinceLastAttack: number,
  attacksPerSecond: number,
  fromX: number, fromZ: number, toX: number, toZ: number,
  knockbackStrength: number,
  targetVelocity: Velocity3,
  invulnerabilityTicks?: number,
): MeleeAttackResult;
```

## Control/data flow
1. `attackCooldownProgress(t, aps)`: `ticksPerAttack = 20 / aps`; return
   `clamp((t + 0.5) / ticksPerAttack, 0, 1)`.
2. `cooldownDamageMultiplier(p)`: `0.2 + p * p * 0.8`.
3. `computeAttackDamage(base, t, aps)`: `base * cooldownDamageMultiplier(attackCooldownProgress(t, aps))`.
4. `computeKnockback(...)`: `halved = existingVelocity * 0.5` componentwise; `dx = toX - fromX`,
   `dz = toZ - fromZ`, `dist = hypot(dx, dz)`; if `dist < 1e-6`, return
   `{ vx: halved.vx, vy: halved.vy + 0.4, vz: halved.vz }`; else return
   `{ vx: halved.vx + (dx/dist)*strength, vy: halved.vy + 0.4, vz: halved.vz + (dz/dist)*strength }`.
5. `InvulnerabilityTracker.canDamage`: look up `lastHitTick.get(id)`; `true` if absent; else
   `currentTick - lastHitTick >= invulnerabilityTicks` (default `DEFAULT_INVULNERABILITY_TICKS`).
   `registerHit`: `lastHitTick.set(id, currentTick)`. `clear(id?)`: delete one entry or clear the map.
6. `resolveMeleeAttack(...)`: if `!tracker.canDamage(targetId, currentTick, invulnerabilityTicks)`,
   return `{ applied: false, damage: 0, knockback: null }`; else compute `damage` (3) and
   `knockback` (4), call `tracker.registerHit(targetId, currentTick)`, and return
   `{ applied: true, damage, knockback }`.

## Detailed behavior
- The `+0.4` fixed vertical knockback component and the `× 0.5` velocity halving mirror vanilla's
  well-known constants; documented here as the deliberate parity target rather than an arbitrary
  choice.
- `resolveMeleeAttack` is the only function that mutates the tracker; every other function in this
  module is purely a function of its arguments.

## Failure modes
- None of these functions throw for finite numeric inputs; `computeKnockback`'s degenerate
  same-position case is a documented safe fallback, not an error.

## Compatibility/migration
- One new, additive file; no edits to `ArmorProtection`, `SurvivalSystem`, `EntityManager`, or any
  other module. No schema/save-format change; no migration.

## Performance/resource constraints
- Every function is O(1). `InvulnerabilityTracker`'s map grows by at most one entry per distinct
  `entityId` ever hit; `clear(id)` releases entries a caller no longer needs to track (e.g. on entity
  removal).

## Testing seams
- Every function/class is pure or trivially stateful (`InvulnerabilityTracker`'s own map) — no
  `Game`/`World`/`EntityManager` dependency to construct for a test.

## Observability/debugging
- `MeleeAttackResult`'s three fields fully explain one attack attempt's outcome without additional
  instrumentation.

## Affected files/symbols
- `src/simulation/MeleeCombat.ts` (new).
- Tests: `tests/unit/MeleeCombat.test.ts` (new).

## Rejected alternatives
- **Reading `baseDamage`/`attacksPerSecond` from the 012 `AttributeRegistry` in this change**:
  rejected (see proposal Non-goals) — keeps this module decoupled from any specific attribute-storage
  mechanism; a caller resolves those numbers however it likes and passes them in.
- **Applying damage/knockback directly via `SurvivalSystem`/`EntityManager`**: rejected — this module
  computes outcomes; applying them is a future, explicitly scoped wiring step (mirrors 137/138's
  "the caller applies the result" convention).
- **Modeling critical hits**: rejected (see proposal Non-goals) — no generic "is falling and not
  sprinting" signal exists yet in this program.

## Downstream dependencies
- A future attack-goal change (building on 140's `ChaseGoal` attack-range hand-off) will call
  `resolveMeleeAttack` and apply its result through `ArmorProtection`/`SurvivalSystem.damage` and
  `EntityManager.setVelocity`.
