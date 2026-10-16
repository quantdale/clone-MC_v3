# Design: 118-enchantment-registry

## Context/current state

No enchantment concept exists. `src/inventory/ItemRegistry.ts` defines `ItemTypeDefinition`
with `toolKind?: ToolKind`, `toolTier?`, `defensePoints?`, `toughness?`, `isFood?`, etc.
`src/data/ResourceId.ts` provides stable ids; `src/data/Registry.ts` provides `RegistryError`.
Item stacks are not yet enchantment-aware.

## Target state

A single module `src/inventory/EnchantmentRegistry.ts` owns:

1. The `EnchantmentDefinition` data model.
2. The `EnchantmentRegistry` class (mirrors `ItemTypeRegistry`'s dense lookup + maps).
3. Pure applicability (`enchantmentAppliesTo`) and conflict (`areIncompatible`) helpers.
4. The `EnchantmentInstance` model + `validateEnchantmentList`.
5. Strict `serializeEnchantments` / `deserializeEnchantments` (037-style `version:1`).
6. `createDefaultEnchantmentRegistry()` seeding the representative catalog.

## Invariants

- `maxLevel >= 1` for every definition.
- Conflict is symmetric: `areIncompatible(a,b) === areIncompatible(b,a)`.
- An enchantment is applicable to an item iff at least one of its `targets` matches.
- `level` on an instance is an integer in `[1, maxLevel]`.
- `deserializeEnchantments` is atomic: any invalid entry rejects the whole payload and
  returns nothing (no partial list).
- `validateEnchantmentList` returns `true` only when every instance is known, in-range,
  and pairwise non-conflicting.

## API and data model

```ts
export type EnchantmentTarget =
  | 'all'
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'pickaxe'
  | 'axe'
  | 'shovel'
  | 'bow'
  | 'fishing_rod';

export interface EnchantmentDefinition {
  id: ResourceId;
  key: string;
  name: string;
  maxLevel: number;            // >= 1
  targets: EnchantmentTarget[];
  incompatibleWith: ResourceId[]; // symmetric conflicts
}

export interface EnchantmentInstance {
  id: ResourceId;
  level: number;              // integer in [1, maxLevel]
}

export interface EnchantmentListSnapshot {
  version: 1;
  entries: { id: string; level: number }[];
}
```

`EnchantmentRegistry`:

```ts
class EnchantmentRegistry {
  get(id: number): EnchantmentDefinition;          // by numeric legacy id
  getByResourceId(rid: ResourceId): EnchantmentDefinition;
  getByKey(key: string): EnchantmentDefinition | undefined;
  all(): EnchantmentDefinition[];
  areIncompatible(a: ResourceId, b: ResourceId): boolean; // symmetric
  appliesTo(def: EnchantmentDefinition, item: ItemTypeDefinition): boolean;
}
```

Free functions (not tied to a registry instance for applicability/validation):

```ts
enchantmentAppliesTo(targets: EnchantmentTarget[], item: ItemTypeDefinition): boolean;
validateEnchantmentList(instances: EnchantmentInstance[], registry: EnchantmentRegistry): boolean;
serializeEnchantments(instances: EnchantmentInstance[]): EnchantmentListSnapshot;
deserializeEnchantments(snapshot: unknown, registry: EnchantmentRegistry): EnchantmentInstance[];
```

## Control/data flow

- Bootstrap calls `createDefaultEnchantmentRegistry()` once; the result is frozen and
  shared (mirrors `createDefaultItemRegistry`).
- Applicability is computed on demand from `targets` + an `ItemTypeDefinition`. The
  predicate map is a pure `Record<EnchantmentTarget, (def: ItemTypeDefinition) => boolean>`.
- Conflict is computed by checking `incompatibleWith` membership in both directions
  (`a.incompatibleWith includes b.id` OR `b.incompatibleWith includes a.id`).
- Serialization writes each instance as `{ id: resourceIdToString(id), level }`;
  deserialization resolves the resource id via `registry.getByResourceId`, validates level
  range, and throws on the first failure.

## Detailed behavior

### Applicability predicates

- `all`: always true.
- `tool`: `item.toolKind !== undefined`.
- `weapon`: `item.isWeapon === true` (reserved; no current item sets it — see Risks).
- `armor`: `(item.defensePoints ?? 0) > 0`.
- `pickaxe`/`axe`/`shovel`: `item.toolKind === ToolKind.{Pickaxe,Axe,Shovel}`.
- `bow`/`fishing_rod`: reserved for future items (predicate checks a matching flag, currently never true).

### Conflict groups (seed catalog)

- Tool: `efficiency`, `fortune`, `silk_touch` — `fortune` ⇎ `silk_touch`.
- Weapon damage: `sharpness`, `smite`, `bane_of_arthropods` — pairwise mutually exclusive.
- Armor protection: `protection`, `fire_protection`, `blast_protection`,
  `projectile_protection` — pairwise mutually exclusive within the group.

### Instance validation

`validateEnchantmentList` iterates the list; for each instance it resolves the definition
(via `registry.getByResourceId`), asserts `Number.isInteger(level) && 1 <= level <= maxLevel`,
and checks against every other instance with `registry.areIncompatible`. On any failure it
throws a `RegistryError` with a descriptive `code` (`UNKNOWN_ENCHANTMENT`, `LEVEL_OUT_OF_RANGE`,
`ENCHANTMENT_CONFLICT`).

## Failure modes

- Unknown id in registry construction → `RegistryError('DUPLICATE_ID'|'MISSING_ID')`.
- `deserializeEnchantments` with `{ version != 1 }`, unknown id, or out-of-range level →
  throws; the caller's list is unchanged (atomic).
- `validateEnchantmentList` with a conflict or bad level → throws; no mutation.

## Compatibility/migration

- New `version:1` snapshot only; no existing stored shapes change.
- `ItemStack` integration is intentionally deferred (non-goal).

## Performance/resource constraints

- Registry lookups are O(1) (dense array + maps). `areIncompatible`/`appliesTo` are O(1)
  per call; `validateEnchantmentList` is O(n²) over a tiny `n` (≤ a handful per item) — fine.
- No allocations on the no-enchantment path; the module is imported lazily by 119/120.

## Testing seams

- Pure functions (`enchantmentAppliesTo`, `areIncompatible`, `validateEnchantmentList`,
  `serialize/deserialize`) are unit-testable with minimal `ItemTypeDefinition` mocks.
- `createDefaultEnchantmentRegistry()` is the shared fixture for registry tests.

## Observability/debugging

- `EnchantmentRegistry.all()` lets a debug panel list known enchantments.
- Validation errors carry machine-readable `code`s for UI surfacing in 120.

## Affected files/symbols

- NEW `src/inventory/EnchantmentRegistry.ts`.
- NEW tests `tests/unit/EnchantmentRegistry.test.ts`.
- NO changes to `ItemStack`/`Inventory`/`PlayerStateRecord` in 118.

## Rejected alternatives

- *Store applicability as a closure per definition*: rejected — closures can't be
  serialized and make conflict reasoning implicit; declarative `targets` + a shared
  predicate map is testable and 119-reusable.
- *Eagerly attach enchantments to `ItemStack` in 118*: rejected — that couples 118 to
  inventory persistence and belongs with effect application in 119.

## Downstream dependencies

- `119-enchantment-application` consumes `getByResourceId` + the instance model to compute
  effect magnitudes.
- `120-enchanting-table` consumes `appliesTo` + `areIncompatible` for offer generation.
- `219-enchantment-potion-content-expansion` fills the remaining catalog entries.
