# Spec: enchantment-registry

## Contract

This capability defines the enchantment registry: stable enchantment definitions
(resource id, display name, maximum level), the rules that decide which items an
enchantment may be applied to (*applicability*), and the rules that forbid certain
enchantments from coexisting on one item (*conflict*). It also defines the normalized
`EnchantmentInstance` model, strict validation of an enchantment list, and a
`version:1` persistence envelope. It does **not** apply enchantment effects (that is
`119-enchantment-application`), attach enchantments to `ItemStack` (119/equipment), or
generate offers at an enchanting table (120). Every normative requirement is backed by a
deterministic formula and at least one GIVEN/WHEN/THEN scenario with concrete ids/levels.

## Definitions

- **Enchantment** — a registered definition identified by a stable `ResourceId`, with a
  `maxLevel >= 1`, a set of `targets` (item categories it may apply to), and a list of
  `incompatibleWith` resource ids.
- **EnchantmentInstance** — a concrete enchantment on an item: `{ id: ResourceId,
  level: number }` where `level` is an integer in `[1, maxLevel]`.
- **Target** — an item category used by applicability: `all`, `tool`, `weapon`, `armor`,
  `pickaxe`, `axe`, `shovel`, `bow`, `fishing_rod`.
- **Conflict** — two enchantments conflict iff either's `incompatibleWith` contains the
  other's id (symmetric).
- **Applicability** — an enchantment applies to an item iff at least one of its `targets`
  matches the item per the predicate map.

## Invariants

- Every definition has `maxLevel >= 1`.
- `areIncompatible(a, b) === areIncompatible(b, a)` for all registered pairs.
- A `level` on an instance is an integer in `[1, maxLevel]` of its definition.
- `deserializeEnchantments` is atomic: one invalid entry rejects the whole payload; the
  returned list is all-or-nothing.
- `validateEnchantmentList` returns `true` only when every instance is known, in range,
  and pairwise non-conflicting.

## Requirements

### Requirement: enchantment definition registry

`EnchantmentRegistry` MUST register every definition from
`createDefaultEnchantmentRegistry()`, resolve a definition by numeric legacy id
(`get`), by `ResourceId` (`getByResourceId`), and by key (`getByKey`), and expose
`all()`. `get`/`getByResourceId` MUST throw `RegistryError` for unknown ids.

#### Scenario: resolves a seeded definition by every key

- **GIVEN** `registry = createDefaultEnchantmentRegistry()`
- **WHEN** `registry.getByResourceId(createResourceId('minecraft','fortune'))` is read
- **THEN** the returned definition has `key === 'fortune'`, `maxLevel === 3`, and
  `targets` containing `'pickaxe'` (and `'axe'`, `'shovel'`).
- **AND** `registry.getByKey('silk_touch')` returns the same definition and
  `registry.all().length` equals the seeded catalog size.

#### Scenario: unknown id throws

- **GIVEN** `registry = createDefaultEnchantmentRegistry()`
- **WHEN** `registry.getByResourceId(createResourceId('minecraft','nonexistent'))` is read
- **THEN** a `RegistryError` with code `MISSING_ID` is thrown.

### Requirement: symmetric conflict rules

`EnchantmentRegistry.areIncompatible(a, b)` MUST return `true` iff either `a`'s
`incompatibleWith` contains `b.id` or `b`'s `incompatibleWith` contains `a.id`, and MUST
be symmetric.

#### Scenario: fortune and silk_touch conflict

- **GIVEN** `registry = createDefaultEnchantmentRegistry()`
- **WHEN** `areIncompatible(fortune.id, silk_touch.id)` and the reverse are evaluated
- **THEN** both return `true`.

#### Scenario: sharpness group is pairwise exclusive

- **GIVEN** `registry` with `sharpness`, `smite`, `bane_of_arthropods`
- **WHEN** each distinct pair is checked
- **THEN** every pair is incompatible, and `sharpness` vs `unbreaking` is not.

#### Scenario: armor protection group is pairwise exclusive

- **GIVEN** `registry` with `protection`, `fire_protection`, `blast_protection`,
  `projectile_protection`
- **WHEN** each distinct pair within the group is checked
- **THEN** every pair is incompatible, and `protection` vs `unbreaking` is not.

### Requirement: applicability predicates

`enchantmentAppliesTo(targets, itemDef)` MUST return `true` iff at least one target
matches the item: `all` always; `tool` when `toolKind !== undefined`; `armor` when
`defensePoints > 0`; `pickaxe`/`axe`/`shovel` when `toolKind` equals the matching kind;
reserved targets (`weapon`, `bow`, `fishing_rod`) match only items carrying the
corresponding flag (none currently set). `EnchantmentRegistry.appliesTo(def, itemDef)`
MUST delegate to `enchantmentAppliesTo(def.targets, itemDef)`.

#### Scenario: efficiency applies to a pickaxe

- **GIVEN** `def = registry.getByKey('efficiency')` and `pick = { id: 20, toolKind:
  ToolKind.Pickaxe, ... }` (a minimal `ItemTypeDefinition`)
- **WHEN** `registry.appliesTo(def, pick)` is evaluated
- **THEN** it returns `true`.

