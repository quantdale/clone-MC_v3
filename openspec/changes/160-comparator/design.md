# Design: 160-comparator

## Context/current state
- 157-159 all output a boolean-derived signal (full or none). The comparator is the first component
  whose output is a genuine function of two signal *strengths*, not just two booleans — the reason
  it needs 154's `clampSignal` directly rather than just `MAX_SIGNAL_STRENGTH`/
  `MIN_SIGNAL_STRENGTH`.
- 159 established that `facing` is modeled when it is behavioral (front vs. side matters for the
  signal math, not just for rendering). The comparator's front/side distinction is exactly the same
  kind of behavioral fact, so `facing` is modeled here too, reusing the identical four-value named
  schema.
- Container signal reads are a real vanilla feature (a chest's fullness measured 0-15) but require a
  bridge from 106's `ContainerMenu`/inventory model to a signal value that does not exist and has no
  titled change building it before 166 (hopper transfer, the first change that must move items
  through container state driven by redstone-adjacent timing). `resolveComparatorOutput` takes a
  plain `sideInput: number`, so that bridge — whenever it arrives — plugs in without touching this
  module.

## Target state
- A `redstone_comparator` block with `facing`/`mode`/`powered` state (16 states), a placing item,
  and `src/simulation/RedstoneComparator.ts` holding mode cycling, the two-mode output rule, the
  powered projection, the 047 scheduling bridge, and the state projection.

## Invariants
- `cycleComparatorMode` is a total bijection on `{'compare', 'subtract'}` — applying it twice
  returns the original mode.
- `resolveComparatorOutput('compare', front, side)` equals `clampSignal(front)` when
  `clampSignal(front) >= clampSignal(side)`, and `MIN_SIGNAL_STRENGTH` otherwise — including the
  exact-equal boundary, which still passes through.
- `resolveComparatorOutput('subtract', front, side)` equals
  `max(MIN_SIGNAL_STRENGTH, clampSignal(front) - clampSignal(side))`, never negative.
- Both inputs are clamped through 154's `clampSignal` before any comparison or arithmetic, so an
  out-of-domain caller value can never produce an out-of-domain result.
- `comparatorIsPowered(output)` is exactly `output > MIN_SIGNAL_STRENGTH`.
- `scheduleComparatorUpdate`/`dueComparatorUpdates` behave identically to 157-159's 047 bridges.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const COMPARATOR_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west'] },
  { kind: 'named', name: 'mode', values: ['compare', 'subtract'] },
  { kind: 'boolean', name: 'powered' },
]);
// BlockId.RedstoneComparator = 43; ItemId.RedstoneComparator = 43

// src/simulation/RedstoneComparator.ts (new)
export type ComparatorMode = 'compare' | 'subtract';
export type ComparatorFacing = 'north' | 'south' | 'east' | 'west';

export const COMPARATOR_UPDATE_DELAY_TICKS = 2; // matches 158's TORCH_UPDATE_DELAY_TICKS

export function cycleComparatorMode(mode: ComparatorMode): ComparatorMode;
export function resolveComparatorOutput(mode: ComparatorMode, frontInput: number, sideInput: number): number;
export function comparatorIsPowered(output: number): boolean;

export function scheduleComparatorUpdate(queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number): void;
export function dueComparatorUpdates(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];

export function comparatorStateProperties(
  facing: ComparatorFacing, mode: ComparatorMode, powered: boolean,
): Record<string, boolean | string>;
```

## Control/data flow
1. **Sampling** (a future wiring change): when a comparator's front or side input changes, the
   caller calls `scheduleComparatorUpdate(queue, …, now)` (input-change tracking is the caller's
   job, matching 159's identical deferral).
2. **Output tick**: `dueComparatorUpdates(queue, now)` → for each due position, the caller computes
   `output = resolveComparatorOutput(mode, frontInput, sideInput)`, derives
   `powered = comparatorIsPowered(output)`, writes both if changed, and marks the front neighbour
   dirty on 156's propagator.
3. **Emission**: a future `RedstonePowerSource` adapter reports `output` directly (the comparator's
   emitted strength *is* its resolved output — unlike 157-159, there is no separate "signal
   strength" function, since the output already lives in the full `[0, 15]` domain).

## Detailed behavior
- `resolveComparatorOutput` clamps `frontInput`/`sideInput` independently before any comparison, so
  `compare` mode's `>=` test and `subtract` mode's difference are always computed on in-domain
  values regardless of what a (possibly misbehaving) caller supplies — mirroring 154's own
  "every source value is clamped on read" discipline.
- `compare` mode's boundary is inclusive: `frontInput === sideInput` still outputs `frontInput`
  unchanged (not `0`) — the detail the proposal's Risks flags as easy to invert by mistake, and the
  reason a dedicated boundary test exists rather than only "above" and "below" cases.
- `subtract` mode floors at `MIN_SIGNAL_STRENGTH`; a negative difference (side stronger than front)
  never underflows.
- `mode` uses a two-value named schema rather than a boolean, even though it is binary, because the
  values read naturally in a debug dump (`mode: 'compare'` vs. an unlabeled `true`/`false`) and
  because vanilla's own data format names it this way.
- `COMPARATOR_UPDATE_DELAY_TICKS` reuses 158's exact constant value (2) rather than defining an
  unrelated number, since vanilla's comparator and torch share the same one-redstone-tick update
  speed; documented explicitly so the coincidence is not read as an oversight.

## Failure modes
- No function throws for well-formed inputs; a non-finite tick is treated as `0` (157-159's
  convention); non-finite/out-of-range signal inputs are clamped, never rejected.
- 007 throws at construction if the default state is missing — a test asserts the exact 16-state
  enumeration and the `{facing: north, mode: compare, powered: false}` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; the four documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Every function is O(1); `dueComparatorUpdates` is 047's own bounded pop. 16 new block states (a
  cumulative registry total of 1422 + 16 = 1438).

## Testing seams
- The whole module is tested with plain numbers and a real 047 queue — no `World` of any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `comparatorStateProperties` is the standard stateful-block record.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RedstoneComparator.ts` (new).
- Tests: `tests/unit/RedstoneComparator.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Building the container-signal-read bridge now**: rejected — no titled change bridges 106's
  container model to a signal value before 166; `resolveComparatorOutput`'s plain-number
  `sideInput` already accommodates that future bridge without any change to this module, so
  building it prematurely would be scope creep with no present consumer.
- **A boolean `mode` field**: rejected — see Detailed behavior; a named two-value schema reads
  better and matches vanilla's own data convention.
- **Deriving `COMPARATOR_UPDATE_DELAY_TICKS` independently rather than reusing 158's constant
  value**: rejected — vanilla's comparator and torch genuinely share the same update speed;
  defining an independent constant with the same value would obscure that fact rather than
  document it.

## Downstream dependencies
- A future wiring change drives sampling/scheduling from real block edits (including a container
  fullness bridge for `sideInput`) and reports the resolved output through 154's
  `RedstonePowerSource`.
- 161 (observer) is the last of the 157-161 logic-component trio.
- 166 (hopper transfer) is the natural point a container-signal bridge would first be needed for a
  different reason (timed item transfer), making it a plausible home for that future bridge too.
