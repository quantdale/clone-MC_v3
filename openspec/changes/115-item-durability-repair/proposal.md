# Proposal: 115-item-durability-repair

## Problem

Tool/armor wear is already encoded as a `maxDurability` field on item definitions
and an accumulated `DAMAGE_COMPONENT` on stacks, with `Inventory.damageSelectedItem`
applying `1` point of wear per block break and zeroing the stack when it runs out.
That logic is:

1. **Ad-hoc and non-reusable** — the wear math lives inline in one mutating
   `Inventory` method, so later systems (enchantment Unbreaking, Mending, anvil/
   grindstone repair) cannot share a single, testable source of truth.
2. **Missing a repair rule** — nothing reduces accumulated damage; a worn tool can
   only be discarded. The `CHANGE_SEQUENCE` outcome for 115 is "general
   component-driven durability damage/break/repair rules", so repair must exist as
   a first-class, reusable rule even before the anvil/grindstone UIs (changes 2202/
   2203) consume it.

## Goals

- Introduce a **general, pure, component-driven `DurabilityRules` module** that owns
  the durability math for any stack: remaining durability, damage application,
  break detection, and repair.
- Make `Inventory.damageSelectedItem` **delegate** to `DurabilityRules.applyDamage`
  with identical observable behavior (no gameplay change).
- Add `Inventory.repairSelectedItem(amount)` backed by `DurabilityRules.repair`,
  giving the program a real repair rule reachable by later changes.
- Cover damage, break-at-zero, remaining-durability, and repair with unit tests.

## Non-goals

- Unbreaking/Mending enchantment effects (change 119) — the `applyDamage` amount is
  left as the single input hook those changes will modulate.
- Anvil combination / Grindstone repair / Mending-as-XP (changes 948, 949, 2202,
  2203) — those consume `DurabilityRules.combine`/repair later; 115 only provides
  the primitive rules.
- Armor-toughness / protection math (change 116) — unrelated to the wear component.
- New tools, items, or recipes — only the existing tool catalog is governed.

## Preconditions

- Change 114 (`tool-tier-and-harvest-rules`) is VERIFIED and the program has
  advanced to 115.
- `StackDataComponents` (change 008) provides `DAMAGE_COMPONENT` / `DamageComponentValue`
  and the immutable `StackComponentMap`.
- `ItemRegistry` (change 004) carries `maxDurability` on tool definitions.
- `Inventory` (change 009) exposes `damageSelectedItem` and durability accessors.

## Dependencies

- Change 008 (stack data components) — damage carrier.
- Change 004 / 009 — item definitions and inventory storage.

## Proposed change

1. New `src/inventory/DurabilityRules.ts` exposing pure functions operating on an
   explicit `maxDurability` (the item's `ItemTypeDefinition.maxDurability`) plus the
   stack's `DAMAGE_COMPONENT`:
   - `getRemainingDurability(maxDurability, stack)` → `clamp(max - damage, 0, max)`,
     `0` for non-tools/empty stacks.
   - `isBroken(maxDurability, stack)` → true for a tool whose remaining durability
     `<= 0` or whose `count <= 0`; false for non-tools.
   - `applyDamage(maxDurability, stack, amount)` → `{ stack, broke }`; accumulates
     `max(1, trunc(amount))` into `DAMAGE_COMPONENT`; when remaining reaches `<= 0`
     the returned stack has `count = 0` and `components = undefined` (`broke = true`).
     Non-tools/empty stacks are returned unchanged with `broke = false`.
   - `repair(maxDurability, stack, amount)` → reduces accumulated damage by
     `max(1, trunc(amount))`, clamped at `0`; pristine/non-tool/empty stacks returned
     unchanged; `count` and identity preserved.
2. `Inventory.damageSelectedItem` delegates to `applyDamage` (same observable
   behavior, now routed through the shared rule).
3. `Inventory.repairSelectedItem(amount)` delegates to `repair`, returning whether
   the selected tool changed.

## Compatibility and migration

- No persisted-data schema changes. `DAMAGE_COMPONENT`, `maxDurability`, and the
  legacy `durability` snapshot field are unchanged; `damageSelectedItem`'s contract
  (signature + return) is preserved.
- `DurabilityRules` is additive (new module + new optional inventory method); no
  public signature is removed.

## Risks

- **Behavior regression in break detection**: the inline math must reproduce the
  existing `remaining - max(1, trunc(amount))` step and the break-zeroing exactly,
  or existing `Inventory.test.ts` durability cases fail. Mitigated by pinning those
  cases and reusing the same formula.
- **Component-map churn**: building a new `StackComponentMap` per damage step is
  fine (low frequency, per break), but the pure functions must reuse the stack's
  existing component map when present to avoid dropping unrelated components.

## Rollback strategy

`DurabilityRules` and `repairSelectedItem` are additive. Reverting the
`damageSelectedItem` delegation to the prior inline body restores prior behavior
without touching data.

## Definition of Done

- `DurabilityRules` correctly computes remaining durability, applies damage with the
  `0.08`-free integer wear model, detects break-at-zero, and repairs (reduces
  damage, clamps at pristine).
- `Inventory.damageSelectedItem` routes through `applyDamage` with identical
  observable behavior (existing durability tests stay green).
- `Inventory.repairSelectedItem` is implemented and tested.
- Unit tests cover remaining/apply/break/repair for tools and non-tools; full
  baseline regression gate is green (typecheck, lint, unit, build, e2e).

## Advancement gate

100% task completion, all MUST/SHALL requirements verified by tests, and the
baseline regression gate (`npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:e2e`) fully green.
