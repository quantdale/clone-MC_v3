# Proposal: 168-dispenser

## Problem
166 added hopper transfer and 167 added dropper ejection — both move an *item* between containers or
drop it. But a **dispenser** is the third, behaviorally-distinct member of this family: for ordinary
items it behaves exactly like a dropper (push into a faced container, or drop into the world), but for
a special class of items it performs an *action* instead — firing an arrow, throwing a snowball,
hatching an egg — rather than emitting the raw item. The distinguishing feature is a **data-driven
item→action table**, which neither 166 nor 167 needed. Without it, the "item-moving redstone
consumer" family is incomplete and the redstone/automation section cannot close.

## Goals
- `DISPENSER_EJECT_COOLDOWN_TICKS = 8` (mirrors 166/167's cadence); `scheduleDispenserEject`/
  `dueDispenserEjects` — this section's next 047 `ScheduledTickQueue` consumer.
- `DISPENSER_ITEM_BEHAVIORS`: a **data-driven** table mapping item resource id → `DispenserItemBehavior`
  (kind `shoot_projectile` | `spawn_entity` | `place_block`, with the projectile/entity/block payload).
  Adding a new dispenser action is a table row, not a code branch. Seeded with the initial vanilla set
  (arrow, snowball, egg, fire_charge, fireball, experience_bottle, flint_and_steel).
- `getDispenserBehavior(item)`: lookup returning the behavior or `null` for a plain (dropper-style) item.
- `dispenseFromDispenser(source, destinationContainer, dropPosition)`:
  - a **special** item → `kind: 'behavior'` (consume one, carry the behavior descriptor); the facing
    direction / container are irrelevant to the action itself (a future wiring change fires/spawns);
  - a **plain** item → delegate to 167's `ejectFromDropper` (`container` / `drop` / `none`);
  - an empty `source` → `kind: 'none'`.
- `dispenserShouldTransfer(powered)`: the same inverse-of-162 `!powered` lockout as 166/167.
- `dispenserOutputPosition(x, y, z, facing)`: `offsetInDirection(x, y, z, facing)` for the five
  `DispenserFacing` values.
- `dispenserStateProperties(facing, enabled)`.
- A `dispenser` block with `facing`/`enabled` state (10 states, default `{ facing: 'down', enabled:
  true }`) and a placing item.

## Non-goals
- **No real projectile/entity/block spawn.** The behavior is modeled as a returned `DispenserAction`
  descriptor (the `behavior` payload); turning `shoot_projectile` into a live 142-style projectile or
  `spawn_entity` into a live 130-style entity is a future wiring change. Flagged explicitly.
- **No real container-transaction integration** (reading/writing an actual block entity's stored
  inventory). `dispenseFromDispenser` operates on plain `MenuSlot[]` arrays a future wiring change
  supplies; for plain items it reuses 167's `ejectFromDropper` unchanged.
- **No `Game`/`World` wiring, no comparator container-signal bridge** (160's `sideInput` remains a
  plain number) — the same integration surface 154-167 deferred.

## Preconditions
- Change 167 (`dropper`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/DropperEject.ts` (167, `ejectFromDropper`, `DroppedItem`), `src/simulation/
  RedstoneSignal.ts` (154, `Direction`/`offsetInDirection`), `src/simulation/ScheduledTickQueue.ts`
  (047), `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `DISPENSER_SCHEMA` (`facing` 5-way, `enabled` boolean) — same
   shape as 166/167; `BlockId.Dispenser = 52`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Dispenser = 52` placing it.
3. `src/simulation/DispenserBehavior.ts` (NEW): `DispenserFacing`, `DispenserItemBehavior`,
   `DISPENSER_ITEM_BEHAVIORS`, `getDispenserBehavior`, `DispenserAction`, `dispenseFromDispenser`,
   `dispenserShouldTransfer`, `dispenserOutputPosition`, the 047 scheduling bridge, and
   `dispenserStateProperties`.

## Compatibility and migration
- One additive block id and one additive item id plus one new simulation file (reusing 167's
  `ejectFromDropper`). Requires the documented three block/item characterization-test updates. No
  `Game.ts` edit; no schema/save-format change.

## Risks
- **The plain-vs-special split is easy to get backwards** (treating a special item as a drop, or a
  plain item as a behavior). Mitigation: dedicated tests pin both directions — `minecraft:arrow` →
  `kind: 'behavior'`, `stone` → `kind: 'container'`/`'drop'`.
- **The behavior table must be the single source of truth** (not a hard-coded `if (item === 'arrow')`
  branch in `dispenseFromDispenser`). Mitigation: `dispenseFromDispenser` only ever calls
  `getDispenserBehavior`; the table is the only place items are mapped, and a test asserts the initial
  set is present.
- **The `!powered` lockout is easy to copy-paste backwards** from every other component in this
  section. Mitigation: `dispenserShouldTransfer` is tested at both boundary values.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: block/item registration + exact 10-state enumeration; behavior-table lookup
  (known special item / plain-item fallback); `dispenseFromDispenser`'s empty-source `none`, special-
  item `behavior` (consume one), plain-item container push (merge), plain-item world `drop`, and full-
  container `none` (no spill); `dispenserShouldTransfer` inversion; output position for all five
  facings; scheduling (not-due/fires/deterministic); state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
