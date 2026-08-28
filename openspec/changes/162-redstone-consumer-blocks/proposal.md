# Proposal: 162-redstone-consumer-blocks

## Problem
154-161 built an entire producer side of redstone (wire, input components, torch, repeater,
comparator, observer) but every one of them only ever *emits* a signal — nothing in this codebase
yet *consumes* one to change its own visible state. Without a consumer, the whole 154-161 arc has
no observable payoff: a circuit could compute a perfect signal and nothing would ever happen
because of it. This change adds the simplest vanilla consumers — lamp, door, trapdoor — closing the
producer-to-consumer loop the "Redstone and automation" section has been building toward.

## Goals
- A `redstone_lamp` block with `lit` (boolean) state (2 states) and a placing item. Turns on
  immediately when powered; turning back off is deferred by `LAMP_OFF_DELAY_TICKS` (vanilla's
  flicker guard) via a dedicated 047 `ScheduledTickQueue` bridge — this section's sixth consumer.
- A `door` block with `open` (boolean) state (2 states) and a placing item. Toggles immediately in
  both directions — no scheduling, unlike the lamp.
- A `trapdoor` block with `open` (boolean) state (2 states) and a placing item. Identical rule and
  timing to the door.
- `src/simulation/RedstoneConsumers.ts`: `lampShouldBeLit`/`doorShouldBeOpen`/
  `trapdoorShouldBeOpen` — each block's own named entry point onto the same shared rule ("active
  exactly when powered"), plus the lamp's off-delay scheduling bridge and the three state
  projections.

## Non-goals
- **No player interaction** (opening/closing a door or trapdoor by hand) — the same integration
  surface 156-161 deferred; these blocks react to redstone power only in this change.
- **No double-tall door geometry, hinge, or half (upper/lower) state.** Vanilla's real door is two
  blocks tall with a hinge side; that is placement/rendering geometry, not redstone-consumer
  behavior, and this change models only the single boolean state that redstone actually drives.
  Flagged explicitly, not silently dropped — a future placement/geometry change (none titled yet)
  would own the two-block shape.
- **No `facing` property on door/trapdoor** — purely visual (which way it swings/faces), the same
  reasoning 157/158 used to omit facing from lever/button/plate/torch.
- **No `Game`/`World` wiring, no `BlockBehavior`** — the same integration surface 154-161 deferred.
- **No consumer-side signal re-emission** — these are pure sinks; unlike every 154-161 component,
  they do not report anything back through 154's `RedstonePowerSource`.

## Preconditions
- Change 161 (`observer`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/ScheduledTickQueue.ts` (047, the lamp's off-delay), `src/world/BlockRegistry.ts` +
  `src/inventory/ItemRegistry.ts`, `src/world/BlockPropertySchema.ts`. No dependency on 154's
  `RedstoneSignal.ts` — these blocks consume a plain `powered: boolean`, not a signal strength, so
  no signal-domain clamping is needed.

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `LAMP_SCHEMA` (`lit` boolean); `OPEN_SCHEMA` (`open`
   boolean, shared by door and trapdoor — the same one-schema-many-blocks pattern 157's
   `POWERED_SCHEMA` established); `BlockId.RedstoneLamp = 45`, `BlockId.Door = 46`,
   `BlockId.Trapdoor = 47`.
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.RedstoneLamp = 45`, `ItemId.Door = 46`,
   `ItemId.Trapdoor = 47`, each placing its block.
3. `src/simulation/RedstoneConsumers.ts` (NEW): the three named predicates, the lamp's
   scheduling bridge, and the three state projections.

## Compatibility and migration
- Three additive block ids and three additive item ids (none renumbered) plus one new simulation
  file. Requires the documented four block/item characterization-test updates (155/157-161's
  precedent). No `Game.ts` edit; no schema/save-format change.

## Risks
- **The lamp's instant-on/delayed-off asymmetry is easy to invert by mistake** (e.g. delaying the
  on-transition instead). Mitigation: `lampShouldBeLit` itself has no delay logic at all — it is the
  same trivial "active when powered" rule as the door/trapdoor; the asymmetry lives entirely in
  which transition the *caller* is expected to schedule (documented explicitly in design.md, and the
  scheduling functions are named `*Off*`, never `*On*`, to make the direction unambiguous).

## Rollback strategy
One new file plus six additive registry entries (three blocks, three items) and their test updates;
reverting removes the feature cleanly.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: registration + exact 2-state enumeration + item cross-reference for all three
  blocks; the shared "active when powered" rule for each named predicate; lamp off-delay scheduling
  (not-due/fires/same-tick-deterministic); all three state projections.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
