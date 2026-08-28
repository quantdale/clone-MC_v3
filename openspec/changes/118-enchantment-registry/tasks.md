# Tasks: 118-enchantment-registry

Status: VERIFIED
Completion: 100%

## 1. Data model + registry

- [x] **1.1** Create `src/inventory/EnchantmentRegistry.ts` with `EnchantmentTarget`,
      `EnchantmentDefinition`, `EnchantmentInstance`, `EnchantmentListSnapshot`, the
      `EnchantmentRegistry` class (`get`/`getByResourceId`/`getByKey`/`all`/
      `areIncompatible`/`appliesTo`), and `createDefaultEnchantmentRegistry()`.
- [x] **1.2** Add the applicability predicate map `enchantmentAppliesTo(targets, itemDef)`
      covering `all`/`tool`/`weapon`/`armor`/`pickaxe`/`axe`/`shovel`/`bow`/`fishing_rod`,
      and make `registry.appliesTo` delegate to it.
- [x] **1.3** Implement `areIncompatible` as a symmetric check over both definitions'
      `incompatibleWith`.
- [x] **1.4** Typecheck-only: confirm the module compiles and the seed catalog matches
      `spec.md` (fortune maxLevel 3, silk_touch maxLevel 1, etc.).

## 2. Instance validation + persistence

- [x] **2.1** Implement `validateEnchantmentList(instances, registry)` — known id, integer
      level in `[1, maxLevel]`, pairwise non-conflict; throws `RegistryError`
      (`UNKNOWN_ENCHANTMENT` / `LEVEL_OUT_OF_RANGE` / `ENCHANTMENT_CONFLICT`).
- [x] **2.2** Implement `serializeEnchantments` / `deserializeEnchantments` (037-style
      `version:1`); deserialization is strict and atomic (throws on bad version / unknown
      id / out-of-range level, returns nothing partial).

## 3. Seed catalog

- [x] **3.1** Seed `createDefaultEnchantmentRegistry()` with the representative catalog:
      `efficiency`, `fortune`, `silk_touch` (fortune⇎silk_touch); `sharpness`, `smite`,
      `bane_of_arthropods` (pairwise exclusive); `unbreaking` (all); `protection`,
      `fire_protection`, `blast_protection`, `projectile_protection` (pairwise exclusive).

## 4. Unit tests

- [x] **4.1** `tests/unit/EnchantmentRegistry.test.ts` — registry resolution (by key/
      resource/legacy) + unknown throws; symmetric conflicts (fortune⇎silk_touch, sharpness
      group, armor group); applicability (efficiency on pickaxe, not on food, unbreaking on
      armor); `validateEnchantmentList` (valid passes, level out of range, conflict);
      `serialize`/`deserialize` (round-trip, bad version, unknown-id atomic reject).

## 5. Full regression gate

- [x] **5.1** `npm run typecheck` — PASS.
- [x] **5.2** `npm run lint` — PASS.
- [x] **5.3** `npm test` — PASS (1439 unit: prior 1418 + 21 new `EnchantmentRegistry.test.ts`).
- [x] **5.4** `npm run build` — PASS.
- [x] **5.5** `npm run test:e2e` — PASS.

## 6. Documentation / state

- [ ] **6.1** Update `openspec/changes/118-enchantment-registry/verification.md` with real
      command output and per-requirement evidence.
- [ ] **6.2** Advance `PROGRAM_STATE.json`/`.md`: currentChange = `118-enchantment-registry`
      VERIFIED, nextChange = `119-enchantment-application`; record completion %,
      validations, Git HEAD.

## 7. Commit + publish

- [ ] **7.1** Commit implementation (impl) and update state (state-bump) as two commits;
      `git push origin HEAD:main`; confirm remote `main` == local HEAD.
