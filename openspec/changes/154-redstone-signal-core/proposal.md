# Proposal: 154-redstone-signal-core

## Problem
Nothing in the codebase models redstone power. Every change in the "Redstone and automation"
section (155-173) — wire connectivity, torches, repeaters, comparators, observers, pistons — needs
one shared, exact answer to "how much power does this block face see, and is it weak or strong?"
Getting that primitive wrong (or letting each component invent its own) makes every downstream
circuit subtly incorrect, which is exactly the failure the change sequence's strict ordering exists
to prevent.

## Goals
- A `Direction` vocabulary with `OPPOSITE_DIRECTION` and `offsetInDirection`, matching the
  codebase's existing Minecraft convention (north = −z, south = +z, east = +x, west = −x).
- `MAX_SIGNAL_STRENGTH` / `MIN_SIGNAL_STRENGTH` (15/0) and `clampSignal` — the single definition of
  the legal power domain.
- A `RedstonePowerSource` interface (`getWeakPower`, `getStrongPower`, `isConductive`) — the
  caller-supplied world surface, injected rather than imported, so this module has no `World`
  dependency (the same seam 145's `PassiveMobWorld` and 148's spawn sinks use).
- `getDirectPower(source, x, y, z)`: the maximum **strong** power any of the six neighbours emits
  into `(x, y, z)` — what a wire or component reads to decide it is directly powered.
- `getIndirectPower(source, x, y, z)`: the maximum of direct power and the power a *conductive*
  neighbour re-emits after being strongly powered from its own far side — vanilla's
  "block-through-block" (quasi-indirect) rule, the thing components actually gate on.
- `isBlockPowered(source, x, y, z)`: `getIndirectPower(...) > 0`.
- `attenuate(signal, distance)`: the per-block decay wire propagation (155) will apply.
- `strongestSignalFrom(values)`: the max-of-many helper every multi-input component needs.

## Non-goals
- **No wire block, no wire connectivity, no propagation.** 155 (`redstone-wire-connectivity`) owns
  block states, connection shapes, and running `attenuate` across a wire network; this change only
  defines the decay function and the power-query primitives it will use.
- **No scheduled updates / neighbour propagation order.** 156's titled scope.
- **No components** (levers, torches, repeaters, comparators, observers) — 157-161.
- **No block registry additions.** No redstone block is registered; `RedstonePowerSource` is a
  caller-supplied interface, so this module never looks a block up.
- **Not wired into `Game`** — additive/unconsumed, matching 148-153.
- **No quasi-connectivity ("BUD") emulation** — vanilla's piston-specific quirk is out of scope for
  the core signal model and belongs (if ever) with 163/164's piston work; documented so a later
  change knows it was deliberately excluded, not overlooked.

## Preconditions
- Change 153 (`boss-framework`) is VERIFIED.
- `origin/main` head equals the local `HEAD` at session start.

## Dependencies
- None. Deliberately import-free (152/141's precedent), so the signal model can be consumed by
  worldgen-adjacent, simulation, and future networking code without pulling a dependency chain.

## Proposed change
1. `src/simulation/RedstoneSignal.ts` (NEW): `Direction` type, `DIRECTIONS`, `OPPOSITE_DIRECTION`,
   `DIRECTION_OFFSETS`, `offsetInDirection`; `MIN_SIGNAL_STRENGTH`, `MAX_SIGNAL_STRENGTH`,
   `clampSignal`, `attenuate`, `strongestSignalFrom`; `RedstonePowerSource` interface;
   `getDirectPower`, `getIndirectPower`, `isBlockPowered`.

## Compatibility and migration
- One new, additive file. No existing module edited; no `Game.ts` edit; no schema/save-format
  change; no migration.

## Risks
- **A second `Direction` type now exists** (099's `StructureTemplate.ts` already declares a
  structurally identical one). Mitigation: declared locally rather than imported, to avoid a
  `simulation → worldgen` dependency; TypeScript's structural typing means the two interoperate
  freely, and the shared Minecraft convention is documented in both. This mirrors 146's identical
  decision to re-declare `HostileMobWorld` rather than import 145's identical shape.

## Rollback strategy
One additive file; reverting fully removes the feature with no other impact.

## Definition of Done
- All listed types/functions implemented per design.md/spec.md.
- Unit tests cover: direction opposites/offsets round-tripping; `clampSignal` domain clamping;
  `attenuate` decay and floor; `strongestSignalFrom` (including the empty case);
  `getDirectPower` (max across faces, ignores weak power); `getIndirectPower` (direct power wins
  when higher; a conductive neighbour re-emits its own strong power; a non-conductive neighbour does
  not); `isBlockPowered` threshold behaviour.
- Full gate green: typecheck, lint, unit, build (module count unchanged — additive/unconsumed,
  mirroring 148-153's identical evidence), e2e (existing 22 assertions unaffected).

## Advancement gate
Target 100% task completion and full gate green. No MUST/SHALL requirement unmet; no regression.
