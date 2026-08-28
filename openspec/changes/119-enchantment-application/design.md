# Design: 119-enchantment-application

## Context/current state

Change 118 delivered `EnchantmentRegistry` (`getByResourceId`, `getByKey`,
`validateEnchantmentList`, `serialize/deserialize`, the 11-entry catalog) but no
code path consumes enchantment definitions. `ItemStack` has no enchantment
storage; mining (`HarvestRules.getBreakDuration`), tool wear
(`DurabilityRules.applyDamage` via `Inventory.damageSelectedItem`), and armor
mitigation (`ArmorProtection.reduce`) ignore enchantments entirely. The game has
no combat/attack call site, so weapon-enchant *application* is out of scope.

`ArmorProtection` is implemented and `SurvivalSystem.armor` is an optional field,
but `ArmorProtection` is not instantiated in `Game` — armor mitigation is not
currently live in-game (a 116 composition gap, not 119's concern).

## Target state

1. `ENCHANTMENTS_COMPONENT` (`minecraft:enchantments`) registered in the shared
   default component registry. Value type `Record<string, number>` keyed by
   enchantment resource-id string → level.
2. New `src/inventory/EnchantmentApplication.ts`: stack storage accessors
   (`getStackEnchantments`, `setStackEnchantments`, `getEnchantmentLevel`) and the
   pure effect primitives reused by later changes.
3. Three live pathways consume the component:
   - **Mining** — `HarvestRules.getBreakDuration` divides effective duration by
     the efficiency multiplier; `PlayerInteraction.finishBreak` applies Silk Touch
     (drop the block itself) and Fortune (extra drops).
   - **Durability** — `DurabilityRules.applyDamage` honors an optional
     `unbreakingLevel`/`rng` to probabilistically skip wear; `Inventory` and
     `BlockSelector` forward them.
   - **Armor** — `ArmorProtection.reduce` accepts an optional `damageType` and
     folds the protection-family EPF into the post-armor reduction;
     `SurvivalSystem.damage` passes the damage `reason`.
4. The pure `weaponDamageBonus(key, level)` primitive is shipped and unit-tested
   as foundation for a future attack pathway (explicit non-goal to wire it).

## Invariants

- `ENCHANTMENTS_COMPONENT` value is an object whose every value is a finite
  integer `>= 1`; values failing validation throw `RegistryError('INVALID_ID')`
  at write time (via `StackComponentMap.with`).
- `efficiencySpeedMultiplier(level) = 1 + 0.3 * level` for `level >= 0`.
- `silkTouchActive(level) = level >= 1`.
- `fortuneBonusCount(level, rng) = level <= 0 ? 0 : Math.floor(rng() * (level + 1))`
  (yields `0..level`).
- `weaponDamageBonus`: sharpness `1 + 0.5 * level`; smite / bane_of_arthropods
  `2.5 * level`; otherwise `0`.
- `unbreakingWearChance(level) = 1 / (level + 1)` (probability wear is applied).
- `protectionEPF(kind, level)`: `protection` → `level`; `fire_protection` /
  `blast_protection` / `projectile_protection` → `2 * level`.
- `protectionEnchantKeysFor(damageType?)` returns `['protection']` plus the
  matching specialized key (fire/lava→`fire_protection`,
  explosion/blast→`blast_protection`, projectile/arrow→`projectile_protection`),
  or `['protection']` alone for generic/fall/drowning/starvation damage.
- `armorEnchantEPF` sums per-worn-stack matching enchant levels via
  `protectionEPF`, capped at `20`.
- `applyArmorEnchantReduction(reduced, epf) = epf > 0 ? reduced / (epf + 1) : reduced`.
- Armor `absorbed` (durability wear driver) is **unchanged** by EPF — only the
  `reduced` portion is further reduced, preserving existing armor-wear behavior.
- Every new `BlockSelector` member and function parameter is **optional**, so
  existing callers and mocks keep working unchanged.
- `InventorySnapshot.version` stays `1`; no persisted field is added.

## API and data model

```ts
// src/inventory/StackDataComponents.ts (additive)
export const ENCHANTMENTS_COMPONENT: ResourceId = createResourceId('minecraft', 'enchantments');
export type EnchantmentsComponentValue = Readonly<Record<string, number>>; // resourceId-string -> level
export const enchantmentsComponentType: StackComponentType; // validate: object, finite int values >= 1
// createDefaultStackComponentRegistry() now registers [damageComponentType, enchantmentsComponentType]

// src/inventory/EnchantmentApplication.ts (new)
getStackEnchantments(stack: ItemStack, registry: EnchantmentRegistry): EnchantmentInstance[];
setStackEnchantments(stack: ItemStack, instances: EnchantmentInstance[], registry: EnchantmentRegistry): ItemStack;
getEnchantmentLevel(stack: ItemStack, key: string, registry: EnchantmentRegistry): number;
efficiencySpeedMultiplier(level: number): number;
silkTouchActive(level: number): boolean;
fortuneBonusCount(level: number, rng: () => number): number;
weaponDamageBonus(key: string, level: number): number;
unbreakingWearChance(level: number): number;
protectionEPF(kind: string, level: number): number;
protectionEnchantKeysFor(damageType?: string): string[];
armorEnchantEPF(stacks: ItemStack[], registry: EnchantmentRegistry, damageType?: string): number;
applyArmorEnchantReduction(reduced: number, epf: number): number;

// src/inventory/BlockSelector.ts (additive)
getSelectedStack?(): ItemStack | null;
damageSelectedItem?(amount: number, maxDurability: number, unbreakingLevel?: number, rng?: () => number): boolean;

// src/engine/HarvestRules.ts
getBreakDuration(def, tool, efficiencyLevel?: number): number;

// src/player/PlayerInteraction.ts (constructor opts)
enchantmentRegistry?: EnchantmentRegistry; // -> reads selected stack enchantments

// src/inventory/DurabilityRules.ts
applyDamage(maxDurability, stack, amount, unbreakingLevel?: number, rng?: () => number): DamageResult;

// src/player/ArmorProtection.ts
constructor(equipment, registry, enchantRegistry?: EnchantmentRegistry);
reduce(rawDamage, bypassArmor, damageType?: string): ArmorReduction;

// src/player/SurvivalSystem.ts
damage(amount, reason = 'damage'): void; // -> armor.reduce(amount, false, reason)
```

## Control/data flow

- **Bootstrap (Game):** `createDefaultEnchantmentRegistry()` is created once and
  passed into `PlayerInteraction` (so mining/durability drops read enchantments).
- **Mining speed:** `PlayerInteraction.advanceBreak` reads the selected stack's
  `efficiency` level (via `getEnchantmentLevel`) and passes it to
  `getBreakDuration`, which divides the effective duration by
  `efficiencySpeedMultiplier(level)`.
- **Drops:** `PlayerInteraction.finishBreak` reads `silk_touch` and `fortune`
  levels. Silk Touch overrides the loot result with a single stack of the block's
  own item form (`itemRegistry.getByResourceId(def.resourceId)`); Fortune adds
  `fortuneBonusCount(level, rng)` to the primary drop (Silk and Fortune are
  mutually exclusive so they never both apply).
- **Durability:** `finishBreak` reads `unbreaking` and passes `unbreakingLevel` +
  `rng` into `selector.damageSelectedItem`, which forwards to
  `DurabilityRules.applyDamage`. When `unbreakingLevel > 0` and
  `rng() >= 1/(unbreakingLevel+1)`, wear is skipped entirely.
- **Armor:** `SurvivalSystem.damage` passes `reason` to `ArmorProtection.reduce`.
  `reduce` computes the base armor reduction, then adds EPF from worn armor
  enchantments via `armorEnchantEPF`, reducing the post-armor `reduced` amount
  further while leaving `absorbed` (wear) intact.

## Detailed behavior

### Storage accessors

- `getStackEnchantments`: returns `[]` when the component is absent; otherwise
  maps each entry string→level into an `EnchantmentInstance` after parsing the
  resource id. An entry whose key fails to parse or is not in the registry is
  skipped defensively (write-time validation already guarantees well-formed data).
- `getEnchantmentLevel`: resolves the definition by `key`; when absent or the
  component missing, returns `0`. Returns the stored level when `>= 1`.
- `setStackEnchantments`: `validateEnchantmentList(instances, registry)` first
  (throws `UNKNOWN_ENCHANTMENT`/`LEVEL_OUT_OF_RANGE`/`ENCHANTMENT_CONFLICT`, never
  mutates); builds the `Record<string,number>` from `resourceIdToString(id)`; an
  empty list removes the component (in-place `without`), preserving a pristine
  stack. Returns a new `ItemStack` (never mutates input).

### Mining effect primitives

- `efficiencySpeedMultiplier(level)` — speed factor applied to break duration.
- `silkTouchActive(level)` — true when Silk Touch is present (`level >= 1`).
- `fortuneBonusCount(level, rng)` — extra items in `0..level`, deterministic for a
  given `rng` (0 for `level <= 0`).

### Durability primitive

- `unbreakingWearChance(level)` — the probability that a wear event actually
  degrades the item; higher level → lower chance.

### Armor EPF primitives

- `protectionEPF(kind, level)`, `protectionEnchantKeysFor(damageType?)`,
  `armorEnchantEPF(stacks, registry, damageType?)`,
  `applyArmorEnchantReduction(reduced, epf)` — compose into the post-armor
  reduction.

### Weapon primitive (non-goal application)

- `weaponDamageBonus(key, level)` — pure, deterministic; not invoked by any
  pathway yet (no attack call site exists).

## Failure modes

- Malformed `ENCHANTMENTS_COMPONENT` value (non-object, non-integer, `< 1`) →
  `StackComponentMap.with` throws `RegistryError('INVALID_ID')`; `setStackEnchantments`
  rejects invalid instances via `validateEnchantmentList` before writing.
- `getStackEnchantments` on a component with an unparseable key → entry skipped
  (defensive; not thrown).
- Silk Touch whose block has no item form (`getByResourceId` throws) → `blockItemId`
  returns `undefined` and Silk Touch is a no-op, keeping the normal loot (safe
  fallback for blocks without an item identity).
- `ArmorProtection` constructed without `enchantRegistry` → `reduce` ignores EPF
  and matches prior behavior exactly.

## Compatibility/migration

- No stored-shape change: the component is additive to the component model;
  `InventorySnapshot.version` stays `1`. Full `StackComponentMap` serialization is
  a latent gap (shared with `DAMAGE_COMPONENT`) deferred to a dedicated change;
  119 does not expand persisted shapes.
- All `BlockSelector` additions and function parameters are optional; existing
  callers, mocks, and the legacy `PlayerInteraction` fallback path are unaffected.

## Performance/resource constraints

- No allocation on the no-enchantment path: `getEnchantmentLevel`/`getStackEnchantments`
  short-circuit when the component is absent or the registry is missing.
- EPF computation is O(worn stacks × that stack's enchantments) — tiny per hit.
- `efficiencySpeedMultiplier` is a constant-time division in the break loop.

## Testing seams

- `EnchantmentApplication.test.ts` — every primitive plus storage round-trip,
  invalid-input rejection, and weapon primitive.
- `HarvestRules.test.ts` — efficiency divides duration.
- `DurabilityRules.test.ts` — unbreaking skip / wear behavior.
- `ArmorProtection.test.ts` — EPF reduces post-armor damage; `absorbed` unchanged;
  undefined-registry path matches prior output.
- `PlayerInteraction.test.ts` — Silk Touch / Fortune / Unbreaking wiring with a
  selected enchanted stack and an `enchantmentRegistry`.

## Observability/debugging

- `getStackEnchantments` lets a debug overlay list worn/held enchantments.
- Validation errors carry machine-readable `RegistryError` codes for UI surfacing
  in 120.

## Affected files/symbols

- `src/inventory/StackDataComponents.ts` — `ENCHANTMENTS_COMPONENT`,
  `enchantmentsComponentType`, registration.
- `src/inventory/EnchantmentApplication.ts` — **new** module.
- `src/inventory/BlockSelector.ts` — optional `getSelectedStack`,
  extended `damageSelectedItem`.
- `src/inventory/Inventory.ts` — `getSelectedStack()`; `damageSelectedItem`
  forwards unbreaking.
- `src/world/HarvestRules.ts` — `efficiencyLevel` param.
- `src/player/PlayerInteraction.ts` — `enchantmentRegistry` opt; efficiency/silk/
  fortune/unbreaking wiring.
- `src/inventory/DurabilityRules.ts` — unbreaking params.
- `src/player/ArmorProtection.ts` — `enchantRegistry` + EPF in `reduce`.
- `src/player/SurvivalSystem.ts` — passes `reason` to `reduce`.
- `src/engine/Game.ts` — creates + injects `enchantmentRegistry`.
- NEW `tests/unit/EnchantmentApplication.test.ts`; extensions to the listed suites.

## Rejected alternatives

- *Persist enchantments now*: rejected — `StackComponentMap` is not yet
  JSON-safe (latent gap shared with `DAMAGE_COMPONENT`); general component
  serialization is a dedicated change. 119 keeps `InventorySnapshot.version` at 1.
- *Wire the attack pathway for weapon enchants*: rejected — no attacker→target
  damage call site exists; `weaponDamageBonus` is shipped as a tested primitive
  for the future pathway.

## Downstream dependencies

- `120-enchanting-table` consumes `setStackEnchantments` to attach enchantments
  produced at the table.
- Anvil/grindstone/mending (948/949/2202/2203) reuse the storage accessors and
  durability primitive.
