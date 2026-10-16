# Proposal: 167-dropper

## Problem
166 added the first item-moving module (the hopper) but only the *container-to-container* half of
the story: a hopper facing a non-container simply does nothing. Vanilla's dropper is the sibling
behavior — same five-way facing + `enabled` blockstate and the same inverse-of-162 `!powered`
lockout, but when it faces no container it *ejects the item into the world* as an item entity rather
than stalling. Without it, the "item-moving redstone consumer" family is only half-built, and 166's
`transferOneItem`/`MenuSlot` model has no first real consumer that writes back into a container *and*
no first place that models a world drop.

## Goals
- `DROPPER_EJECT_COOLDOWN_TICKS = 8` (mirrors 166's cadence); `scheduleDropperEject`/`dueDropperEjects`
  — this section's next 047 `ScheduledTickQueue` consumer.
- `ejectFromDropper(source, destinationContainer, dropPosition)`: the ejection core.
  - When `destinationContainer` (a `MenuSlot[]`) is supplied, push one item into it by reusing 166's
    `transferOneItem`; a full container yields `kind: 'none'` (a dropper does **not** spill into the
    world when facing a container it cannot fill).
  - When `destinationContainer` is `null` (facing air / no container), produce a `DroppedItem`
    descriptor (`item`, `count: 1`, `position`) and decrement `source` by exactly one.
  - `kind: 'none'` (source untouched) when `source` has nothing to eject.
- `dropperShouldTransfer(powered)`: the same inverse-of-162 lockout as 166 — `!powered`.
- `dropperOutputPosition(x, y, z, facing)`: `offsetInDirection(x, y, z, facing)` for the five
  `DropperFacing` values (no `'up'`).
- `dropperStateProperties(facing, enabled)`.
- A `dropper` block with `facing`/`enabled` state (10 states, default `{ facing: 'down', enabled:
  true }`) and a placing item.

## Non-goals
- **No real world-item-entity spawn.** The drop is modeled as a returned `DroppedItem` descriptor
  (position + item + count). Turning that into a live 111-style entity is a future wiring change
  (the decision logic lives here; the spawn does not) — flagged explicitly, not silently dropped.
- **No real container-transaction integration** (reading/writing an actual chest/dropper block
  entity's stored inventory). `ejectFromDropper` operates on plain `MenuSlot[]` arrays a future
  wiring change supplies.
- **No `Game`/`World` wiring, no dispenser (168) behavior, no comparator container-signal bridge**
  (160's `sideInput` remains a plain number) — the same integration surface 154-166 deferred.

## Preconditions
- Change 166 (`hopper-transfer`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/HopperTransfer.ts` (166, `transferOneItem`, `MenuSlot`), `src/simulation/
  RedstoneSignal.ts` (154, `Direction`/`offsetInDirection`), `src/simulation/ScheduledTickQueue.ts`
  (047), `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `DROPPER_SCHEMA` (`facing` 5-way, `enabled` boolean) — same
   shape as 166's `HOPPER_SCHEMA`; `BlockId.Dropper = 51`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Dropper = 51` placing it.
3. `src/simulation/DropperEject.ts` (NEW): `DropperFacing`, `DroppedItem`, `DropperEjectResult`,
   `ejectFromDropper`, `dropperShouldTransfer`, `dropperOutputPosition`, the 047 scheduling bridge,
   and `dropperStateProperties`.

## Compatibility and migration
- One additive block id and one additive item id plus one new simulation file (reusing 166's
  `transferOneItem`). Requires the documented three block/item characterization-test updates. No
  `Game.ts` edit; no schema/save-format change.

## Risks
- **Reusing `transferOneItem` for the container push means a full container silently yields
  `moved: false`** — easy to accidentally turn into a world spill. Mitigation: the `none` (full
  container) case is a dedicated test asserting the source is untouched and `kind` is `'none'`, never
  `'drop'`.
- **The `drop` vs `container` branch is easy to invert** (dropping into a container, or pushing when
  facing air). Mitigation: two dedicated tests — `null` destination → `drop`, array destination →
  `container` — pin both directions.
- **The `!powered` lockout is easy to copy-paste backwards** from every other component in this
  section. Mitigation: `dropperShouldTransfer` is tested at both boundary values, and the design doc
  explicitly calls out the inversion relative to 162 (and 166).

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: block/item registration + exact 10-state enumeration; `ejectFromDropper`'s
  empty-source `none`, container push (merge + empty-slot fallback), full-container `none`
  (no-spill), and world-drop (`drop`) cases; `dropperShouldTransfer`'s inverted powered/unpowered
  cases; output position for all five facings; scheduling (not-due/fires/deterministic); state
  projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
