# Tasks: 119-enchantment-application

Status: VERIFIED
Completion: 100%

## 1. Register ENCHANTMENTS_COMPONENT

- [x] **1.1** In `src/inventory/StackDataComponents.ts`, add `ENCHANTMENTS_COMPONENT`
      (`createResourceId('minecraft', 'enchantments')`), `EnchantmentsComponentValue`
      (record of `string -> number`), and `enchantmentsComponentType` validating a
      non-null object whose every value is a finite integer `>= 1`.
- [x] **1.2** Register `enchantmentsComponentType` in `createDefaultStackComponentRegistry()`.
- [x] **1.3** Unit test: valid record round-trips; non-integer / `< 1` / non-object
      values throw `RegistryError('INVALID_ID')`.

## 2. EnchantmentApplication module

- [x] **2.1** Create `src/inventory/EnchantmentApplication.ts` with storage accessors
      `getStackEnchantments`, `setStackEnchantments`, `getEnchantmentLevel` and the
      effect primitives `efficiencySpeedMultiplier`, `silkTouchActive`,
      `fortuneBonusCount`, `weaponDamageBonus`, `unbreakingWearChance`,
      `protectionEPF`, `protectionEnchantKeysFor`, `armorEnchantEPF`,
      `applyArmorEnchantReduction`.
- [x] **2.2** Unit test every primitive with boundary values (level 0/1/max, rng
      edges) and `weaponDamageBonus` for sharpness/smite/unknown.
- [x] **2.3** Unit test `setStackEnchantments`/`getStackEnchantments` round-trip,
      empty-list clears, invalid list throws `LEVEL_OUT_OF_RANGE` without mutating
      input, and `getEnchantmentLevel` returns 0 when absent.

## 3. Mining pathway (efficiency + silk/fortune)

- [x] **3.1** Extend `HarvestRules.getBreakDuration(def, tool, efficiencyLevel?)`
      to divide the effective duration by `efficiencySpeedMultiplier(level)` when
      `efficiencyLevel > 0`, floored at `MIN_BREAK_DURATION`.
- [x] **3.2** Add `enchantmentRegistry?: EnchantmentRegistry` to `PlayerInteraction`
      constructor; add a private `selectedEnchantLevel(key)` helper.
- [x] **3.3** `advanceBreak` passes the selected stack's `efficiency` level to
      `getBreakDuration`.
- [x] **3.4** `finishBreak` applies Silk Touch (override drops with the block's own
      item form) and Fortune (add `fortuneBonusCount` to the primary drop), guarded
      by `enchantmentRegistry` and `getSelectedStack?.()`.
- [x] **3.5** Unit test: efficiency shortens break in `HarvestRules`; Silk Touch /
      Fortune wiring in `PlayerInteraction.test.ts` with an `enchantmentRegistry`
      and a selected enchanted stack.

## 4. Durability pathway (unbreaking)

- [x] **4.1** Extend `DurabilityRules.applyDamage` with optional `unbreakingLevel?`
      and `rng?`; skip wear when `unbreakingLevel > 0 && rng !== undefined &&
      rng() >= 1/(unbreakingLevel+1)`.
- [x] **4.2** Add optional `getSelectedStack?(): ItemStack | null` to `BlockSelector`
      and extend `damageSelectedItem?(amount, maxDurability, unbreakingLevel?, rng?)`;
      implement both in `Inventory`.
- [x] **4.3** `PlayerInteraction.finishBreak` reads `unbreaking` from the selected
      stack and forwards `unbreakingLevel` + `rng` to `selector.damageSelectedItem`.
- [x] **4.4** Unit test: unbreaking skip / wear in `DurabilityRules.test.ts`;
      unbreaking wiring in `PlayerInteraction.test.ts`.

## 5. Armor pathway (protection EPF)

- [x] **5.1** Add optional `enchantRegistry?: EnchantmentRegistry` to
      `ArmorProtection` constructor; extend `reduce(rawDamage, bypassArmor,
      damageType?)` to fold `armorEnchantEPF` into the post-armor `reduced` via
      `applyArmorEnchantReduction`, leaving `absorbed` unchanged.
- [x] **5.2** `SurvivalSystem.damage(amount, reason)` passes `reason` to
      `armor.reduce(amount, false, reason)`.
- [x] **5.3** Unit test: EPF reduces post-armor damage; `absorbed` unchanged; fire
      damage routes to fire_protection; EPF capped at 20; missing registry matches
      prior behavior (extend `ArmorProtection.test.ts`, `SurvivalSystem.test.ts`).

## 6. Integration wiring + tests

- [x] **6.1** In `Game.ts`, create `createDefaultEnchantmentRegistry()` once and
      inject it into `PlayerInteraction` via the new `enchantmentRegistry` opt.
- [x] **6.2** Add/extend integration tests covering a full break with an enchanted
      tool (efficiency + silk/fortune + unbreaking) and an armor EPF mitigation.

## 7. Full gate + verification + state advance

- [x] **7.1** Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
      `npm run test:e2e`; all green.
- [x] **7.2** Fill `verification.md` with real evidence; mark every task group done.
- [x] **7.3** Advance `openspec/PROGRAM_STATE.json` / `.md` to 119 VERIFIED; set
      `nextChange` to `120-enchanting-table`.
- [x] **7.4** Commit (impl + state bump) and push to `origin/main`; verify remote == local.
