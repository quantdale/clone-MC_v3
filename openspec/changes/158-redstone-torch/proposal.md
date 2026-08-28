# Proposal: 158-redstone-torch

## Problem
154-157 built the power model, the wire, the propagation, and three sources — but every source so
far is *non-inverting*: it emits when activated. Logic gates need the opposite. A redstone torch is
powered exactly when its attachment block is **not** powered, and that single inversion is what
makes NOT/NOR/AND/latches possible. It also needs burnout: a torch toggled too rapidly (a feedback
loop driving itself) must temporarily switch off rather than oscillate forever.

## Goals
- A `redstone_torch` block with a `lit` boolean state (2 states) and a placing item.
- `torchShouldBeLit(attachmentPowered)`: the inversion — lit iff the attachment block is unpowered.
- `torchSignalStrength(lit)`: full signal when lit, none otherwise.
- `TORCH_UPDATE_DELAY_TICKS` (2, vanilla's 1-redstone-tick delay) and
  `scheduleTorchUpdate`/`dueTorchUpdates` on 047's `ScheduledTickQueue` — the same timing primitive
  157 established.
- A `TorchBurnoutTracker`: records each toggle with its tick, and reports burnout when a torch
  toggles more than `BURNOUT_TOGGLE_LIMIT` (8) times within `BURNOUT_WINDOW_TICKS` (60). A
  burnt-out torch stays unlit until `BURNOUT_RECOVERY_TICKS` (60) have passed with no further
  toggles.
- `torchStateProperties(lit)`: the block-state projection.

## Non-goals
- **No facing/attachment-direction state** — 157's identical, already-documented omission (models
  are 059/060's scope). `torchShouldBeLit` takes a caller-supplied "is my attachment powered"
  boolean, so which block a torch is attached to is the caller's concern.
- **No `Game`/`World` wiring, no `BlockBehavior`** — the same integration surface 156/157 deferred.
- **No repeater/comparator/observer** — 159-161.
- **No torch-as-`RedstonePowerSource` adapter**: a future wiring change reports
  `torchSignalStrength` through 154's interface, exactly as it will for 157's components.

## Preconditions
- Change 157 (`redstone-input-components`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154), `src/simulation/ScheduledTickQueue.ts` (047),
  `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts`, `src/world/BlockPropertySchema.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `LIT_SCHEMA` (boolean `lit`); `BlockId.RedstoneTorch = 41`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.RedstoneTorch = 41` placing it.
3. `src/simulation/RedstoneTorch.ts` (NEW): the inversion, signal, delay scheduling, and
   `TorchBurnoutTracker`.

## Compatibility and migration
- One additive block id and one additive item id (none renumbered) plus one new simulation file.
  Requires the documented four block/item characterization-test updates (155/157's precedent). No
  `Game.ts` edit; no schema/save-format change.

## Risks
- **Burnout is a heuristic with tunable constants.** Mitigation: the thresholds are exported
  constants, the tracker is pure and fully unit-tested at its boundaries, and the tests assert
  behaviour *relative to* the constants rather than hard-coded numbers, so retuning cannot silently
  break them.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registration + 2-state enumeration + item cross-reference; the inversion in both
  directions; signal strength lit/unlit; delay scheduling and due-ordering through 047; burnout
  triggering exactly past the toggle limit, *not* triggering for the same toggles spread beyond the
  window, staying burnt out through the recovery period, and recovering after it; and the state
  projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
