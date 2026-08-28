# Design: 144-shield-blocking

## Context/current state
- 116 `ArmorProtection` reduces damage by worn armor points/toughness; no directional, raised-item
  block mechanic exists.
- 141 `InvulnerabilityTracker` established the per-entity-id, tick-window tracker pattern this change
  reuses for `ShieldCooldownTracker`.
- No shared yaw convention exists across subsystems (`Player`: radians, `-Z`-forward;
  129 `EntityTransform`: degrees, per 139). 143 sidestepped this with a direction-vector API; 144
  instead defines its own explicit, self-contained yaw convention for its internal bearing/arc math,
  documented so a caller converts once at its boundary.

## Target state
- `src/simulation/ShieldBlocking.ts` provides bearing/arc geometry, durability-cost computation, the
  composed `resolveShieldBlock`, and `ShieldCooldownTracker`.

## Invariants
- `bearingYawDegrees` always returns a value in `(-180, 180]`, using the convention `0°` along `+Z`,
  increasing toward `+X` (i.e. `atan2(dx, dz)` in degrees) — this module's own fixed convention,
  independent of any other subsystem's yaw units.
- `angleBetweenYawDegrees` always returns a value in `[0, 180]` (the smaller angular difference
  between two bearings).
- `isWithinBlockingArc` is `true` exactly when `angleBetweenYawDegrees(facing, bearingToAttacker) <=
  arcDegrees / 2`.
- `computeShieldDurabilityDamage` never returns less than `1` for a positive `incomingDamage`, and is
  non-decreasing in `incomingDamage`.
- `resolveShieldBlock` returns `blocked: false` (undiminished damage, zero durability cost, no
  disable) whenever `!isRaised`, `isDisabled`, or the attacker is outside the blocking arc; it
  returns `blocked: true` (damage reduced by `SHIELD_BLOCK_DAMAGE_REDUCTION`, durability cost `> 0`)
  only when raised, not disabled, and within arc.
- `ShieldCooldownTracker.isDisabled(id, tick)` is `true` exactly while `tick` is before the
  previously-set disable-until tick for that id.

## API and data model
```ts
export const SHIELD_BLOCK_ARC_DEGREES = 90;
export const SHIELD_DISABLE_TICKS = 100;          // 5s at 20 TPS
export const SHIELD_BLOCK_DAMAGE_REDUCTION = 1.0; // fraction of damage blocked (documented baseline)

export function bearingYawDegrees(fromX: number, fromZ: number, toX: number, toZ: number): number;
export function angleBetweenYawDegrees(a: number, b: number): number;
export function isWithinBlockingArc(
  defenderFacingYawDegrees: number,
  attackerX: number, attackerZ: number,
  defenderX: number, defenderZ: number,
  arcDegrees?: number,
): boolean;

export function computeShieldDurabilityDamage(incomingDamage: number): number;

export interface ShieldBlockResult {
  blocked: boolean;
  damageAfterBlock: number;
  durabilityDamage: number;
  shouldDisable: boolean;
}

export function resolveShieldBlock(
  isRaised: boolean,
  isDisabled: boolean,
  defenderFacingYawDegrees: number,
  defenderX: number, defenderZ: number,
  attackerX: number, attackerZ: number,
  incomingDamage: number,
  isAxeAttack?: boolean,
  arcDegrees?: number,
): ShieldBlockResult;

export class ShieldCooldownTracker {
  disable(entityId: number, currentTick: number, durationTicks?: number): void;
  isDisabled(entityId: number, currentTick: number): boolean;
  clear(entityId?: number): void;
}
```

## Control/data flow
1. `bearingYawDegrees(fromX, fromZ, toX, toZ)`: `atan2(toX-fromX, toZ-fromZ)` in degrees.
2. `angleBetweenYawDegrees(a, b)`: `diff = abs(a-b) % 360`; return `diff > 180 ? 360-diff : diff`.
3. `isWithinBlockingArc(...)`: `bearing = bearingYawDegrees(defenderX, defenderZ, attackerX,
   attackerZ)`; return `angleBetweenYawDegrees(defenderFacingYawDegrees, bearing) <= arcDegrees/2`.
