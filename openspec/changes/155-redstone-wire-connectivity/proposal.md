# Proposal: 155-redstone-wire-connectivity

## Problem
154 defined the power domain and the direct/indirect power queries, but nothing carries a signal
across distance. Redstone wire is the transport medium every circuit is built from, and it needs
three things that do not exist: a block with a `power` state and per-side connection state, the
rules deciding which neighbours a wire connects to (including stepping up and down a block), and
the local rule computing a wire's own power from its sources and connected neighbours.

## Goals
- A `redstone_wire` block registered in `BlockRegistry` with a `REDSTONE_WIRE_SCHEMA`: integer
  `power` in `[0, 15]` plus four named per-side properties (`north`/`south`/`east`/`west`, each
  `none | side | up`) — 16 × 3⁴ = 1296 enumerated states, well under 007's
  `MAX_STATES_PER_BLOCK` (65536).
- A `redstone` item that places the wire and is dropped when it breaks.
- `HORIZONTAL_DIRECTIONS` and a `WireConnection` type (`'none' | 'side' | 'up'`).
- A `WireWorld` injected interface (`isWire`, `isSolid`, `connectsToRedstone`, `getWirePower`) —
  the caller-supplied world surface, matching 154's `RedstonePowerSource` seam so this module needs
  no `World` import.
- `resolveWireConnections(world, x, y, z)`: the per-side connection shape, implementing vanilla's
  ordering — connect to the side when the neighbour is a wire or a redstone-connectable component;
  otherwise `up` when a wire sits on top of a solid neighbour and the block above self is not
  solid; otherwise `side` (descending) when the neighbour is non-solid and a wire sits below it;
  otherwise `none`.
- `computeWirePower(world, powerSource, x, y, z)`: the local power rule — the maximum of the
  external power 154 reports at that position and each connected neighbouring wire's power
  attenuated by one.
- `wireStateProperties(power, connections)`: projects a power value and resolved connections into
  the block-state property record 007 enumerates.

## Non-goals
- **No network propagation, update ordering, or loop protection.** 156
  (`redstone-update-order`) owns "deterministic scheduled neighbor propagation and loop
  protection"; 155 provides only the *local* recompute rule a propagation pass will call per cell.
  Splitting it this way is exactly the sequence's stated boundary.
- **No components** (levers, torches, repeaters, comparators, observers) — 157-161. `WireWorld`'s
  `connectsToRedstone` is a caller-supplied predicate precisely so 155 does not need to know what a
  component is.
- **No `Game`/`World` wiring, no behavior dispatch, no rendering.** The block is *registered* (so
  its states exist and it can be placed/broken through the normal item path), but no
  `BlockBehavior` is attached and nothing recomputes wire power during play — that requires 156's
  propagation and is deliberately deferred.
- **No wire mesh/model** — wire renders with the existing flat-tile pipeline defaults; a proper
  connected-texture model belongs with 059/060's model work, not here.
- **No "diagonal"/vertical-only connection quirks beyond the documented up/down rules**, and no
  quasi-connectivity (154's identical, already-flagged exclusion).

## Preconditions
- Change 154 (`redstone-signal-core`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- `src/simulation/RedstoneSignal.ts` (154, `attenuate`/`clampSignal`/`Direction`/`offsetInDirection`/
  `getIndirectPower`/`RedstonePowerSource`), `src/world/BlockPropertySchema.ts` (006),
  `src/world/BlockRegistry.ts` + `src/inventory/ItemRegistry.ts` (block/item registration).

## Proposed change
1. `src/world/BlockRegistry.ts` (EDIT): `REDSTONE_WIRE_SCHEMA`; `BlockId.RedstoneWire = 37`; the
   block definition (non-solid, non-opaque, breakable, `dropItem` → `minecraft:redstone`,
   `defaultState` all-`none` at power 0).
2. `src/inventory/ItemRegistry.ts` (EDIT): `ItemId.Redstone = 37` with `placeBlock` →
   `minecraft:redstone_wire`.
3. `src/simulation/RedstoneWire.ts` (NEW): `WireConnection`, `HORIZONTAL_DIRECTIONS`, `WireWorld`,
   `WireConnections`, `resolveWireConnections`, `computeWirePower`, `wireStateProperties`.

## Compatibility and migration
- Two additive registry edits (one new block id, one new item id — no existing id renumbered) and
  one new simulation file. No `Game.ts` edit; no schema/save-format change; no migration. Requires
  updating `BlockItemSeparation.test.ts`'s hardcoded legacy-id table and its placeable-item
  exhaustiveness list (the same non-regression test maintenance 125/148 performed).

## Risks
- **1296 enumerated wire states materially grows the 007 state registry** (previously a few dozen
  states total). Mitigation: 007 already declares and enforces a 65536-per-block cap and enumerates
  lazily per block at construction; 1296 is ~2% of that cap, and a test asserts the exact count so
  an accidental schema change that explodes the space is caught immediately.
- **The wire block is registered but inert during play** (nothing recomputes its power until 156).
  Mitigation: documented explicitly; placing wire yields a power-0 wire, which is correct
  "unpowered wire" behavior rather than a visible defect.

## Rollback strategy
One new file plus two additive registry entries and their test-table updates; reverting fully
removes the feature with no other impact.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: the schema's exact enumerated state count and default state;
  `resolveWireConnections` for each documented branch (wire neighbour, connectable component,
  step-up, step-down, blocked step-up when the block above self is solid, and `none`);
  `computeWirePower` (external power wins, neighbour-minus-one wins, the maximum across several
  connected wires, an unconnected wire reading 0, and no self-reinforcement from a lower neighbour);
  `wireStateProperties` projection; and the block/item registration cross-references.
- Full gate green: typecheck, lint, unit, build, e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
