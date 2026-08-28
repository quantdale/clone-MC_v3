# Proposal: 157-redstone-input-components

## Problem
154 defined the power model, 155 the wire, 156 the propagation — but nothing in the game *emits*
redstone power. Every circuit needs a source, and the three foundational ones (lever, button,
pressure plate) differ in exactly one interesting way: how their powered state *ends*. A lever
latches until toggled; a button releases itself after a fixed delay; a plate follows whatever is
standing on it. That timing distinction is what this change models.

## Goals
- Three registered blocks — `lever`, `stone_button`, `pressure_plate` — each carrying a boolean
  `powered` state (2 states each), plus three items that place them.
- A `RedstoneComponentKind` union and `componentSignalStrength(kind, powered)`: the power a
  component emits (15 when powered, 0 when not) — the value a future `RedstonePowerSource` adapter
  reports so 155/156 carry it.
- `toggleLever(powered)`: the latch.
- `pressButton(currentTick)` → `{ powered: true, releaseTick }`, and `BUTTON_ACTIVE_TICKS` (20, one
  second) — the self-releasing source.
- `plateePowered(entityCount)` → whether a plate reads powered from what stands on it, plus
  `PLATE_RELEASE_DELAY_TICKS` (10) and `plateReleaseTick(currentTick)` for its trailing delay.
- `scheduleComponentRelease(queue, x, y, z, kind, currentTick)` and `dueComponentReleases(queue,
  nowTick)`: the timing bridge onto 047's existing `ScheduledTickQueue`, whose
  `(tickTime, seq)` ordering gives deterministic release even when many components expire on the
  same tick.
- `componentStateProperties(powered)`: the block-state projection.

## Non-goals
- **No facing/attachment state.** A real lever/button/plate carries a `facing` + `face`
  (floor/wall/ceiling) in vanilla, which multiplies the state space ~15× and exists to drive the
  *model*, not the signal. Placement orientation and models are 059/060's scope; this change keeps
  each component at 2 states (`powered` true/false) and documents the omission so a later model
  change adds it deliberately.
- **No `Game`/`World` wiring, no `BlockBehavior`, no input handling.** Right-clicking a lever or
  stepping on a plate needs `PlayerInteraction` and an entity-collision hook plus a
  `RedstonePowerSource` adapter over the real `World` — the same integration surface 156 deferred.
  This change delivers the component model and its timing; a wiring change consumes it alongside
  156's propagator.
- **No weighted pressure plates, no observer/target/daylight sensor** — 161 and later content
  changes.
- **No entity-detection logic.** `platePowered` takes a caller-supplied count; deciding *which*
  entities trigger a plate needs the entity/collision layer and is out of scope.

## Preconditions
- Change 156 (`redstone-update-order`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `clampSignal`/`MAX_SIGNAL_STRENGTH`),
  `src/simulation/ScheduledTickQueue.ts` (047), `src/world/BlockRegistry.ts` +
  `src/inventory/ItemRegistry.ts` (registration), `src/world/BlockPropertySchema.ts` (006).

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `POWERED_SCHEMA` (shared boolean `powered`);
   `BlockId.Lever = 38`, `BlockId.StoneButton = 39`, `BlockId.PressurePlate = 40` with definitions.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Lever = 38`, `ItemId.StoneButton = 39`,
   `ItemId.PressurePlate = 40`, each placing its block.
3. `src/simulation/RedstoneInputComponents.ts` (NEW): the kind union, signal/toggle/press/plate
   functions, the 047 scheduling bridge, and the state projection.

## Compatibility and migration
- Three additive block ids and three additive item ids (none renumbered) plus one new simulation
  file. No `Game.ts` edit; no schema/save-format change; no migration. Requires the documented
  `BlockItemSeparation.test.ts` / `BlockRegistry.test.ts` / `BlockPropertySchema.test.ts` /
  `BlockStateRegistry.test.ts` updates — the same maintenance 155 performed.

## Risks
- **047's `ScheduledTickQueue` is now used by both this change and (later) 159's repeater delay.**
  Mitigation: this change composes it without modification and schedules by absolute due-tick, so
  independent users cannot interfere; documented in design.md.

## Rollback strategy
One new file plus six additive registry entries and their test-table updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registration + 2-state enumeration for all three blocks and their item
  cross-references; `componentSignalStrength` powered/unpowered for each kind;
  `toggleLever` latching both ways; `pressButton` producing the right release tick;
  `platePowered` thresholds; scheduling + due-release ordering through 047 (including two
  components due on the same tick releasing in deterministic order, and a not-yet-due component
  staying queued); and `componentStateProperties`.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
