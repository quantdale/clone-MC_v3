# Proposal: 161-observer

## Problem
157-160 all react to power flowing *into* themselves. The observer is vanilla's first component
that reacts to a *neighbour's block state changing* — it watches the block it faces and, on any
change, emits a short redstone pulse out its back. Without it, no circuit in this codebase can
trigger off a non-redstone event (a crop growing, a comparator's output changing, a piston
extending) at all. It is also the last of the 157-161 logic-component trio, closing out that arc.

## Goals
- An `observer` block with `facing` (6-way — north/south/east/west/up/down, the first 6-way facing
  schema in this series, since an observer can just as validly watch the block above or below it)
  and `powered` (boolean) state — 6 × 2 = 12 states — and a placing item.
- `observedNeighborPosition`/`emissionNeighborPosition`: the watched neighbour (one block in the
  facing direction) and the pulse-emission neighbour (one block in the opposite direction), derived
  directly from 154's `offsetInDirection`/`OPPOSITE_DIRECTION` rather than a parallel direction
  vocabulary.
- A two-phase scheduled pulse: `scheduleObserverPulseStart`/`dueObserverPulseStarts` fire
  `OBSERVER_PULSE_START_DELAY_TICKS` after a detected change; `scheduleObserverPulseEnd`/
  `dueObserverPulseEnds` fire `OBSERVER_PULSE_DURATION_TICKS` after the pulse turns on. Each phase
  rides its own 047 `ScheduledTickQueue` instance (this change's fifth consumer of 047).
- `observerSignalStrength(powered)`: full signal while the pulse is on, none otherwise — mirrors
  158's `torchSignalStrength` exactly.
- `observerStateProperties`.

## Non-goals
- **No change-detection itself** ("did the watched neighbour's state actually change since last
  sample"). That is the caller's job, matching 159's identical deferral of input-change tracking to
  a future wiring change that already owns the real `World` and would otherwise become a second
  source of truth for the same fact.
- **No re-trigger suppression while a pulse is in flight.** Re-scheduling `pulseStart` (or
  `pulseEnd`) while one is already pending simply reschedules it later — 047's own dedup-by-position
  behavior — rather than a bespoke rule added here.
- **No `Game`/`World` wiring, no `BlockBehavior`, no interaction** — the same integration surface
  156-160 deferred.
- **No observer-as-`RedstonePowerSource` adapter** — a future wiring change reports the pulse
  through 154's interface, as it will for every prior component.
- **No BUD ("block update detector") cascade beyond the single emitted pulse** — 154 already
  disclaims quasi-connectivity/BUD emulation; this change does not revisit that.

## Preconditions
- Change 160 (`comparator`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `Direction`/`OPPOSITE_DIRECTION`/`offsetInDirection`/
  signal constants), `src/simulation/ScheduledTickQueue.ts` (047), `src/world/BlockRegistry.ts` +
  `src/inventory/ItemRegistry.ts`, `src/world/BlockPropertySchema.ts`.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `OBSERVER_SCHEMA` (`facing` 6-way named, `powered`
   boolean); `BlockId.Observer = 44`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Observer = 44` placing it.
3. `src/simulation/RedstoneObserver.ts` (NEW): watched/emission neighbour positions, the two-phase
   pulse scheduling bridge, the signal-strength projection, and the state projection.

## Compatibility and migration
- One additive block id and one additive item id (none renumbered) plus one new simulation file.
  Requires the documented four block/item characterization-test updates (155/157/158/159/160's
  precedent). No `Game.ts` edit; no schema/save-format change.

## Risks
- **Two independent `ScheduledTickQueue` instances for one block is an unusual shape** compared to
  157-160's single queue. Mitigation: documented explicitly in design.md — 047's queue holds at most
  one pending entry per position, so a single shared queue cannot represent "pending turn-on" and
  "pending turn-off" for the same position at once; two queues avoid that collision by construction
  rather than by an ad hoc phase tag.

## Rollback strategy
One new file plus two additive registry entries and their test updates; reverting removes the
feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registration + exact 12-state enumeration + item cross-reference; watched/
  emission neighbour position derivation for all six facings; pulse-start scheduling (not-due/fires/
  same-tick-deterministic); pulse-end scheduling (not-due/fires/same-tick-deterministic);
  `observerSignalStrength`; state projection.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
