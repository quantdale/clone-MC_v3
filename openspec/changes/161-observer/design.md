# Design: 161-observer

## Context/current state
- 157-160 all output a signal derived from power flowing *into* the component (a lever's toggle, a
  button's press, a torch's inversion of its attachment, a repeater/comparator's front input). The
  observer is the first to output a signal derived from a *neighbour's block state changing* —
  conceptually closer to 156's propagation ("something happened nearby") than to 157-160's local
  power math, but its own scope is narrow: given "a change was detected," emit a pulse.
- 159 established that `facing` is modeled when it is behavioral. The observer's facing is the most
  behavioral yet: it determines *both* which neighbour is watched (front) *and* which neighbour
  receives the pulse (back) — and unlike 159/160's 4-way horizontal facing, an observer can be
  placed watching straight up or down, so its facing needs all six of 154's `Direction` values.
- 154's `Direction`/`OPPOSITE_DIRECTION`/`offsetInDirection` already model exactly this six-value
  vocabulary and its opposite/offset helpers — this is their first consumer among the 157-160
  components (each of which needed only a horizontal subset), so this change reuses them directly
  rather than reintroducing a parallel four-or-six-value type.
- 047's `ScheduledTickQueue` dedups by position: a single instance holds at most one pending entry
  per `(x, y, z)`. 157-160 each needed only one phase (a release, an update, an output), so one
  queue sufficed. The observer's pulse is genuinely two-phase (turn on, then turn off), so this
  change is the first to need two independent queue instances for one block.

## Target state
- An `observer` block with `facing`/`powered` state (12 states), a placing item, and
  `src/simulation/RedstoneObserver.ts` holding the watched/emission neighbour derivation, the
  two-phase pulse scheduling bridge, the signal-strength projection, and the state projection.

## Invariants
- `observedNeighborPosition(x, y, z, facing)` equals `offsetInDirection(x, y, z, facing)` exactly.
- `emissionNeighborPosition(x, y, z, facing)` equals
  `offsetInDirection(x, y, z, OPPOSITE_DIRECTION[facing])` exactly — and is therefore always the
  position on the opposite side of `(x, y, z)` from the watched neighbour.
- `scheduleObserverPulseStart`/`dueObserverPulseStarts` and `scheduleObserverPulseEnd`/
  `dueObserverPulseEnds` each behave identically to 157-160's 047 bridges, just against independent
  queue instances.
- `observerSignalStrength(powered)` is exactly `MAX_SIGNAL_STRENGTH` when `powered`, else
  `MIN_SIGNAL_STRENGTH` — 158's `torchSignalStrength` shape, unchanged.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const OBSERVER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west', 'up', 'down'] },
  { kind: 'boolean', name: 'powered' },
]);
// BlockId.Observer = 44; ItemId.Observer = 44

// src/simulation/RedstoneObserver.ts (new)
export type ObserverFacing = Direction; // reuses 154's six-value Direction exactly

export const OBSERVER_PULSE_START_DELAY_TICKS = 2;
export const OBSERVER_PULSE_DURATION_TICKS = 2;

export function observedNeighborPosition(x: number, y: number, z: number, facing: ObserverFacing): [number, number, number];
export function emissionNeighborPosition(x: number, y: number, z: number, facing: ObserverFacing): [number, number, number];

export function scheduleObserverPulseStart(queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number): void;
export function dueObserverPulseStarts(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];
export function scheduleObserverPulseEnd(queue: ScheduledTickQueue, x: number, y: number, z: number, pulseStartTick: number): void;
export function dueObserverPulseEnds(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];

export function observerSignalStrength(powered: boolean): number;
export function observerStateProperties(facing: ObserverFacing, powered: boolean): Record<string, boolean | string>;
```

## Control/data flow
1. **Detection** (a future wiring change): when the caller observes that the watched neighbour's
   state actually changed, it calls `scheduleObserverPulseStart(startQueue, x, y, z, now)`
   (detection itself is the caller's job, matching 159's identical deferral).
2. **Pulse-on tick**: `dueObserverPulseStarts(startQueue, now)` → for each due position, the caller
   sets `powered = true`, marks the emission neighbour dirty on 156's propagator, and calls
   `scheduleObserverPulseEnd(endQueue, x, y, z, now)`.
3. **Pulse-off tick**: `dueObserverPulseEnds(endQueue, now)` → for each due position, the caller sets
   `powered = false` and again marks the emission neighbour dirty.
4. **Emission**: a future `RedstonePowerSource` adapter reports `observerSignalStrength(powered)`
   from the emission-neighbour-facing side only (observers, unlike wire, do not emit from every
   face) — that directional restriction is the future adapter's concern, not this module's.

## Detailed behavior
- Two independent `ScheduledTickQueue` instances are required, not one: 047 dedups by position, so
  a single queue could never hold both a pending pulse-start and a pending pulse-end for the same
  block at once. Two queues sidestep the collision by construction — the caller is expected to keep
  one queue per phase, exactly as it would keep one queue per component kind (157's component
  releases vs. 158's torch updates vs. 159's repeater outputs already establish that a caller may
  own several 047 queues for different purposes).
- Re-triggering: calling `scheduleObserverPulseStart` again for a position that already has a
  pending pulse-start simply reschedules it to the new due tick (047's own dedup-then-overwrite
  behavior) — this is the natural, already-tested behavior of the underlying queue, not a rule this
  module adds. The same applies to `scheduleObserverPulseEnd`.
- `facing` is 6-way — the first schema in the redstone family that isn't horizontal-only — because
  an observer watching straight up (e.g. a dropper stack above it) or down is exactly as valid as
  watching sideways.
- `observedNeighborPosition`/`emissionNeighborPosition` are pure coordinate arithmetic; they do not
  read any block state themselves (no `World`/`RedstonePowerSource` dependency), matching 155's
  `WireWorld`-free connection-shape functions.

## Failure modes
- No function throws for well-formed inputs; a non-finite tick is treated as `0` (157-160's
  convention).
- 007 throws at construction if the default state is missing — a test asserts the exact 12-state
  enumeration and the `{facing: north, powered: false}` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; the four documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Every function is O(1); both `due*` functions are 047's own bounded pop. 12 new block states (a
  cumulative registry total of 1438 + 12 = 1450).

## Testing seams
- The whole module is tested with plain numbers/coordinates and two real 047 queues — no `World` of
  any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `observerStateProperties` is the standard stateful-block record.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RedstoneObserver.ts` (new).
- Tests: `tests/unit/RedstoneObserver.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **A single shared queue with a phase tag stored alongside each entry**: rejected — 047's queue
  intentionally exposes only `(x, y, z, tickTime)`; smuggling a phase tag through it (e.g. encoding
  it into the position) would violate 047's own contract and couple this module to its internals.
  Two plain queue instances need no changes to 047 at all.
- **Deriving front/back from a bespoke local direction type** (159/160's pattern): rejected —
  those two needed only a horizontal subset; the observer genuinely needs all six of 154's
  `Direction` values, so reusing it directly is simpler than reintroducing an equivalent type.
- **Building change-detection into this module**: rejected — no titled change owns a real `World`
  read/compare loop yet; matching 159's identical deferral keeps this module free of a `World`
  dependency and independently testable.

## Downstream dependencies
- A future wiring change drives detection/scheduling from real block edits and reports the pulse
  through 154's `RedstonePowerSource`.
- This closes the 157-161 logic-component trio; 162 (redstone-consumer-blocks) is the first change
  to consume a component's output on the receiving end (lamps/doors/trapdoors).
