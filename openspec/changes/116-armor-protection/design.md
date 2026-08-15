# Design: 116-armor-protection

## Context/current state

Change 115 (`item-durability-repair`) is VERIFIED and advanced. The world now has
all the plumbing armor needs, but no protection math consumes it:

- `ItemTypeDefinition` (`src/inventory/ItemRegistry.ts`) declares `maxDurability`
  (for tools) but **no armor fields** — `defensePoints` (protection) and
  `toughness` are undefined, so a piece cannot express how much it protects.
- `Equipment` (`src/inventory/Equipment.ts`) owns the four armor slots and exposes
  `getArmorStacks()` (non-null Head→Chest→Legs→Feet order). The module's header
  explicitly notes "Protection math (116)" is the consumer.
- `DamageType` (`src/data/DamageType.ts`) declares a `BYPASS_ARMOR` flag
  (change 013) that **nothing consumes** today.
- `SurvivalSystem.damage(amount, reason)` (`src/player/SurvivalSystem.ts:118`)
  subtracts `ceil(amount)` directly from health with no armor consultation. It
  resolves four environmental `DamageType`s by key in its constructor and routes
  fall/drowning/lava/starvation through them.
- `DurabilityRules.applyDamage(maxDurability, stack, amount)` (115) returns a new
  stack and breaks it (`count = 0`) when remaining durability reaches `<= 0`.

What is missing: an armor data model, a deterministic protection rule, and the
durability-on-hit wiring.

## Target state

1. `ItemTypeDefinition` gains two optional, zero-defaulted fields: `defensePoints?`
   and `toughness?`.
2. A new **pure, deterministic** module `src/player/ArmorProtection.ts` with:
   - `computeArmorStats(stacks, registry): ArmorStats`
   - `reduceDamage(rawDamage, stats, bypassArmor): { reduced, absorbed }`
   - `applyArmorWear(stacks, absorbed, registry): (ItemStack | null)[]`
   - an `ArmorProtection` class wrapping `PlayerEquipment` + `ItemTypeRegistry`
     for the `SurvivalSystem` integration.
3. `SurvivalSystem` stores its `DamageTypeRegistry`, gains an optional `armor?`
   field, and consults it in `damage()` for non-bypass reasons; worn armor also
   wears on absorb.
4. The four environmental `DamageType` definitions gain `BYPASS_ARMOR`, so armor
   only mitigates combat/projectile/explosion damage (parity). Because those
   combat types are not yet implemented, the protective effect is **latent** in
   normal play; the module and integration are fully unit/integration tested with
   a synthetic non-bypass type.

Public behavior of `SurvivalSystem` is unchanged when no `armor` is supplied, so
`SurvivalSystem.test.ts` stays green.

## Invariants

- Total armor **points** and **toughness** are each hard-capped at `20` (the
  canonical ceiling). Capping the running sum at `20` yields the same value as
  capping the final sum for any valid per-piece definition (all real pieces are
  `<= 20`), so the result is order-independent.
- `reduceDamage` is **total and non-negative**: `reduced >= 0`, `absorbed >= 0`,
  and `reduced + absorbed === rawDamage` for the non-bypass, positive path.
- `absorbed` is exactly the HP the armor took; it is the sole input to durability
  wear. Health loses `ceil(reduced)`, not `ceil(raw)`.
- Non-positive `rawDamage` or `bypassArmor === true` returns the input unchanged
  with `absorbed === 0` (armor does nothing).
- An **unrecognized** `reason` (no matching `DamageType` in the registry) is
  treated as **non-bypass**: armor still applies (fail-safe toward player
  protection).
- Durability wear is **never** applied when `absorbed <= 0`.
- A piece with `maxDurability <= 0` (non-durable) is **skipped** by wear and
  returned unchanged.
- When a piece's remaining durability reaches `<= 0`, the slot is set to `null`
  (the item is consumed/dropped); this reuses `DurabilityRules.applyDamage`, which
  zeroes the stack identically to the prior tool logic.

## API and data model

