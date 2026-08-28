# Tasks: 115-item-durability-repair

## 1. Module

- [x] Create `src/inventory/DurabilityRules.ts` with pure functions
      `getRemainingDurability`, `isBroken`, `applyDamage`, `repair` operating on
      `ItemStack` + `maxDurability` via `DAMAGE_COMPONENT`.

## 2. Inventory integration

- [x] Refactor `Inventory.damageSelectedItem` to delegate to `applyDamage` with
      identical observable behavior (existing durability tests stay green).
- [x] Add `Inventory.repairSelectedItem(amount)` delegating to `repair`, returning
      whether the selected tool changed.

## 3. Tests

- [x] `tests/unit/DurabilityRules.test.ts`: remaining durability (pristine/worn/
      non-tool); applyDamage (wear, break-at-zero, non-tool no-op, negative amount);
      isBroken (full/depleted/non-tool); repair (reduce, clamp-at-pristine, pristine
      no-op, non-tool no-op).
- [x] `tests/unit/Inventory.test.ts`: extend with a `repairSelectedItem` case
      (reduces wear, returns true on change).

## 4. Gate

- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes.
- [x] `npx vitest run` passes (new + existing green).
- [x] `npm run build` passes.
- [x] `npm run test:e2e` passes.

## 5. State / handoff

- [x] Mark tasks complete; finalize `verification.md` with evidence.
- [x] Checkpoint `PROGRAM_STATE`; commit impl + artifacts; push to `origin/main`;
      advance to change `116-armor-protection`.