4. `computeShieldDurabilityDamage(d)`: `max(1, ceil(d))`.
5. `resolveShieldBlock(...)`:
   a. If `!isRaised || isDisabled`: return `{ blocked: false, damageAfterBlock: incomingDamage,
      durabilityDamage: 0, shouldDisable: false }`.
   b. If `!isWithinBlockingArc(...)`: same as (a).
   c. Else: `damageAfterBlock = incomingDamage * (1 - SHIELD_BLOCK_DAMAGE_REDUCTION)`;
      `durabilityDamage = computeShieldDurabilityDamage(incomingDamage)`; return
      `{ blocked: true, damageAfterBlock, durabilityDamage, shouldDisable: isAxeAttack }`.
6. `ShieldCooldownTracker.disable(id, tick, duration = SHIELD_DISABLE_TICKS)`:
   `disabledUntilTick.set(id, tick + duration)`. `isDisabled(id, tick)`: `tick <
   (disabledUntilTick.get(id) ?? -Infinity)`. `clear(id?)`: delete one entry or clear the map.

## Detailed behavior
- `defenderFacingYawDegrees` MUST use the exact same convention as `bearingYawDegrees` — a caller
  whose own yaw is in a different unit/convention (e.g. `Player`'s radians) converts once before
  calling, exactly mirroring 143's "caller supplies a direction the module understands" posture.
- With the default `SHIELD_BLOCK_DAMAGE_REDUCTION = 1.0`, a successful block currently reduces
  damage to `0` — a documented baseline (vanilla blocks nearly all melee/ranged damage); the constant
  is named and adjustable, not hardcoded inline, so a future refinement (partial reduction for some
  damage types) doesn't require touching the block logic itself.
- `shouldDisable` simply echoes the caller-supplied `isAxeAttack` flag when a block succeeds — 144
  does not itself know which items are axes; that classification stays with whatever future change
  wires this in (mirrors 143's "caller supplies its own classification" posture).

## Failure modes
- None of these functions throw for finite numeric inputs.

## Compatibility/migration
- One new, additive file; no edits to `ArmorProtection`, `DurabilityRules`, `Equipment`, or any other
  module. No schema/save-format change; no migration.

## Performance/resource constraints
- Every function/method is O(1). `ShieldCooldownTracker`'s map grows by at most one entry per
  distinct disabled entity id; `clear` releases entries.

## Testing seams
- Every function/class is pure or trivially stateful (`ShieldCooldownTracker`'s own map) — no
  `Game`/`World`/`EntityManager`/`Inventory` dependency to construct a test.

## Observability/debugging
- `ShieldBlockResult`'s four fields fully explain one block attempt's outcome without additional
  instrumentation.

## Affected files/symbols
- `src/simulation/ShieldBlocking.ts` (new).
- Tests: `tests/unit/ShieldBlocking.test.ts` (new).

## Rejected alternatives
- **Reusing `Player.yaw`'s radian, `-Z`-forward convention directly**: rejected — would couple this
  general-purpose module to `Player`'s specific representation; a self-contained, documented
  convention (matching 143's spirit) keeps 144 usable by a future mob-defender too.
- **Partial (non-1.0) default block reduction to "feel more nuanced" out of the gate**: rejected —
  vanilla's own baseline is a near-total block for ordinary damage; `1.0` is the honest default,
  adjustable later via the named constant.
- **Coupling `resolveShieldBlock` to 115's `DurabilityRules`/`ItemStack` directly**: rejected (see
  proposal Non-goals) — keeps 144 standalone; the caller applies the returned durability cost through
  the existing durability pipeline.

## Downstream dependencies
- A future `PlayerInteraction`/`Game`/mob-AI wiring change will read "is the shield raised," compute
  `resolveShieldBlock` on each incoming hit, apply `damageAfterBlock` through the existing
  damage/armor pipeline, apply `durabilityDamage` via `DurabilityRules.applyDamage`, and call
  `ShieldCooldownTracker.disable` when `shouldDisable` is `true`.