```ts
// src/inventory/ItemRegistry.ts — ItemTypeDefinition extension
export interface ItemTypeDefinition {
  // ...existing fields...
  /** Protection points contributed by a worn armor piece (default 0). */
  defensePoints?: number;
  /** High-damage protection preservation contributed by a worn piece (default 0). */
  toughness?: number;
}

// src/player/ArmorProtection.ts
/** Aggregated worn-armor protection. Both fields are clamped to [0, 20]. */
export interface ArmorStats {
  points: number;
  toughness: number;
}

/** Result of the protection rule. reduced + absorbed === rawDamage (non-bypass). */
export interface ArmorReduction {
  reduced: number;   // HP that still hits health
  absorbed: number;  // HP the armor took (drives durability wear)
}

/**
 * Sum defense points and toughness across worn armor stacks.
 * Each running total is clamped to [0, 20]. Missing/zero defs contribute 0.
 */
export function computeArmorStats(stacks: ItemStack[], registry: ItemTypeRegistry): ArmorStats;

/**
 * Deterministic protection rule.
 * - rawDamage <= 0 OR bypassArmor  => { reduced: rawDamage, absorbed: 0 }
 * - otherwise: armor reduces damage per the curve below; absorbed drives wear.
 */
export function reduceDamage(
  rawDamage: number,
  stats: ArmorStats,
  bypassArmor: boolean,
): ArmorReduction;

/**
 * Apply absorbed damage as equal wear across worn, durable armor pieces.
 * Returns one entry per input stack, in the same order. A stack that breaks
 * (reaches <= 0 remaining durability) is represented as null. Non-durable
 * pieces (maxDurability <= 0) are returned unchanged.
 */
export function applyArmorWear(
  stacks: ItemStack[],
  absorbed: number,
  registry: ItemTypeRegistry,
): (ItemStack | null)[];

/**
 * Integration wrapper bound to a player's equipment + item registry.
 * The SurvivalSystem holds one optional instance.
 */
export class ArmorProtection {
  constructor(equipment: PlayerEquipment, registry: ItemTypeRegistry);
  getStats(): ArmorStats;
  reduce(rawDamage: number, bypassArmor: boolean): ArmorReduction;
  /** Mutates the equipment slots: applies wear for `absorbed` HP; no-op if <= 0. */
  applyWear(absorbed: number): void;
}
```

### Protection formula (deterministic, order-independent)

```
armor    = min(20, stats.points)
cap      = armor / 25                       // max 0.8 ⇒ 80% reduction at low dmg
tf       = min(20, stats.toughness)
retained = max(0, 1 - sqrt(raw) / (sqrt(raw) + 4 + tf * 2))   // [0, 1)
absorbedFraction = cap * retained
absorbed = raw * absorbedFraction
reduced  = raw - absorbed
```

Properties (verified by reasoning, pinned by spec scenarios):

- `raw → 0` ⇒ `retained → 1` ⇒ `absorbed → cap * raw` ⇒ `reduced → (1 - cap) * raw`.
  With full armor (`cap = 0.8`) the hit is ~80% absorbed at the low-damage
  asymptote. This is the "4% per armor point" design (20 points ⇒ 80% cap).
- `raw` large, `tf = 0` ⇒ `retained → 0` ⇒ armor barely helps on huge hits (the
  classic diamond-armor-still-hurts-from-a-falling-anvil shape).
- `raw` large, `tf = 20` ⇒ `tf * 2 = 40` dominates the denominator ⇒ `retained`
  stays high ⇒ toughness **preserves** protection at high damage.
- `armor = 0` (any `raw`) ⇒ `cap = 0` ⇒ `absorbed = 0` ⇒ no reduction.

The formula is independently authored; it is the normative curve for change 116.

## Control/data flow

`SurvivalSystem.damage(amount, reason)`:

1. Early-out if dead or invulnerable (unchanged).
2. If `this.armor` is set and `!this.isBypass(reason)`:
   - `const { reduced, absorbed } = this.armor.reduce(amount, false);`
   - `amount = reduced;`
   - `if (absorbed > 0) this.armor.applyWear(absorbed);`
3. `applied = ceil(max(0, amount))`; if `0`, return (unchanged).
4. `health -= applied`; set i-frames; emit `damage`; death check (unchanged).

`ArmorProtection.applyWear(absorbed)`:

1. If `absorbed <= 0`, return.
2. `worn = equipment.getArmorStacks()` (non-null, Head→Chest→Legs→Feet).
3. `updated = applyArmorWear(worn, absorbed, registry)`.
4. Walk `ARMOR_SLOTS`; for each non-empty slot, write `updated[i++]` back via
   `setEquipment(slot, value)` (a `null` value clears the slot = dropped piece).
   Because `getArmorStacks` and the `ARMOR_SLOTS` loop skip empty slots in the
   same fixed order, the index aligns.

`isBypass(reason)`: look up the `DamageType` for `reason` by key in the stored
registry; `bypass = def?.flags.includes('BYPASS_ARMOR') ?? false`. Unrecognized
reason ⇒ `undefined` ⇒ `bypass = false` (armor applies).

## Detailed behavior

- **computeArmorStats**: for each stack, `def = registry.getByLegacyId(stack.id)`;
  ignore missing defs; add `def.defensePoints ?? 0` to `points` (clamped 20) and
  `def.toughness ?? 0` to `toughness` (clamped 20).
- **reduceDamage**: short-circuits on `rawDamage <= 0 || bypassArmor`. Otherwise
  applies the formula; clamps `absorbed` into `[0, raw]` defensively and derives
  `reduced = raw - absorbed`.
- **applyArmorWear**: `durable = stacks.filter(s => (registry.getByLegacyId(s.id)
  ?.maxDurability ?? 0) > 0)`; `pieceCount = durable.length`; if `absorbed <= 0`
  or `pieceCount === 0`, return the input stacks unchanged. `wear = max(1,
  ceil(absorbed / pieceCount))`. For each input stack: if non-durable, return
  unchanged; else `result = DurabilityRules.applyDamage(max, stack, wear)` and
  return `result.broke ? null : result.stack`.

