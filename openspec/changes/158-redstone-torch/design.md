# Design: 158-redstone-torch

## Context/current state
- 157 established the pattern this change repeats: a simple boolean-state block, a placing item, a
  pure behaviour model, and 047's `ScheduledTickQueue` for timing. 158 differs in one substantive
  way — the torch is the first *inverting* component, and the first that can drive itself into a
  feedback loop, which is why burnout exists.
- Every prior redstone change kept its world access injected (154's `RedstonePowerSource`, 155's
  `WireWorld`, 156's `WirePowerStore`). 158 goes further: `torchShouldBeLit` takes a plain boolean
  ("is my attachment powered"), so the module needs no world interface at all. The caller — which
  already knows the torch's attachment block from its placement state — resolves that with 154's
  `getIndirectPower`.

## Target state
- A `redstone_torch` block with a `lit` boolean (2 states), a placing item, and
  `src/simulation/RedstoneTorch.ts` holding the inversion, the signal rule, the update-delay
  scheduling bridge, and `TorchBurnoutTracker`.

## Invariants
- `torchShouldBeLit(attachmentPowered)` is exactly `!attachmentPowered` — the inversion, with no
  other condition folded in. Burnout is applied by the *caller* on top of it, never silently inside
  it, so the two rules stay independently testable.
- `torchSignalStrength(lit)` is `MAX_SIGNAL_STRENGTH` when lit, `MIN_SIGNAL_STRENGTH` otherwise.
- `TorchBurnoutTracker.recordToggle(id, tick)` retains only toggles within `BURNOUT_WINDOW_TICKS`
  of the newest one, so memory per torch is bounded by the toggle limit regardless of runtime.
- `isBurnedOut(id, tick)` is `true` exactly when the retained toggle count exceeds
  `BURNOUT_TOGGLE_LIMIT`, and stays `true` until `BURNOUT_RECOVERY_TICKS` have passed since the last
  recorded toggle.
- Recording a toggle while burnt out extends the burnout (a torch fighting a loop cannot recover
  while still being driven).

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const LIT_SCHEMA = new BlockPropertySchema([{ kind: 'boolean', name: 'lit' }]);
// BlockId.RedstoneTorch = 41; ItemId.RedstoneTorch = 41

// src/simulation/RedstoneTorch.ts (new)
export const TORCH_UPDATE_DELAY_TICKS = 2;
export const BURNOUT_TOGGLE_LIMIT = 8;
export const BURNOUT_WINDOW_TICKS = 60;
export const BURNOUT_RECOVERY_TICKS = 60;

export function torchShouldBeLit(attachmentPowered: boolean): boolean;
export function torchSignalStrength(lit: boolean): number;
export function scheduleTorchUpdate(queue: ScheduledTickQueue, x: number, y: number, z: number, currentTick: number): void;
export function dueTorchUpdates(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];

export class TorchBurnoutTracker {
  recordToggle(torchId: number, tick: number): void;
  isBurnedOut(torchId: number, tick: number): boolean;
  toggleCount(torchId: number, tick: number): number;
  clear(torchId?: number): void;
}

export function torchStateProperties(lit: boolean): Record<string, boolean>;
```

## Control/data flow
1. **Neighbour change** (a future wiring change): when the block a torch is attached to changes
   power, `scheduleTorchUpdate(queue, …, now)` — the torch reacts after
   `TORCH_UPDATE_DELAY_TICKS`, which is what gives redstone its characteristic gate delay.
2. **Update tick**: `dueTorchUpdates(queue, now)` → for each torch, compute
   `next = torchShouldBeLit(attachmentPowered)`. If `next !== currentLit`:
   `burnout.recordToggle(id, now)`; if `burnout.isBurnedOut(id, now)` force `lit: false`, otherwise
   apply `next`; then mark the torch dirty on 156's propagator so the circuit updates.
3. **Emission**: a future `RedstonePowerSource` adapter reports `torchSignalStrength(lit)`.

## Detailed behavior
- Keeping burnout *outside* `torchShouldBeLit` is deliberate: the inversion is a pure one-line rule
  that must stay trivially correct, while burnout is a stateful heuristic. Folding them together
  would make the inversion untestable in isolation and hide which rule caused an unlit torch.
- `recordToggle` prunes on write: entries older than `BURNOUT_WINDOW_TICKS` before the incoming tick
  are dropped. That keeps per-torch memory bounded by the toggle limit and makes
  `toggleCount`/`isBurnedOut` O(retained) rather than O(history).
- Burnout uses **strictly greater than** the limit, so exactly `BURNOUT_TOGGLE_LIMIT` toggles in a
  window is still fine — the limit is the last tolerated count, matching how the constant reads.
- Recovery is measured from the *last recorded toggle*, not from when burnout began, so a torch
  still being driven stays out. A test asserts both halves of that.
- Tests assert relative to the exported constants (e.g. `BURNOUT_TOGGLE_LIMIT + 1` toggles), so
  retuning the heuristic cannot silently invalidate them.

## Failure modes
- No function throws for well-formed inputs; a non-finite tick is treated as 0 (157's convention).
- 007 throws at construction if the default state is missing from the enumeration — a test asserts
  the exact 2-state enumeration and `lit: false` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; the four documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Every function is O(1) amortised; per-torch memory is bounded by `BURNOUT_TOGGLE_LIMIT` retained
  ticks. 2 new block states.

## Testing seams
- The whole module is tested with plain values and a real 047 queue — no `World` of any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `toggleCount(id, tick)` exposes the tracker's live window for debugging a suspected loop.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RedstoneTorch.ts` (new).
- Tests: `tests/unit/RedstoneTorch.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Folding burnout into `torchShouldBeLit`**: rejected — see Detailed behavior; it would couple a
  trivially-correct pure rule to a stateful heuristic and make failures ambiguous.
- **A simple "toggled last tick" burnout flag**: rejected — it would false-positive on a legitimately
  fast-switching circuit; a windowed count is what vanilla approximates and is far less surprising.
- **Modelling facing/attachment direction**: rejected — 157's identical, already-documented reasoning
  (models are 059/060's scope), and `torchShouldBeLit`'s boolean input keeps the module free of it.
- **Measuring recovery from burnout onset rather than the last toggle**: rejected — a torch still
  being driven by a live loop would flicker back on mid-loop, defeating the purpose.

## Downstream dependencies
- A future wiring change drives `scheduleTorchUpdate`/`dueTorchUpdates` from block edits and reports
  `torchSignalStrength` through 154's `RedstonePowerSource`.
- 159-161 (repeater, comparator, observer) complete the logic components; 162's consumers react to
  them.
