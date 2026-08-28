# Design: 115-item-durability-repair

## Context/current state

Tool wear today is encoded two ways: `ItemTypeDefinition.maxDurability` (e.g.
wooden_pickaxe `59`, stone_pickaxe `131`) and a per-stack `DAMAGE_COMPONENT`
(`{ damage: number }`) carried in `ItemStack.components`. On a successful block
break, `PlayerInteraction` calls `selector.damageSelectedItem(1, maxDurability)`,
which `Inventory.damageSelectedItem` implements inline:

```ts
const damage = stack.components?.get(DAMAGE_COMPONENT)?.damage ?? 0;
const remaining = maxDurability - damage;
const next = remaining - Math.max(1, Math.trunc(amount));
if (next <= 0) { stack.count = 0; stack.components = undefined; return true; }
const newDamage = maxDurability - next;
stack.components = (stack.components ?? emptyStackComponents()).with(DAMAGE_COMPONENT, { damage: newDamage });
return false;
```

There is **no repair** and **no shared, reusable** wear model.

## Target state

A single pure module `src/inventory/DurabilityRules.ts` owns all durability math;
`Inventory` delegates to it. Repair becomes a first-class rule.

## Invariants

- `maxDurability` of `0` (or absent) means the item is not a tool and is never
  "broken" or repairable.
- Wear is an **integer** accumulated in `DAMAGE_COMPONENT.damage >= 0`; each
  application adds `max(1, trunc(amount))`.
- Remaining durability is `max(0, min(max, max - damage))`.
- A tool is **broken** when remaining `<= 0` (equivalently `damage >= max`) or its
  `count <= 0`.
- Repair reduces `damage` by `max(1, trunc(amount))`, clamped at `0`; it never
  increases beyond pristine and never alters `count` or other components.
- Functions are pure: they return a new `ItemStack` and never mutate the input.

## API and data model

```ts
export interface DamageResult { stack: ItemStack; broke: boolean; }

export function getRemainingDurability(maxDurability: number, stack: ItemStack | undefined): number;
export function isBroken(maxDurability: number, stack: ItemStack | undefined): boolean;
export function applyDamage(maxDurability: number, stack: ItemStack, amount: number): DamageResult;
export function repair(maxDurability: number, stack: ItemStack, amount: number): ItemStack;
```

`maxDurability` is passed explicitly (a tool's `ItemTypeDefinition.maxDurability`)
rather than the whole definition, because `Inventory.damageSelectedItem` already
receives it as a parameter (and tests pass artificial values to exercise break
logic). This keeps the rule free of registry coupling.

`ItemStack` = `{ id: number; count: number; components?: StackComponentMap }`
(exported from `Inventory.ts`). `DAMAGE_COMPONENT` and `emptyStackComponents`
come from `StackDataComponents.ts`. The pure helpers build new component maps via
`(stack.components ?? emptyStackComponents()).with(DAMAGE_COMPONENT, { damage })`,
reusing the existing map when present so unrelated components survive.

## Control/data flow

- **Break path (unchanged caller)**: `PlayerInteraction` → `selector.damageSelectedItem`
  → `Inventory.damageSelectedItem(amount, max)` → `applyDamage(max, stack, amount)` →
  assign `slots[selected] = result.stack`, return `result.broke` (drives
  `onToolBreak`).
- **Repair path (new)**: caller (future anvil/grindstone, or `repairSelectedItem`)
  → `repair(max, stack, amount)` → assign `slots[selected] = repaired`.

## Detailed behavior

- `applyDamage` short-circuits (`{ stack, broke: false }`) when `maxDurability <= 0`
  or the stack is missing/empty — non-tools and empty slots are never "broken".
- On depletion it returns `{ ...stack, count: 0, components: undefined }` with
  `broke: true`, exactly matching the prior inline zeroing (so existing durability
  snapshot/restore and tool-break tests stay green).
- `repair` short-circuits for non-tools/empty/pristine stacks (no-op, same object
  returned) and clamps reduced damage at `0` otherwise.

## Failure modes

- Invalid `amount` (negative/NaN) is neutralized by `Math.max(1, Math.trunc(amount))`
  so a bad caller still applies at least 1 wear (matches current `Math.max(1, ...)`).
- `DAMAGE_COMPONENT` value is validated by `StackComponentMap.with` (non-negative
  integer); `repair`/`applyDamage` only ever write `>= 0` integers, so no validation
  throw is reachable from correct callers.

## Compatibility/migration

- No persisted schema change. `Inventory.damageSelectedItem(amount, maxDurability)`
  keeps its signature and return contract; existing `Inventory.test.ts` durability
  cases remain authoritative.
- `repairSelectedItem` is a new optional method; no existing caller is required to
  use it.

## Performance/resource constraints

- `applyDamage`/`repair` allocate one small `StackComponentMap` per call (only on
  actual wear/repair, i.e. per break/repair, not per frame). `getRemainingDurability`
  / `isBroken` are O(1) component reads. No per-frame allocation.

## Testing seams

- Pure functions are directly unit-testable with hand-built `ItemStack` + component
  maps, no `Inventory` or DOM.
- `Inventory.test.ts` already pins `damageSelectedItem` behavior; add a
  `repairSelectedItem` case.
- `PlayerInteraction.test.ts` already exercises the break-damage hook end-to-end.

## Observability/debugging

- All durability math centralizes in `DurabilityRules`, enabling targeted tests and
  trivial logging of remaining/broken state.

## Affected files/symbols

- NEW `src/inventory/DurabilityRules.ts`.
- EDIT `src/inventory/Inventory.ts`: `damageSelectedItem` delegation + new
  `repairSelectedItem`.
- Tests: NEW `tests/unit/DurabilityRules.test.ts`; EDIT `tests/unit/Inventory.test.ts`.

## Rejected alternatives

- **Mutation-in-place rule object**: rejected — purity keeps the module reusable by
  anvil/grindstone without side-effect surprises and matches the immutable
  `StackComponentMap` design.
- **Bake repair into a crafting recipe now**: rejected — recipe matching over NBT/
  components is anvil/grindstone scope (2202/2203); 115 delivers the primitive rule.

## Downstream dependencies

- Change 119 (enchantments) will modulate the `amount` passed to `applyDamage`.
- Changes 948/949/2202/2203 (anvil/grindstone/mending) will consume `repair` and a
  future `combine`.
