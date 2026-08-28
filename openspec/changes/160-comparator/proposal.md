# Proposal: 160-comparator

## Problem
157-159 built only components that output either 0 or full signal (15). The comparator is
vanilla's first **analog** component: it reads a front input and an optional side input and
produces a signal strength anywhere in `[0, 15]`, in one of two selectable modes. Without it, no
circuit in this codebase can do arithmetic on signal strength at all.

## Goals
- A `redstone_comparator` block with `facing` (4-way, behavioral like 159's repeater), `mode`
  (`compare` | `subtract`), and `powered` (boolean, whether it currently outputs > 0) state — 4 × 2
  × 2 = 16 states — and a placing item.
- `cycleComparatorMode(mode)`: `compare` ↔ `subtract`, vanilla's right-click toggle.
- `resolveComparatorOutput(mode, frontInput, sideInput)`: the two-mode signal-math rule —
  `compare` mode outputs `frontInput` unchanged when `frontInput >= sideInput`, else `0`;
  `subtract` mode always outputs `max(0, frontInput - sideInput)`. Both inputs and the output are
  clamped through 154's `clampSignal`.
- `comparatorIsPowered(output)`: `output > 0` — the boolean projected into the `powered` state.
- `scheduleComparatorUpdate`/`dueComparatorUpdates`: the same 047 bridge 157-159 established (this
  change's fourth consumer), using a fixed 2-tick delay matching vanilla's comparator update speed
  (158's `TORCH_UPDATE_DELAY_TICKS`).
- `comparatorStateProperties`.

## Non-goals
- **No container signal reads (a chest/furnace/hopper's fullness as 0-15).** That needs a bridge
  from 106's container-menu model (or a future block-entity inventory) to a signal value, and no
  titled change between here and 166 (hopper transfer) builds that bridge. `resolveComparatorOutput`
  takes a plain `sideInput` number, so a future change can supply a container-derived value without
  touching this module at all — flagged, not silently dropped, exactly as 146 flagged player→mob
  combat and 151 flagged the trading UI.
- **No `Game`/`World` wiring, no `BlockBehavior`, no interaction (right-click to cycle mode)** — the
  same integration surface 156-159 deferred.
- **No observer** — 161.
- **No comparator-as-`RedstonePowerSource` adapter** — a future wiring change reports the resolved
  output through 154's interface, as it will for every prior component.

## Preconditions
- Change 159 (`repeater`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `clampSignal`), `src/simulation/ScheduledTickQueue.ts`
  (047), `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts`,
  `src/world/BlockPropertySchema.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `COMPARATOR_SCHEMA` (`facing` 4-way, `mode` named
   `compare`/`subtract`, `powered` boolean); `BlockId.RedstoneComparator = 43`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.RedstoneComparator = 43` placing it.
3. `src/simulation/RedstoneComparator.ts` (NEW): mode cycling, the output rule, the powered
   projection, the 047 scheduling bridge, and the state projection.

## Compatibility and migration
- One additive block id and one additive item id (none renumbered) plus one new simulation file.
  Requires the documented four block/item characterization-test updates (155/157/158/159's
  precedent). No `Game.ts` edit; no schema/save-format change.

## Risks
- **Compare mode's `>=` boundary is easy to get backwards.** Mitigation: a dedicated test asserts
  the exact boundary (`frontInput === sideInput` still passes through) as well as one below it.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registration + exact 16-state enumeration + item cross-reference; mode cycling;
  compare mode at/above/below the side threshold, including the exact-equal boundary; subtract mode
  including the floor at 0; both modes clamp out-of-domain inputs; `comparatorIsPowered` threshold;
  scheduling + due-ordering through 047; and state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
