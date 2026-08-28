# Proposal: 156-redstone-update-order

## Problem
155 registered a wire block and defined the *local* rule computing one wire's power, but nothing
iterates that rule: a placed wire is inert, and a signal cannot travel. Making it travel requires
deterministic ordering (the same circuit must settle identically every run) and loop protection (a
ring of wire must not spin forever) — the two properties this change's title names, and the reason
the sequence separates them from 155's local rule.

## Goals
- A `WirePowerStore` interface (`getPower`/`setPower`) — the caller-supplied mutable store of each
  wire's current power, injected exactly as 154/155 inject their world surfaces.
- A `RedstonePropagator` composing 049's existing `NeighborUpdateQueue` (FIFO, deduplicated,
  budgeted, iterative — cascades never recurse) with 155's `computeWirePower`.
- `markDirty(x, y, z)`: enqueue a position for recomputation.
- `propagate()`: drain the queue to a fixed point — for each dirty wire, recompute its power; when
  the value **changes**, write it and mark its connected wire neighbours dirty. Returns a
  `PropagationResult` reporting positions visited, powers changed, and whether the pass hit its
  bound.
- `maxUpdates` bound (default 4096) plus 049's own per-drain budget, so a pathological or
  adversarial circuit degrades to "stopped early, reported truthfully" rather than hanging.
- `settle()`: repeatedly `propagate()` until the queue empties or a bounded iteration cap trips —
  the convenience entry point a caller uses after a single block edit.

## Non-goals
- **No `Game`/`World` wiring, no `BlockBehavior` attachment.** Making live wire carry a signal in a
  real session needs a `WirePowerStore` backed by 125's block-state overlay plus a behavior
  reacting to block edits — a `World`-coupled integration whose own testing surface is materially
  larger than this propagation core. It is deliberately deferred and flagged rather than bundled,
  matching how 145 waited to wire up 129-139 rather than 129 doing it. This change delivers the
  algorithm; a wiring change consumes it.
- **No components** (levers, torches, repeaters, comparators, observers) — 157-161. Power still
  originates only from whatever a caller's `RedstonePowerSource` reports.
- **No scheduled/delayed ticks.** 047's `ScheduledTickQueue` models *delayed* block ticks
  (repeater delay, 159's need); wire propagation in vanilla is immediate within a tick, so 156
  composes 049's immediate-update queue instead. Documented so the reader knows 047 was considered
  and correctly not used here.
- **No cross-chunk/unloaded-region guarding** — the injected store/world decide what a position out
  of range reports; this module does not know about chunks.

## Preconditions
- Change 155 (`redstone-wire-connectivity`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneWire.ts` (155, `computeWirePower`/`resolveWireConnections`/
  `HORIZONTAL_DIRECTIONS`/`WireWorld`), `src/simulation/RedstoneSignal.ts` (154, `clampSignal`/
  `offsetInDirection`/`RedstonePowerSource`), `src/simulation/NeighborUpdateQueue.ts` (049).

## Proposed change
1. `src/simulation/RedstonePropagation.ts` (NEW): `WirePowerStore`, `PropagationResult`,
   `RedstonePropagatorOptions`, `RedstonePropagator` (`markDirty`, `markNeighborsDirty`,
   `propagate`, `settle`, `pendingCount`).

## Compatibility and migration
- One new, additive file. No existing module edited; no `Game.ts` edit; no schema/save-format
  change; no migration.

## Risks
- **A large circuit can exceed `maxUpdates` in one pass.** Mitigation: `propagate` reports
  `hitLimit: true` and leaves the remainder queued, so a caller can continue next tick rather than
  silently losing updates; `settle` surfaces the same signal. Tested explicitly.
- **Determinism depends on 049's FIFO order and 155's fixed direction order.** Mitigation: a test
  runs the same circuit from two independently-constructed propagators and asserts identical final
  power maps, so a future reordering that breaks determinism fails immediately.

## Rollback strategy
One additive file; reverting fully removes the feature with no other impact.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: a straight wire run attenuating 15→14→13… from a source; a signal reaching zero
  and stopping; removing a source draining the line back to zero; a **wire ring** terminating (the
  loop-protection property); determinism across two independent runs; `maxUpdates` reporting
  `hitLimit` with work left queued; no writes when nothing changes (idempotent re-settle); and
  `markNeighborsDirty` enqueueing the expected set.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
