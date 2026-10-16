# Proposal: 166-hopper-transfer

## Problem
154-165 built redstone signal production, consumption, and piston movement, but nothing in this
codebase can move an *item* between containers. Vanilla's hopper pulls one item at a time from the
container above it and pushes one item at a time into the container it faces, on a fixed cooldown,
and stops entirely while powered. Without it, no automated item pipeline (furnace smelting lines,
storage sorting, etc.) is possible. This change adds the transfer logic and the hopper block itself.

## Goals
- `HOPPER_TRANSFER_COOLDOWN_TICKS = 8` (vanilla's transfer cadence); `scheduleHopperTransfer`/
  `dueHopperTransfers` — this section's next 047 `ScheduledTickQueue` consumer.
- `transferOneItem(source, destination)`: moves exactly one item unit from the first non-empty
  `source` slot (106's `MenuSlot` shape, reused directly rather than a parallel type) into the
  first compatible `destination` slot — merging into a same-item slot with room first, else the
  first empty slot — returning new immutable slot arrays and whether anything moved. Returns
  `moved: false` and unchanged (but still freshly-copied) arrays when `source` has nothing to give
  or `destination` has nowhere to receive it.
- `hopperShouldTransfer(powered)`: the redstone lockout — a hopper attempts a transfer only while
  **un**powered, the *opposite* of 162's consumer rule and the second inverting component in this
  section after 158's torch (there, inversion flips a signal; here, it flips a lockout).
- `HopperFacing = 'down' | 'north' | 'south' | 'east' | 'west'` (five-way — a hopper's intake is
  always fixed straight up regardless of facing, so `'up'` is never a legal facing value);
  `hopperIntakePosition`/`hopperOutputPosition` derived from 154's `offsetInDirection` (a
  `HopperFacing` is a literal subset of 154's `Direction`, so no new offset table is needed).
- `hopperStateProperties(facing, enabled)`.
- A `hopper` block with `facing`/`enabled` state (10 states — `enabled` mirrors vanilla's own
  blockstate name for "currently unlocked", matching `hopperShouldTransfer`'s result) and a placing
  item.

## Non-goals
- **No item-entity scooping** (a hopper picking up a dropped item sitting on top of it). That is a
  distinct interaction with 111's item-entity model, not container-to-container transfer; flagged
  explicitly rather than silently dropped.
- **No real container-transaction integration** (reading/writing an actual chest/furnace block
  entity's stored inventory). `transferOneItem` operates on plain `MenuSlot[]` arrays a future
  wiring change supplies — the same "caller samples, this module computes" discipline 157-165 all
  use.
- **No `Game`/`World` wiring, no hopper-to-hopper chain simulation, no comparator container-signal
  bridge** (160's `sideInput` remains a plain number) — the same integration surface 154-165
  deferred.

## Preconditions
- Change 165 (`slime-honey-move-groups`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/inventory/MenuTransaction.ts` (106, `MenuSlot`), `src/simulation/RedstoneSignal.ts` (154,
  `Direction`/`offsetInDirection`), `src/simulation/ScheduledTickQueue.ts` (047),
  `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `HOPPER_SCHEMA` (`facing` 5-way, `enabled` boolean);
   `BlockId.Hopper = 50`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Hopper = 50` placing it.
3. `src/simulation/HopperTransfer.ts` (NEW): `HopperFacing`, `transferOneItem`,
   `hopperShouldTransfer`, `hopperIntakePosition`/`hopperOutputPosition`, the 047 scheduling
   bridge, and `hopperStateProperties`.

## Compatibility and migration
- One additive block id and one additive item id plus one new simulation file. Requires the
  documented four block/item characterization-test updates. No `Game.ts` edit; no schema/
  save-format change.

## Risks
- **`transferOneItem`'s merge-then-empty destination search order is easy to get backwards** (empty
  slots preferred over merging would waste stack capacity, unlike vanilla). Mitigation: a dedicated
  test supplies both a mergeable slot and an empty slot and asserts the merge is chosen.
- **The lockout inversion (`!powered`, not `powered`) is easy to copy-paste backwards** from every
  other component in this section. Mitigation: `hopperShouldTransfer` is tested at both boundary
  values, and the design doc explicitly calls out the inversion relative to 162.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: block/item registration + exact 10-state enumeration; `transferOneItem`'s
  empty-source no-op, full-destination no-op, merge-preferred-over-empty, and empty-slot-fallback
  cases, plus the moved/unmoved return flag; `hopperShouldTransfer`'s inverted powered/unpowered
  cases; intake/output position derivation for all five facings; scheduling (not-due/fires/
  same-tick-deterministic); state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