## Failure modes

- **Missing item def** in `computeArmorStats`/`applyArmorWear`: contributes `0`
  / skipped (defensive `?? 0`). No throw.
- **No durable pieces** when `absorbed > 0`: wear is a no-op (return unchanged);
  the HP loss still stands — armor simply does not wear when nothing can.
- **Bypassed reason** (or unrecognized with the fail-safe): armor never reduces
  and never wears; health loses the raw (ceil'd) amount.
- **i-frames / partial absorb**: a fully absorbed hit (`reduced === 0`, e.g.
  tiny damage) still flows through the existing `ceil` + i-frame logic; a `0`
  `applied` correctly early-returns. No special-case needed.
- **Break on absorb**: when a piece reaches `count = 0`, the slot becomes `null`.
  If the player later re-equips, the dropped item is already gone (consistent with
  tool breakage in 115).

## Compatibility/migration

- `defensePoints`/`toughness` are optional and default to `0`; **no persisted-data
  schema change**. `ItemStack`/`InventorySnapshot`/`EquipmentSnapshot` shapes are
  unchanged.
- `SurvivalSystem` gains only an optional `armor?` field and stores the registry
  it already receives. The `damage(amount, reason)` signature is unchanged.
- The four environmental `DamageType` definitions gain a flag; existing
  fall/drown/lava/starvation numbers and timing are untouched. They now also
  bypass armor, which matches Minecraft.

## Performance/resource constraints

- `computeArmorStats` and `applyArmorWear` are O(pieces) (≤ 4) with O(1) registry
  lookups — negligible on the damage hot path.
- `reduceDamage` is O(1) arithmetic.
- `SurvivalSystem.isBypass` is O(registry size) but the registry is tiny (≤ ~5
  entries); acceptable, and only runs when an `armor` instance is present.
- No allocation on the common no-armor path beyond the existing `ceil`/event work.

## Testing seams

- `computeArmorStats`, `reduceDamage`, `applyArmorWear` are pure functions
  suitable for direct unit tests with synthetic `ItemStack`s + a small
  `ItemTypeRegistry` (custom defs carrying `defensePoints`/`toughness`/
  `maxDurability`).
- `ArmorProtection` class is exercised against a real `PlayerEquipment`.
- `SurvivalSystem` integration is exercised by constructing it with a custom
  `DamageTypeRegistry` (default 4 environmental types **plus** a synthetic
  non-bypass `'combat'` type) and an `ArmorProtection` instance, then calling
  `damage(20, 'combat')` and asserting reduced HP loss + worn durability.
- Existing `SurvivalSystem.test.ts` (no `armor`) must stay green — the no-armor
  path is unaffected.

## Observability/debugging

- `ArmorProtection.getStats()` is a cheap read for HUD/debug overlays (later
  `205-hud-parity`).
- `reduceDamage` returns both `reduced` and `absorbed`, so a debugger can see how
  much HP the armor ate without re-deriving it.

## Affected files/symbols

- `src/inventory/ItemRegistry.ts` — `ItemTypeDefinition` (add 2 fields).
- `src/player/ArmorProtection.ts` — **new** module (pure functions + class).
- `src/player/SurvivalSystem.ts` — store registry; add `armor?`; consult in
  `damage`; add `isBypass`.
- `src/data/DamageType.ts` — add `BYPASS_ARMOR` to `fall`, `drowning`, `lava`,
  `starvation` default definitions.
- `tests/unit/ArmorProtection.test.ts` — **new** unit tests.
- `tests/unit/SurvivalSystem.test.ts` — **extend** with armor integration.

## Rejected alternatives

- **Reuse `getByResourceId` instead of `getByLegacyId`** for `ItemStack.id`:
  stacks carry the numeric `id` (the persistent save identity per 004/009), so
  `getByLegacyId` is the correct, already-stable key.
- **Cap per-piece vs cap the sum**: both yield identical results for valid
  `<= 20` pieces; capping the running total at `20` is chosen for clarity and
  matches the proposal wording.
- **Spread wear across count rather than pieces**: MC wears every piece equally
  per hit; we wear all `pieceCount` durable pieces by `max(1, ceil(absorbed /
  pieceCount))`, matching tool wear's `max(1, …)` floor.
- **Apply protection inside `Player`/combat change**: the rule is generic and
  independent of any attacker; placing it in `SurvivalSystem` + a dedicated pure
  module keeps 141 (melee combat) free to call `damage` with a non-bypass reason
  later.

## Downstream dependencies

- `141-melee-combat-cooldown` / `142-projectile-core` / `169-explosion-core` will
  call `SurvivalSystem.damage(amount, '<combat reason>')` with non-bypass reasons;
  armor then mitigates automatically.
- `205-hud-parity` will read `ArmorProtection.getStats()` for the armor hearts.
- `215-block-item-content-expansion` will attach real `defensePoints`/`toughness`
  to actual armor items; the calculation already supports them.
- `119-enchantment-application` will add an EPF term to `reduceDamage` later; the
  `stats`/`bypassArmor` seam is designed to accept that additive input.
