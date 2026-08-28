# Design: 159-repeater

## Context/current state
- 157/158 established the pattern: a stateful block, a placing item, a pure behaviour model, and
  047's `ScheduledTickQueue` for timing. 159 is 047's third redstone consumer.
- 158's `torchShouldBeLit` is the template for a pure predicate composed by the caller at the
  scheduled tick, not applied immediately — 159's `resolveRepeaterOutput` follows the identical
  shape, extended with a second boolean input (`locked`) that 157/158 never needed.
- No prior redstone block has modeled `facing` — 155/157/158 all deferred it as purely visual. A
  repeater is the first case where facing is *behavioral*: which side is "front" determines input
  vs. output, and which sides are "left/right" determines the lock input. This change therefore
  models `facing` for the first time, and documents why that is not a reversal of the prior
  omissions (Risks/Rejected alternatives).

## Target state
- A `redstone_repeater` block with `facing`/`delay`/`locked`/`powered` state (64 states), a placing
  item, and `src/simulation/RedstoneRepeater.ts` holding delay mapping/cycling, the lock predicate,
  the composed output rule, the 047 scheduling bridge, and the state projection.

## Invariants
- `REPEATER_DELAY_TICKS[d]` is defined for every `d` in `1..4` and is strictly increasing (2, 4, 6,
  8) — each step is exactly `TORCH_UPDATE_DELAY_TICKS` (158's constant) longer than the last, so the
  delay unit stays consistent across every redstone component built so far.
- `cycleRepeaterDelay` is a total bijection on `{1,2,3,4}` with period 4: applying it four times
  returns the original value.
- `repeaterShouldLock(perpendicularPowered)` is exactly `perpendicularPowered` — trivial, but named
  and tested so a caller never has to guess the polarity.
- `resolveRepeaterOutput(currentInput, locked, currentPowered)` returns `currentPowered` unchanged
  when `locked` is `true`, regardless of `currentInput`; otherwise it returns `currentInput`.
- `repeaterSignalStrength(powered)` mirrors 158's `torchSignalStrength` exactly (full or none).
- `scheduleRepeaterOutput`/`dueRepeaterOutputs` behave identically to 157/158's 047 bridges: not due
  before their tick, due at it, deterministic same-tick ordering.

## API and data model
```ts
// src/world/BlockRegistry.ts (edit)
export const REPEATER_SCHEMA = new BlockPropertySchema([
  { kind: 'named', name: 'facing', values: ['north', 'south', 'east', 'west'] },
  { kind: 'integer', name: 'delay', min: 1, max: 4 },
  { kind: 'boolean', name: 'locked' },
  { kind: 'boolean', name: 'powered' },
]);
// BlockId.RedstoneRepeater = 42; ItemId.RedstoneRepeater = 42

// src/simulation/RedstoneRepeater.ts (new)
export type RepeaterDelay = 1 | 2 | 3 | 4;
export const REPEATER_DELAY_TICKS: Readonly<Record<RepeaterDelay, number>>; // {1:2, 2:4, 3:6, 4:8}

export function cycleRepeaterDelay(delay: RepeaterDelay): RepeaterDelay;
export function repeaterShouldLock(perpendicularPowered: boolean): boolean;
export function resolveRepeaterOutput(currentInput: boolean, locked: boolean, currentPowered: boolean): boolean;
export function repeaterSignalStrength(powered: boolean): number;

export function scheduleRepeaterOutput(
  queue: ScheduledTickQueue, x: number, y: number, z: number,
  delay: RepeaterDelay, currentTick: number,
): void;
export function dueRepeaterOutputs(queue: ScheduledTickQueue, nowTick: number): ScheduledTick[];

export type RepeaterFacing = 'north' | 'south' | 'east' | 'west';

export function repeaterStateProperties(
  facing: RepeaterFacing, delay: RepeaterDelay, locked: boolean, powered: boolean,
): Record<string, boolean | number | string>;
```

## Control/data flow
1. **Input sampling** (a future wiring change): when a repeater's front-input power changes, the
   caller decides whether to re-schedule (vanilla only re-triggers on a genuine input change — this
   module does not track that itself; see Non-goals) and calls
   `scheduleRepeaterOutput(queue, …, delay, now)`.
2. **Lock check** (every tick, cheaply, by the caller): `repeaterShouldLock(perpendicularPowered)`
   — the caller resolves `perpendicularPowered` from 154's `getIndirectPower` on the two side
   neighbours (whichever facing determines "side" for this repeater; a facing/orientation lookup is
   the caller's job, matching how 155's wire resolved its own side neighbours from `Direction`).
3. **Output tick**: `dueRepeaterOutputs(queue, now)` → for each due position, the caller computes
   `next = resolveRepeaterOutput(sampledInput, locked, currentPowered)` and writes it if changed,
   then marks the front neighbour dirty on 156's propagator.
4. **Emission**: `repeaterSignalStrength(powered)` through a future `RedstonePowerSource` adapter.

## Detailed behavior
- `REPEATER_DELAY_TICKS` is a plain lookup table, not a formula, so the four vanilla values are
  visible and testable directly rather than derived — matching how 158 named
  `TORCH_UPDATE_DELAY_TICKS` as one constant rather than computing it.
- `resolveRepeaterOutput`'s locked branch ignores `currentInput` entirely — a locked repeater is
  frozen at whatever it was last outputting, which is exactly vanilla's behavior (a locked repeater
  does not even queue a delayed change; it simply does not react).
