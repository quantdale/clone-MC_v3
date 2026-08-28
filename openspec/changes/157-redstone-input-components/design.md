# Design: 157-redstone-input-components

## Context/current state
- 154/155/156 built the power model, the wire, and the propagation, but no block emits power. This
  change adds the first sources.
- 047's `ScheduledTickQueue` schedules by **absolute** `dueTick` with deterministic `(tickTime, seq)`
  pop ordering and per-position dedup — exactly what a self-releasing button needs. 156 correctly
  did not use it (wire propagation is immediate); 157 is its first redstone consumer, and 159's
  repeater delay will be the second. Because entries are keyed by position and ordered by absolute
  tick, independent users of one queue cannot interfere.
- 155 established the registration pattern for a stateful redstone block (schema + block + placing
  item + the four characterization-test updates). 157 repeats it for three simple 2-state blocks.

## Target state
- A shared `POWERED_SCHEMA` (one boolean `powered`) backing `lever`, `stone_button`, and
  `pressure_plate` — 2 states each, 6 new states total.
- `src/simulation/RedstoneInputComponents.ts`: the kind union, the per-kind signal rule, the three
  activation rules (latch / timed release / occupancy), the 047 scheduling bridge, and the
  state projection.

## Invariants
- `componentSignalStrength(kind, powered)` returns `MAX_SIGNAL_STRENGTH` when `powered` and
  `MIN_SIGNAL_STRENGTH` otherwise, for every kind — the three components differ in *when* they are
  powered, never in *how strongly*.
- `toggleLever` is an involution: toggling twice returns the original state.
- `pressButton(t).releaseTick === t + BUTTON_ACTIVE_TICKS`, and `powered` is always `true`
  (pressing an already-pressed button re-arms its release rather than doing nothing — vanilla's
  behaviour).
- `platePowered(n)` is `true` exactly when `n > 0`; a negative or non-finite count reads `false`.
- `dueComponentReleases(queue, now)` returns exactly the entries with `tickTime <= now`, in 047's
  deterministic `(tickTime, seq)` order, and leaves later entries queued.
- `componentStateProperties(powered)` produces exactly `{ powered }`, matching `POWERED_SCHEMA`.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const POWERED_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'powered' }]);
// BlockId.Lever = 38, BlockId.StoneButton = 39, BlockId.PressurePlate = 40
// ItemId.Lever = 38, ItemId.StoneButton = 39, ItemId.PressurePlate = 40

// src/simulation/RedstoneInputComponents.ts (new)
export type RedstoneComponentKind = 'lever' | 'button' | 'pressure_plate';

export const BUTTON_ACTIVE_TICKS = 20;        // 1 second at 20 TPS
export const PLATE_RELEASE_DELAY_TICKS = 10;  // vanilla's trailing plate delay

export function componentSignalStrength(kind: RedstoneComponentKind, powered: boolean): number;
export function toggleLever(powered: boolean): boolean;

export interface ButtonPress { readonly powered: true; readonly releaseTick: number; }
export function pressButton(currentTick: number): ButtonPress;

export function platePowered(entityCount: number): boolean;
export function plateReleaseTick(currentTick: number): number;

export function scheduleComponentRelease(
  queue: ScheduledTickQueue, x: number, y: number, z: number,
  kind: RedstoneComponentKind, currentTick: number,
): boolean;   // false for a lever (never self-releases)

export function dueComponentReleases(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];
export function componentStateProperties(powered: boolean): Record<string, boolean>;
```

## Control/data flow
1. **Activation** (a future interaction/collision change): right-click a lever →
   `toggleLever(current)`; press a button → `pressButton(now)` then
   `scheduleComponentRelease(queue, …, 'button', now)`; an entity steps on a plate →
   `platePowered(count)`, and when the count falls to 0, `scheduleComponentRelease(…,
   'pressure_plate', now)`.
2. **Release** (a future tick loop): `dueComponentReleases(queue, now)` → for each returned
   position, write `powered: false` and mark it dirty on 156's propagator so the circuit updates.
3. **Emission** (a future `RedstonePowerSource` adapter): report
   `componentSignalStrength(kind, powered)` for a component block, and `true` from
   `connectsToRedstone` so 155's wire connects to it.

## Detailed behavior
- All three components emit full strength (15). Differentiating strength is a later-content concern
  (weighted plates, 161's analog sources); the interesting axis here is timing.
- `scheduleComponentRelease` returns `false` and schedules nothing for `'lever'` — a lever latches
  and only a second interaction changes it. Returning a boolean (rather than silently no-op'ing)
  lets a caller assert it did not accidentally arm a latch.
- A button pressed again before its release re-schedules the same position (047's `schedule`
  overwrites by position), so the release always sits `BUTTON_ACTIVE_TICKS` after the *latest*
  press — vanilla's behaviour and the reason 047's per-position dedup is the right primitive.
- `platePowered` treats a non-finite or negative count as `false` rather than throwing, matching the
  total/non-throwing convention of 154-156.
- `POWERED_SCHEMA` is shared across all three blocks. 007 enumerates per block, so sharing one
  schema instance is safe and keeps the three definitions honest about being state-identical.

## Failure modes
- No function throws for well-formed inputs; ill-formed counts/ticks degrade to `false`/no-op.
- 007's `BlockStateRegistry` throws at construction if a default state is missing from the
  enumeration — tests assert each block's exact 2-state enumeration and `powered: false` default.

## Compatibility/migration
- Three additive block ids and three additive item ids (none renumbered); one new simulation file.
  The four block/item characterization tests need the documented update (155's precedent). No
  `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Every function is O(1); `dueComponentReleases` is 047's own bounded pop. 6 new block states.

## Testing seams
- The component model is tested with plain values and a real 047 `ScheduledTickQueue` (no `World`).
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `componentStateProperties` is the standard stateful-block record; scheduled releases are visible
  through 047's own queue inspection.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RedstoneInputComponents.ts` (new).
- Tests: `tests/unit/RedstoneInputComponents.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Modelling `facing`/`face` attachment state now**: rejected — it multiplies the state space ~15×
  purely to drive models (059/060's scope) with zero effect on signal behaviour, which is what this
  change is about.
- **A caller-driven tick counter instead of 047** (152/153's approach): rejected — those model a
  single long-lived entity's own clock; here many independent positions expire at different absolute
  ticks and must release in a deterministic order, which is precisely 047's contract. Using it also
  keeps 159's repeater delay on the same primitive.
- **Per-kind signal strengths**: rejected — vanilla's foundational three all emit 15; weighted
  plates are separate later content.
- **Wiring interaction/collision in this change**: rejected — needs `PlayerInteraction` plus an
  entity-collision hook plus a `World`-backed `RedstonePowerSource`; the same integration surface
  156 deferred, and bundling it would make this change's testing surface far larger than its titled
  outcome.

## Downstream dependencies
- A future wiring change turns these into live sources: an interaction hook toggling/pressing, a
  tick loop draining `dueComponentReleases`, and a `RedstonePowerSource` adapter reporting
  `componentSignalStrength` so 156's propagator carries it down 155's wire.
- 158-161 (torch, repeater, comparator, observer) add the remaining source/logic components; 159
  reuses 047 for its delay.
