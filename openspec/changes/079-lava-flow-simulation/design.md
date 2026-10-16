# Design: 079-lava-flow-simulation

## Context / current state

078 water flow exists with fixed water parameters (interval 5, cap 7). Lava needs the same rules
with a slower cadence and a dimension-dependent spread range.

## Target state

`stepLavaCell` implements the 078 rule set parameterized by `spreadRange`; the wiring supplies 3
(overworld) or 7 (nether) and the 077 dispatcher uses `LAVA_FLOW_INTERVAL` (30) for lava ticks.

## Invariants

- Rule order identical to 078: downward spawn → ground conversion → horizontal spread → source
  formation → decay.
- `spreadRange` is a positive integer (validated per call).
- Horizontal proposal = `L + 1` for levels below `spreadRange` (range-level cells never spread);
  ground conversion produces flowing `spreadRange - 1`; decay removal happens at level
  `spreadRange`.
- Falling cells are never overwritten horizontally; downward spawn never targets occupied fluid.
- Neighbor order fixed (`-x, +x, -z, +z`); pure per-cell steps.

## API and data model

```ts
// src/simulation/LavaFlowEngine.ts (NEW)
import type { WaterWorldAccess, WaterStepResult } from './WaterFlowEngine';

export const LAVA_FLOW_INTERVAL = 30;
export function stepLavaCell(
  world: WaterWorldAccess,
  lavaFluidId: number,
  x: number, y: number, z: number,
  spreadRange: number,
): WaterStepResult;
```

## Control / data flow

1. The 077 lava handler calls `stepLavaCell` for each due tick with the dimension's range.
2. `affected` positions are re-scheduled at `currentTick + LAVA_FLOW_INTERVAL`.

## Detailed behavior

- Same as the corrected 078 with `spreadRange` in the cap positions: spread proposal `L+1` below
  the range, ground conversion `spreadRange - 1`, decay removal at `spreadRange`. Sources persist; formation needs ≥ 2 horizontal sources; decay guarded by water
  above / lower-level feeder.
- Range semantics: a source spreads at most `spreadRange` blocks horizontally; deeper levels never
  exceed `spreadRange`.
- The engine reuses 078's `WaterWorldAccess`/`WaterStepResult` types (no 078 code changes).

## Failure modes

- Invalid `spreadRange` throws (descriptive); world accessor exceptions propagate.

## Compatibility / migration

Additive. 078 untouched.

## Performance / resource constraints

Same as 078: O(1) reads/writes per step.

## Testing seams

- `tests/unit/LavaFlowEngine.test.ts` (NEW): spread range chains (3 and 7), cap behavior at the
  range boundary, ground conversion to the range level, downward spawn, source formation, decay
  ladder and removal at the range, invalid range rejection, water/lava cross no-ops, determinism.

## Observability / debugging

Same shape as 078: `changed`/`affected` per step.

## Affected files / symbols

- `src/simulation/LavaFlowEngine.ts` — NEW.
- `tests/unit/LavaFlowEngine.test.ts` — NEW.

## Rejected alternatives

- *Generalize 078 into a shared parameterized engine*: churns a verified change; the 084
  regression suite is the designated consolidation point.
- *Copying 078 internals wholesale*: the rule order and types are shared; only the three cap
  positions differ, so the module stays small and reviewable.

## Downstream dependencies

080 water/lava interactions; 084 fixtures over both engines; the world wiring binds lava to 077
with `LAVA_FLOW_INTERVAL` and per-dimension ranges.