#### Scenario: efficiency does not apply to food

- **GIVEN** `def = registry.getByKey('efficiency')` and `apple = { id: 13, isFood: true }`
- **WHEN** `registry.appliesTo(def, apple)` is evaluated
- **THEN** it returns `false`.

#### Scenario: unbreaking applies to armor

- **GIVEN** `def = registry.getByKey('unbreaking')` and `chest = { id: 25, defensePoints: 2 }`
- **WHEN** `registry.appliesTo(def, chest)` is evaluated
- **THEN** it returns `true` (target `all` matches everything).

### Requirement: instance validation

`validateEnchantmentList(instances, registry)` MUST return `true` when every instance
resolves to a known definition, has an integer `level` in `[1, maxLevel]`, and is
pairwise non-conflicting; it MUST throw `RegistryError` with code `UNKNOWN_ENCHANTMENT`
for an unknown id, `LEVEL_OUT_OF_RANGE` for a level outside `[1, maxLevel]`, and
`ENCHANTMENT_CONFLICT` for a conflicting pair.

#### Scenario: a valid list passes

- **GIVEN** `registry` and `[{ id: fortune, level: 2 }, { id: unbreaking, level: 1 }]`
- **WHEN** `validateEnchantmentList(list, registry)` is called
- **THEN** it returns `true`.

#### Scenario: out-of-range level is rejected

- **GIVEN** `registry` and `[{ id: fortune, level: 9 }]` (fortune `maxLevel` is 3)
- **WHEN** `validateEnchantmentList(list, registry)` is called
- **THEN** it throws `RegistryError` with code `LEVEL_OUT_OF_RANGE`.

#### Scenario: a conflicting pair is rejected

- **GIVEN** `registry` and `[{ id: fortune, level: 1 }, { id: silk_touch, level: 1 }]`
- **WHEN** `validateEnchantmentList(list, registry)` is called
- **THEN** it throws `RegistryError` with code `ENCHANTMENT_CONFLICT`.

### Requirement: persistence envelope

`serializeEnchantments(instances)` MUST return `{ version: 1, entries: [{ id:
resourceIdToString(id), level }] }`. `deserializeEnchantments(snapshot, registry)` MUST
rebuild the instances exactly (id + level), MUST throw on `version !== 1`, an unknown id,
or an out-of-range level, and MUST be atomic (the whole call fails on the first invalid
entry; nothing is returned).

#### Scenario: round-trips exactly

- **GIVEN** `instances = [{ id: fortune, level: 3 }, { id: unbreaking, level: 2 }]`
- **WHEN** serialized then deserialized against `registry`
- **THEN** the result equals the originals field-for-field (id + level).

#### Scenario: bad version is rejected

- **GIVEN** `{ version: 2, entries: [] }`
- **WHEN** `deserializeEnchantments` is called
- **THEN** it throws.

#### Scenario: unknown id in a batch is rejected atomically

- **GIVEN** a snapshot with one valid entry and one entry whose `id` is not registered
- **WHEN** `deserializeEnchantments` is called
- **THEN** it throws and no list is returned.

## Error and failure behavior

- Registry construction rejects duplicate ids / missing cross-references (`RegistryError`).
- `get`/`getByResourceId` throw `MISSING_ID` for unknown ids.
- `validateEnchantmentList` throws `UNKNOWN_ENCHANTMENT` / `LEVEL_OUT_OF_RANGE` /
  `ENCHANTMENT_CONFLICT` and never mutates its input.
- `deserializeEnchantments` validates `version`, id, and level; the first failure throws
  and yields no partial result.

## Performance and resource bounds

- Lookups are O(1) (dense array + maps). `areIncompatible`/`appliesTo` are O(1);
  `validateEnchantmentList` is O(n²) over a tiny per-item `n`. No allocations on the
  no-enchantment path.

## Compatibility and migration

- `EnchantmentListSnapshot` is a new `version:1` envelope; absence of an envelope is
  interpreted as "no enchantments" by future consumers. No existing stored shape changes
  in 118.

## Security and integrity

- `deserializeEnchantments` never trusts caller data: unknown ids and out-of-range levels
  are rejected, and a crafted payload cannot inject an unregistered enchantment or an
  impossible level. `validateEnchantmentList` enforces the conflict rules so a crafted
  list cannot bypass exclusivity.

## Observability

- `EnchantmentRegistry.all()` exposes the known catalog for debug/UI; validation errors
  carry machine-readable `code`s.

## Verification mapping

| Requirement | Tests |
|---|---|
| Enchantment definition registry | `EnchantmentRegistry.test.ts` — resolve by key/resource/legacy; unknown throws |
| Symmetric conflict rules | `EnchantmentRegistry.test.ts` — fortune⇎silk_touch; sharpness group; armor group |
| Applicability predicates | `EnchantmentRegistry.test.ts` — efficiency on pickaxe; not on food; unbreaking on armor |
| Instance validation | `EnchantmentRegistry.test.ts` — valid passes; level out of range; conflict |
| Persistence envelope | `EnchantmentRegistry.test.ts` — round-trip; bad version; unknown-id atomic reject |
| Full gate | `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` |