- `cycleRepeaterDelay` is deliberately a pure `1→2→3→4→1` function rather than a stateful counter,
  so a caller can preview the next delay without mutating anything.
- `facing` is modeled with the same four-value named schema 155 already uses for wire's sides —
  reusing that convention rather than inventing a new one.

## Failure modes
- No function throws for well-formed inputs; a non-finite tick is treated as `0` (157/158's
  convention).
- 007 throws at construction if the default state is missing — a test asserts the exact 64-state
  enumeration and the `{facing: north, delay: 1, locked: false, powered: false}` default.

## Compatibility/migration
- One additive block id and one additive item id; one new simulation file; the four documented
  characterization-test updates. No `Game.ts` edit; no schema/save-format change.

## Performance/resource constraints
- Every function is O(1); `dueRepeaterOutputs` is 047's own bounded pop. 64 new block states (a
  cumulative registry total of 1358 + 64 = 1422, still ~2% of the per-block cap and negligible
  overall).

## Testing seams
- The whole module is tested with plain values and a real 047 queue — no `World` of any kind.
- Registration is tested against the real block/item/state registries.

## Observability/debugging
- `repeaterStateProperties` is the standard stateful-block record.

## Affected files/symbols
- `src/world/BlockRegistry.ts`, `src/inventory/ItemRegistry.ts` (edits).
- `src/simulation/RedstoneRepeater.ts` (new).
- Tests: `tests/unit/RedstoneRepeater.test.ts` (new) + the four characterization updates.

## Rejected alternatives
- **Tracking "did the input change" inside this module**: rejected — that requires remembering the
  previous input per position, which is state a future wiring change already needs to own (it knows
  the real world); duplicating it here would create two sources of truth for the same fact.
- **Deriving `REPEATER_DELAY_TICKS` from a formula** (`delay * TORCH_UPDATE_DELAY_TICKS`): rejected
  in favor of an explicit lookup table — it happens to match that formula today, but a lookup table
  makes the four vanilla values visible and independently testable rather than implicit in an
  equation a reader has to verify.
- **Modeling facing as purely visual and deferring it, like 157/158**: rejected — a repeater's
  facing determines which side is input/output vs. lock, a behavioral fact this change's own lock
  semantics depend on; deferring it would leave `resolveRepeaterOutput`'s composition untestable
  end-to-end.

## Downstream dependencies
- A future wiring change drives sampling/scheduling from real block edits and reports
  `repeaterSignalStrength` through 154's `RedstonePowerSource`.
- 160 (comparator) is a structurally similar delay/logic component and may reuse this module's
  shape as a template; 161 (observer) is the last of this trio.
